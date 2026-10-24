"""メンバー招待（招待リンクの発行 → 確認 → 参加）。"""

import datetime as dt
from dataclasses import replace

from app import deps
from app.main import app
from tests.test_api import create, env, open_with, upload  # noqa: F401  (env は fixture)

A = {"X-User-Id": "alice", "X-User-Email": "alice@example.com"}
B = {"X-User-Id": "bob", "X-User-Email": "bob@example.com"}


def invite(client, cid, headers=A):
    return client.post(f"/capsules/{cid}/invites", headers=headers)


def test_invite_and_join(env):
    client, _, _ = env
    cid = create(client).json()["capsule_id"]

    res = invite(client, cid)
    assert res.status_code == 201, res.text
    token = res.json()["token"]
    assert len(token) >= 20

    # 参加前のボブは、招待の中身だけ見られる（カプセル本体は見られない）
    assert client.get(f"/capsules/{cid}", headers=B).status_code == 403
    preview = client.get(f"/invites/{token}", headers=B).json()
    assert preview["capsule_name"] == "成人式"
    assert preview["people_count"] == 2
    assert preview["members_count"] == 1
    assert preview["already_member"] is False
    assert "key_photo_url" not in preview

    joined = client.post(f"/invites/{token}/accept", headers=B)
    assert joined.status_code == 200, joined.text
    assert joined.json()["role"] == "member"

    # 参加後はカプセルが一覧に出て、中身を追加できる
    assert [c["capsule_id"] for c in client.get("/capsules", headers=B).json()] == [cid]
    assert client.get(f"/capsules/{cid}", headers=B).json()["role"] == "member"
    res = client.post(f"/capsules/{cid}/contents", json={"type": "message", "text": "ボブより"}, headers=B)
    assert res.status_code == 201

    members = client.get(f"/capsules/{cid}/members", headers=B).json()
    assert [(m["user_id"], m["role"], m["email"]) for m in members] == [
        ("alice", "owner", None),  # create() はメールのヘッダーを付けずに作っている
        ("bob", "member", "bob@example.com"),
    ]
    assert client.get(f"/invites/{token}", headers=B).json()["already_member"] is True


def test_member_can_open_and_see_others_messages(env):
    client, _, _ = env
    cid = create(client).json()["capsule_id"]
    client.post(f"/capsules/{cid}/contents", json={"type": "message", "text": "アリスより"}, headers=A)
    token = invite(client, cid).json()["token"]
    client.post(f"/invites/{token}/accept", headers=B)

    res = open_with(client, cid, user="bob").json()
    assert res["ok"] is True
    assert [c["text"] for c in res["opened"]["contents"]] == ["アリスより"]


def test_accept_twice_and_owner_accepting_is_harmless(env):
    client, _, _ = env
    cid = create(client).json()["capsule_id"]
    token = invite(client, cid).json()["token"]
    assert client.post(f"/invites/{token}/accept", headers=B).status_code == 200
    assert client.post(f"/invites/{token}/accept", headers=B).status_code == 200
    # 作成者が自分のリンクを開いても、役割は owner のまま
    assert client.post(f"/invites/{token}/accept", headers=A).json()["role"] == "owner"
    assert len(client.get(f"/capsules/{cid}/members", headers=A).json()) == 2


def test_only_owner_can_invite(env):
    client, _, _ = env
    cid = create(client).json()["capsule_id"]
    token = invite(client, cid).json()["token"]
    client.post(f"/invites/{token}/accept", headers=B)
    res = invite(client, cid, headers=B)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "not_owner"
    # メンバーでない人は招待以前にカプセルに触れない
    assert invite(client, cid, headers={"X-User-Id": "mallory"}).json()["error"]["code"] == "not_member"


def test_unknown_and_expired_invite(env):
    client, _, settings = env
    res = client.get("/invites/nope", headers=B)
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "invite_not_found"

    cid = create(client).json()["capsule_id"]
    app.dependency_overrides[deps.settings_dep] = lambda: replace(settings, invite_days=-1)
    token = invite(client, cid).json()["token"]
    for res in (client.get(f"/invites/{token}", headers=B), client.post(f"/invites/{token}/accept", headers=B)):
        assert res.status_code == 410
        assert res.json()["error"]["code"] == "invite_expired"


def test_join_after_opened_still_needs_pose(env):
    # 開封済みでも参加できるが、中身を見るには自分でポーズを解除する必要がある
    client, _, _ = env
    cid = create(client).json()["capsule_id"]
    token = invite(client, cid).json()["token"]
    assert open_with(client, cid).json()["ok"] is True

    assert client.post(f"/invites/{token}/accept", headers=B).status_code == 200
    res = client.get(f"/capsules/{cid}/contents", headers=B)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unlock_required"
    assert invite(client, cid).status_code == 201


def test_expires_at_is_in_the_future_by_default(env):
    client, _, _ = env
    cid = create(client).json()["capsule_id"]
    expires = dt.datetime.fromisoformat(invite(client, cid).json()["expires_at"])
    days = (expires - dt.datetime.now(dt.timezone.utc)).days
    assert 13 <= days <= 14


def test_invite_preview_is_public_but_accept_requires_login_in_cognito_mode(env):
    client, _, settings = env
    cid = create(client).json()["capsule_id"]
    token = invite(client, cid).json()["token"]
    app.dependency_overrides[deps.settings_dep] = lambda: replace(
        settings,
        auth_mode="cognito",
    )

    preview = client.get(f"/invites/{token}")
    assert preview.status_code == 200
    assert preview.json()["capsule_name"] == "成人式"
    assert preview.json()["already_member"] is False

    accepted = client.post(f"/invites/{token}/accept")
    assert accepted.status_code == 401
    assert accepted.json()["error"]["code"] == "login_required"
