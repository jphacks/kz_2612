"""メンバー招待（PRD F-3）。

作成者が招待リンクを発行し、リンクを開いた人がログインして参加するとメンバーになる。
リンクは期限まで何人でも使える（結婚式のゲスト全員に同じリンクを配る想定）。
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import secrets

from fastapi import APIRouter, Depends

from app.deps import current_user, get_repository, settings_dep
from app.errors import ApiError
from app.repository import Repository
from app.routers.capsules import ERRORS, _get_capsule_for_member, _now, _parse_dt, _summary, _today_jst
from app.schemas import CapsuleSummary, ErrorResponse, InviteCreated, InvitePreview, MemberOut
from app.settings import Settings

router = APIRouter(tags=["invites"])
log = logging.getLogger("emo")

INVITE_ERRORS = {
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    410: {"model": ErrorResponse},
}


def _valid_invite(repo: Repository, token: str) -> tuple[dict, dict]:
    invite = repo.get_invite(token)
    if invite is None:
        raise ApiError(404, "invite_not_found", "招待リンクが見つからなかったよ。もう一度リンクをもらってね")
    expires_at = _parse_dt(invite["expires_at"])
    if expires_at is None or expires_at <= _now():
        raise ApiError(410, "invite_expired", "招待リンクの期限が切れちゃった。新しいリンクをもらってね")
    capsule = repo.get_capsule(invite["capsule_id"])
    if capsule is None:
        raise ApiError(404, "capsule_not_found", "カプセルが見つからなかったよ")
    return invite, capsule


@router.post(
    "/capsules/{capsule_id}/invites",
    response_model=InviteCreated,
    status_code=201,
    responses={**ERRORS, 409: {"model": ErrorResponse}},
    summary="招待リンクを発行（作成者のみ）",
)
def create_invite(
    capsule_id: str,
    user: dict = Depends(current_user),
    repo: Repository = Depends(get_repository),
    settings: Settings = Depends(settings_dep),
) -> InviteCreated:
    capsule, member = _get_capsule_for_member(repo, capsule_id, user["user_id"])
    if member["role"] != "owner":
        raise ApiError(403, "not_owner", "招待リンクを作れるのは、カプセルを作った人だけだよ")
    if capsule["status"] == "opened":
        raise ApiError(409, "already_opened", "このカプセルはもう開いたので、新しく招待できないよ")

    expires_at = _now() + dt.timedelta(days=settings.invite_days)
    invite = {
        # 推測されないよう十分長いランダム値にする（URL にそのまま入れられる文字だけ）
        "token": secrets.token_urlsafe(16),
        "capsule_id": capsule_id,
        "created_by": user["user_id"],
        "created_at": _now().isoformat(),
        "expires_at": expires_at.isoformat(),
    }
    repo.create_invite(invite)
    log.info(json.dumps({"event": "invite_created", "capsule_id": capsule_id}))
    return InviteCreated(token=invite["token"], expires_at=expires_at)


@router.get(
    "/invites/{token}",
    response_model=InvitePreview,
    responses=INVITE_ERRORS,
    summary="招待リンクの中身を確認（参加前でも見られる）",
)
def get_invite(
    token: str,
    user: dict = Depends(current_user),
    repo: Repository = Depends(get_repository),
) -> InvitePreview:
    invite, capsule = _valid_invite(repo, token)
    open_date = dt.date.fromisoformat(capsule["open_date"])
    return InvitePreview(
        capsule_id=capsule["capsule_id"],
        capsule_name=capsule["name"],
        open_date=open_date,
        days_until_open=max(0, (open_date - _today_jst()).days),
        people_count=len(capsule["key_pose"]["people"]),
        members_count=len(repo.list_members(capsule["capsule_id"])),
        invited_by=invite["created_by"],
        expires_at=invite["expires_at"],
        already_member=repo.get_member(capsule["capsule_id"], user["user_id"]) is not None,
    )


@router.post(
    "/invites/{token}/accept",
    response_model=CapsuleSummary,
    responses=INVITE_ERRORS,
    summary="招待リンクから参加する",
)
def accept_invite(
    token: str,
    user: dict = Depends(current_user),
    repo: Repository = Depends(get_repository),
) -> CapsuleSummary:
    _, capsule = _valid_invite(repo, token)
    capsule_id = capsule["capsule_id"]
    existing = repo.get_member(capsule_id, user["user_id"])
    if existing:
        # 2回押しても、作成者が自分のリンクを開いてもエラーにしない
        return _summary(capsule, existing["role"])
    if capsule["status"] == "opened":
        # 開封後に参加できると、リンクを知っているだけで中身が見られてしまう
        raise ApiError(409, "already_opened", "このカプセルはもう開いちゃったので、参加できないよ")

    repo.add_member(capsule_id, user["user_id"], "member", user.get("email"))
    log.info(json.dumps({"event": "member_joined", "capsule_id": capsule_id}))
    return _summary(capsule, "member")


@router.get(
    "/capsules/{capsule_id}/members",
    response_model=list[MemberOut],
    responses=ERRORS,
    summary="メンバー一覧",
)
def list_members(
    capsule_id: str,
    user: dict = Depends(current_user),
    repo: Repository = Depends(get_repository),
) -> list[MemberOut]:
    _get_capsule_for_member(repo, capsule_id, user["user_id"])
    members = repo.list_members(capsule_id)
    # 作成者を先頭に
    return [MemberOut(**m) for m in sorted(members, key=lambda m: m["role"] != "owner")]
