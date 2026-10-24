"""カプセルの作成（鍵の抽出）・中身の登録・エモ認証による開封・ライブラリ・認証アルバム。

カプセルは「ポーズで開ける共有アルバム」。ポーズが一致すると解除セッション（X-Unlock-Token）を発行し、
その間だけライブラリ（中身の閲覧・削除、認証アルバム）を使える。入るたびにポーズで解除する。
"""

from __future__ import annotations

import datetime as dt
import io
import json
import logging
import secrets
import time
import uuid

from fastapi import APIRouter, Depends, Header, Response
from PIL import Image

from app.deps import (
    current_user,
    get_detector,
    get_face_config,
    get_face_encoder,
    get_match_config,
    get_repository,
    get_storage,
    settings_dep,
)
from app.errors import ApiError
from app.pose.angles import PersonPose
from app.pose.config import MatchConfig
from app.pose.base import Detector, PoseExtractionError, draw_overlay, load_image
from app.pose.face import FaceConfig, FaceEncoder, assign_faces, match_faces, new_memory, update_memory
from app.pose.matcher import match_poses
from app.repository import Repository
from app.routers.uploads import upload_prefix
from app.schemas import (
    AddContentRequest,
    AlbumEntry,
    AlbumResponse,
    CapsuleDetail,
    CapsuleSummary,
    ContentMeta,
    ContentView,
    CreateCapsuleRequest,
    ErrorResponse,
    GuidePerson,
    OpenedContents,
    OpenRequest,
    OpenResponse,
    UnlockSession,
)
from app.settings import Settings
from app.storage import Storage

router = APIRouter(prefix="/capsules", tags=["capsules"])
log = logging.getLogger("emo")

JST = dt.timezone(dt.timedelta(hours=9))
# 失敗回数に数えるのは「揃って撮ったのに違った」ときだけ。誰も写っていない・体が切れているのは数えない
COUNTED_FAILURES = ("count_mismatch", "pose_mismatch", "face_mismatch")

ERRORS = {
    400: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
}
UNLOCK_ERRORS = {**ERRORS, 401: {"model": ErrorResponse}}


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _today_jst() -> dt.date:
    return _now().astimezone(JST).date()


def _parse_dt(value: str | None) -> dt.datetime | None:
    return dt.datetime.fromisoformat(value) if value else None


def _load_uploaded_image(storage: Storage, settings: Settings, key: str, prefix: str) -> Image.Image:
    if not key.startswith(prefix) or ".." in key:
        raise ApiError(400, "invalid_s3_key", "この画像は使えないみたい。もう一度アップロードしてね")
    size = storage.size(key)
    if size is None:
        raise ApiError(404, "upload_not_found", "画像が見つからなかったよ。アップロードが終わってから送ってね")
    if size > settings.max_upload_bytes:
        raise ApiError(413, "image_too_large", "画像が大きすぎるみたい。10MBまでにしてね")
    try:
        return load_image(storage.get_bytes(key))
    except Exception as e:  # Pillow が読めない形式
        raise ApiError(400, "invalid_image", "画像を読み込めなかったよ。JPEGかPNGで送ってね") from e


def _get_capsule_for_member(repo: Repository, capsule_id: str, user_id: str) -> tuple[dict, dict]:
    capsule = repo.get_capsule(capsule_id)
    if capsule is None:
        raise ApiError(404, "capsule_not_found", "カプセルが見つからなかったよ")
    member = repo.get_member(capsule_id, user_id)
    if member is None:
        raise ApiError(403, "not_member", "このカプセルのメンバーではないみたい")
    return capsule, member


def _locked_until(capsule: dict, settings: Settings) -> dt.datetime | None:
    if settings.max_failures <= 0:
        return None  # ロックしない設定なら、前にかかったロックも無視する
    until = _parse_dt(capsule.get("locked_until"))
    return until if until and until > _now() else None


def _open_date(capsule: dict) -> dt.date | None:
    return dt.date.fromisoformat(capsule["open_date"]) if capsule.get("open_date") else None


def _days_until(open_date: dt.date | None) -> int | None:
    return None if open_date is None else max(0, (open_date - _today_jst()).days)


def _summary(capsule: dict, role: str) -> CapsuleSummary:
    open_date = _open_date(capsule)
    return CapsuleSummary(
        capsule_id=capsule["capsule_id"],
        name=capsule["name"],
        open_date=open_date,
        days_until_open=_days_until(open_date),
        status=capsule["status"],
        people_count=len(capsule["key_pose"]["people"]),
        role=role,
    )


def _is_open_day(capsule: dict, settings: Settings) -> bool:
    open_date = _open_date(capsule)
    return open_date is None or settings.ignore_open_date or _today_jst() >= open_date


def _attempts_left(settings: Settings, fail_count: int, locked_until: dt.datetime | None) -> int | None:
    if settings.max_failures <= 0:
        return None  # ロックしない設定
    return 0 if locked_until else max(0, settings.max_failures - fail_count)


def _require_unlock(repo: Repository, capsule_id: str, user_id: str, token: str | None) -> dict:
    """ポーズで解除した後の閲覧セッションを確かめる。トークンは解除した本人・そのカプセルにだけ有効。"""
    if not token:
        raise ApiError(401, "unlock_required", "みんなでポーズをそろえて、ロックを解除してね")
    session = repo.get_unlock_session(token)
    if session is None or session["capsule_id"] != capsule_id or session["user_id"] != user_id:
        raise ApiError(401, "unlock_required", "みんなでポーズをそろえて、ロックを解除してね")
    expires_at = _parse_dt(session.get("expires_at"))
    if expires_at is not None and expires_at <= _now():
        raise ApiError(401, "unlock_expired", "解除の時間が終わったよ。もう一度ポーズでロックを解除してね")
    return session


def _detail(capsule: dict, role: str, repo: Repository, storage: Storage, settings: Settings) -> CapsuleDetail:
    expires = settings.view_url_expires
    locked_until = _locked_until(capsule, settings)
    return CapsuleDetail(
        **_summary(capsule, role).model_dump(),
        key_photo_url=storage.presign_get(capsule["key_photo_key"], expires),
        preview_url=storage.presign_get(capsule["preview_key"], expires) if capsule.get("preview_key") else None,
        url_expires_in=expires,
        guide=[
            GuidePerson(position=i, angles=p["angles"], points=p.get("points", {}), face_registered=bool(p.get("faces")))
            for i, p in enumerate(capsule["key_pose"]["people"])
        ],
        can_open_now=_is_open_day(capsule, settings) and locked_until is None,
        locked_until=locked_until,
        attempts_left=_attempts_left(settings, capsule.get("fail_count", 0), locked_until),
        contents_count=len(repo.list_contents(capsule["capsule_id"])),
        opened_at=_parse_dt(capsule.get("opened_at")),
    )


@router.post(
    "",
    response_model=CapsuleDetail,
    status_code=201,
    summary="カプセルを作成し、思い出の写真から鍵のポーズを抽出",
    responses={**ERRORS, 413: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def create_capsule(
    body: CreateCapsuleRequest,
    user: dict = Depends(current_user),
    repo: Repository = Depends(get_repository),
    storage: Storage = Depends(get_storage),
    detector: Detector = Depends(get_detector),
    face_encoder: FaceEncoder | None = Depends(get_face_encoder),
    settings: Settings = Depends(settings_dep),
) -> CapsuleDetail:
    image = _load_uploaded_image(storage, settings, body.key_photo_s3_key, upload_prefix(user["user_id"], "key"))
    try:
        people = detector.extract_key(image)
    except PoseExtractionError as e:
        raise ApiError(422, e.code, e.message, detected_people=e.detected_people) from e
    # 鍵の写真の顔を、その人の最初の「顔の記憶」にする（顔が見えない人は、最初に開けたときの顔から覚える）
    faces = (assign_faces(people, face_encoder.encode(image), image.width, image.height)
             if face_encoder else [None] * len(people))

    capsule_id = uuid.uuid4().hex[:12]
    preview = io.BytesIO()
    draw_overlay(image, people).save(preview, format="JPEG", quality=85)
    preview_key = f"previews/{capsule_id}.jpg"
    storage.put_bytes(preview_key, preview.getvalue(), "image/jpeg")

    capsule = {
        "capsule_id": capsule_id,
        "name": body.name,
        "owner_id": user["user_id"],
        "open_date": body.open_date.isoformat() if body.open_date else None,
        "key_photo_key": body.key_photo_s3_key,
        "preview_key": preview_key,
        # 鍵として保存するのは、点の位置・関節角度と、顔の特徴の数字（顔の画像は保存しない）
        "key_pose": {"version": 1, "people": [
            {**p.to_dict(), "points": p.guide_points(), "faces": new_memory(f)} for p, f in zip(people, faces)
        ]},
        "status": "locked",
        "fail_count": 0,
        "locked_until": None,
        "created_at": _now().isoformat(),
        "opened_at": None,
    }
    repo.create_capsule(capsule)
    repo.add_member(capsule_id, user["user_id"], "owner", user.get("email"))
    log.info(json.dumps({"event": "capsule_created", "capsule_id": capsule_id, "people": len(people),
                         "faces": sum(f is not None for f in faces)}))
    return _detail(capsule, "owner", repo, storage, settings)


@router.get("", response_model=list[CapsuleSummary], summary="自分のカプセル一覧")
def list_capsules(user: dict = Depends(current_user), repo: Repository = Depends(get_repository)):
    summaries = []
    for m in repo.list_memberships(user["user_id"]):
        capsule = repo.get_capsule(m["capsule_id"])
        if capsule:
            summaries.append(_summary(capsule, m["role"]))
    # 開封日の近い順。開封日のないカプセルは後ろ
    return sorted(summaries, key=lambda s: (s.open_date is None, s.open_date or dt.date.max))


@router.get("/{capsule_id}", response_model=CapsuleDetail, responses=ERRORS, summary="カプセルの詳細（中身は含まない）")
def get_capsule(
    capsule_id: str,
    user: dict = Depends(current_user),
    repo: Repository = Depends(get_repository),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(settings_dep),
) -> CapsuleDetail:
    capsule, member = _get_capsule_for_member(repo, capsule_id, user["user_id"])
    return _detail(capsule, member["role"], repo, storage, settings)


@router.post(
    "/{capsule_id}/contents",
    response_model=ContentMeta,
    status_code=201,
    responses=ERRORS,
    summary="中身（写真・メッセージ）を追加（メンバーならいつでも）",
)
def add_content(
    capsule_id: str,
    body: AddContentRequest,
    user: dict = Depends(current_user),
    repo: Repository = Depends(get_repository),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(settings_dep),
) -> ContentMeta:
    # 追加は中身を見せないので解除は不要（作成時の登録も、解除後のライブラリからの追加もこれを使う）
    _get_capsule_for_member(repo, capsule_id, user["user_id"])

    if body.type == "message":
        if not body.text or not body.text.strip():
            raise ApiError(400, "text_required", "メッセージを書いてね")
    else:
        if not body.s3_key:
            raise ApiError(400, "s3_key_required", "写真をアップロードしてね")
        _load_uploaded_image(storage, settings, body.s3_key, upload_prefix(user["user_id"], "content"))

    content = {
        "capsule_id": capsule_id,
        "content_id": uuid.uuid4().hex[:12],
        "type": body.type,
        "text": body.text if body.type == "message" else None,
        "s3_key": body.s3_key if body.type == "photo" else None,
        "author_id": user["user_id"],
        "created_at": _now().isoformat(),
    }
    repo.add_content(content)
    return ContentMeta(**content)


def _content_views(repo: Repository, storage: Storage, capsule_id: str, expires: int) -> list[ContentView]:
    return [
        ContentView(
            content_id=c["content_id"],
            type=c["type"],
            author_id=c["author_id"],
            created_at=c["created_at"],
            text=c.get("text"),
            url=storage.presign_get(c["s3_key"], expires) if c.get("s3_key") else None,
        )
        for c in repo.list_contents(capsule_id)
    ]


@router.post(
    "/{capsule_id}/open",
    response_model=OpenResponse,
    responses={**ERRORS, 409: {"model": ErrorResponse}, 413: {"model": ErrorResponse}, 423: {"model": ErrorResponse}},
    summary="エモ認証で開封（ポーズ照合）",
)
def open_capsule(
    capsule_id: str,
    body: OpenRequest,
    user: dict = Depends(current_user),
    repo: Repository = Depends(get_repository),
    storage: Storage = Depends(get_storage),
    detector: Detector = Depends(get_detector),
    config: MatchConfig = Depends(get_match_config),
    face_encoder: FaceEncoder | None = Depends(get_face_encoder),
    face_config: FaceConfig = Depends(get_face_config),
    settings: Settings = Depends(settings_dep),
) -> OpenResponse:
    started = time.perf_counter()
    capsule, _ = _get_capsule_for_member(repo, capsule_id, user["user_id"])

    if not _is_open_day(capsule, settings):
        raise ApiError(409, "not_open_yet", f"開けられるのは {capsule['open_date']} からだよ。その日まで楽しみにしててね",
                       open_date=capsule["open_date"])
    locked_until = _locked_until(capsule, settings)
    if locked_until:
        raise ApiError(423, "locked", "たくさん試したので少しお休み。時間をおいてまた挑戦してね",
                       locked_until=locked_until.isoformat())

    image = _load_uploaded_image(storage, settings, body.s3_key, upload_prefix(user["user_id"], "attempt"))
    key_people = [PersonPose.from_dict(p) for p in capsule["key_pose"]["people"]]
    attempt_people = detector.detect(image)
    result = match_poses(key_people, attempt_people, config)

    # ポーズが合ったら、顔も当時の人（と、これまで開けたときの顔）と比べる
    attempt_faces: list = []
    if result.ok and face_encoder:
        attempt_faces = assign_faces(sorted(attempt_people, key=lambda p: p.hip_center_x),
                                     face_encoder.encode(image), image.width, image.height)
        if result.mirrored:
            attempt_faces = attempt_faces[::-1]  # 鍵の何番目の人に対応するかにそろえる
        memories = [p.get("faces", []) for p in capsule["key_pose"]["people"]]
        face_result = match_faces(memories, attempt_faces, face_config)
        result.faces = [p.to_dict() for p in face_result.people]
        if not face_result.ok:
            result.ok, result.reason, result.message = False, face_result.reason, face_result.message

    if not result.ok:
        # 開けられなかったときの撮影画像も、フォルダを消すときに一緒に消せるよう記録しておく
        repo.add_attempt_ref(capsule_id, body.s3_key, _now().isoformat())

    fields: dict = {}
    fail_count = capsule.get("fail_count", 0)
    if result.ok:
        fail_count = 0
        fields = {"status": "opened", "fail_count": 0, "locked_until": None}
        if not capsule.get("opened_at"):
            fields["opened_at"] = _now().isoformat()
        if attempt_faces:
            # 開けたときの顔を記憶に加える。開けるたびに今の顔へ更新されていくので、年月で顔が変わってもついていける
            key_pose = capsule["key_pose"]
            key_pose["people"] = [
                {**p, "faces": update_memory(p.get("faces", []), f, face_config.memory)}
                for p, f in zip(key_pose["people"], attempt_faces)
            ]
            fields["key_pose"] = key_pose
        repo.add_open_record({
            "capsule_id": capsule_id, "opened_at": _now().isoformat(), "photo_key": body.s3_key,
            "score": result.score, "user_id": user["user_id"],
        })
    elif result.reason in COUNTED_FAILURES:
        fail_count += 1
        if settings.max_failures > 0 and fail_count >= settings.max_failures:
            locked_until = _now() + dt.timedelta(minutes=settings.lock_minutes)
            fields = {"fail_count": 0, "locked_until": locked_until.isoformat()}
            fail_count = settings.max_failures
        else:
            fields = {"fail_count": fail_count}
    if fields:
        repo.update_capsule(capsule_id, fields)

    log.info(json.dumps({
        "event": "open_attempt",
        "capsule_id": capsule_id,
        "detected_people": result.detected_people,
        "point_diffs": [p.mean_point_diff and round(p.mean_point_diff, 2) for p in result.people],
        "face_similarity": [f["similarity"] for f in result.faces],
        "ok": result.ok,
        "reason": result.reason,
        "fail_count": fail_count,
        "locked": locked_until is not None,
        "ms": round((time.perf_counter() - started) * 1000),
    }))

    opened = unlock = None
    if result.ok:
        expires = settings.view_url_expires
        opened = OpenedContents(
            key_photo_url=storage.presign_get(capsule["key_photo_key"], expires),
            attempt_photo_url=storage.presign_get(body.s3_key, expires),
            contents=_content_views(repo, storage, capsule_id, expires),
            url_expires_in=expires,
        )
        unlock_expires = _now() + dt.timedelta(minutes=settings.unlock_minutes) if settings.unlock_minutes > 0 else None
        unlock = UnlockSession(token=secrets.token_urlsafe(24), expires_at=unlock_expires)
        session = {"token": unlock.token, "capsule_id": capsule_id, "user_id": user["user_id"],
                   "expires_at": unlock_expires.isoformat() if unlock_expires else None}
        if unlock_expires:
            session["ttl"] = int(unlock_expires.timestamp())
        repo.create_unlock_session(session)
    return OpenResponse(
        ok=result.ok,
        result=result.to_dict(),
        attempts_left=_attempts_left(settings, fail_count, locked_until),
        locked_until=locked_until,
        opened=opened,
        unlock=unlock,
    )


@router.get(
    "/{capsule_id}/contents",
    response_model=OpenedContents,
    responses=UNLOCK_ERRORS,
    summary="ライブラリ（中身の一覧と閲覧URL）。解除中のみ。URLが切れたら呼び直す",
)
def list_contents(
    capsule_id: str,
    user: dict = Depends(current_user),
    x_unlock_token: str | None = Header(default=None),
    repo: Repository = Depends(get_repository),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(settings_dep),
) -> OpenedContents:
    capsule, _ = _get_capsule_for_member(repo, capsule_id, user["user_id"])
    _require_unlock(repo, capsule_id, user["user_id"], x_unlock_token)
    records = repo.list_open_records(capsule_id)
    expires = settings.view_url_expires
    return OpenedContents(
        key_photo_url=storage.presign_get(capsule["key_photo_key"], expires),
        attempt_photo_url=storage.presign_get(records[-1]["photo_key"], expires),
        contents=_content_views(repo, storage, capsule_id, expires),
        url_expires_in=expires,
    )


@router.get(
    "/{capsule_id}/album",
    response_model=AlbumResponse,
    responses=UNLOCK_ERRORS,
    summary="認証アルバム（開封に成功したときの写真）。解除中のみ",
)
def get_album(
    capsule_id: str,
    user: dict = Depends(current_user),
    x_unlock_token: str | None = Header(default=None),
    repo: Repository = Depends(get_repository),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(settings_dep),
) -> AlbumResponse:
    capsule, _ = _get_capsule_for_member(repo, capsule_id, user["user_id"])
    _require_unlock(repo, capsule_id, user["user_id"], x_unlock_token)
    expires = settings.view_url_expires
    return AlbumResponse(
        key_photo_url=storage.presign_get(capsule["key_photo_key"], expires),
        entries=[
            AlbumEntry(opened_at=r["opened_at"], photo_url=storage.presign_get(r["photo_key"], expires), score=r["score"])
            for r in repo.list_open_records(capsule_id)
        ],
        url_expires_in=expires,
    )


@router.delete(
    "/{capsule_id}/contents/{content_id}",
    status_code=204,
    responses=UNLOCK_ERRORS,
    summary="中身を削除（解除中のみ。フォルダの参加者なら誰の写真でも消せる）",
)
def delete_content(
    capsule_id: str,
    content_id: str,
    user: dict = Depends(current_user),
    x_unlock_token: str | None = Header(default=None),
    repo: Repository = Depends(get_repository),
    storage: Storage = Depends(get_storage),
) -> Response:
    _get_capsule_for_member(repo, capsule_id, user["user_id"])
    _require_unlock(repo, capsule_id, user["user_id"], x_unlock_token)
    content = repo.get_content(capsule_id, content_id)
    if content is None:
        raise ApiError(404, "content_not_found", "その写真は見つからなかったよ。もう消えているかも")
    # 共有フォルダなので、参加者なら誰が追加した写真でも消せる
    repo.delete_content(content)
    if content.get("s3_key"):
        storage.delete(content["s3_key"])
    log.info(json.dumps({"event": "content_deleted", "capsule_id": capsule_id}))
    return Response(status_code=204)


# フォルダを消すとき、アイテムのどの項目に画像（S3）のキーが入っているか
_S3_KEY_FIELDS = {
    "Capsule": ("key_photo_key", "preview_key"),
    "Content": ("s3_key",),
    "OpenRecord": ("photo_key",),
    "AttemptRef": ("s3_key",),
}


@router.delete(
    "/{capsule_id}",
    status_code=204,
    responses=ERRORS,
    summary="フォルダを削除（参加者なら誰でも）。鍵の写真・中身・認証まわりのデータをすべて消す",
)
def delete_capsule(
    capsule_id: str,
    user: dict = Depends(current_user),
    repo: Repository = Depends(get_repository),
    storage: Storage = Depends(get_storage),
) -> Response:
    _get_capsule_for_member(repo, capsule_id, user["user_id"])
    # DynamoDB: フォルダ本体（鍵のポーズ・顔の記憶）、メンバー、中身、開封記録、撮影の記録、招待、解除セッション
    items = repo.delete_capsule(capsule_id)
    # S3: 鍵の写真、骨格プレビュー、中身の写真、開けたとき・開けられなかったときの撮影画像
    keys = {item[f] for item in items for f in _S3_KEY_FIELDS.get(item.get("entity", ""), ()) if item.get(f)}
    failed = 0
    for key in keys:
        try:
            storage.delete(key)
        except Exception:  # 1つ消せなくても残りは消す（バケットは非公開なので見られることはない）
            failed += 1
            log.exception("failed to delete s3 object")
    log.info(json.dumps({"event": "capsule_deleted", "capsule_id": capsule_id,
                         "items": len(items), "objects": len(keys), "failed_objects": failed}))
    return Response(status_code=204)
