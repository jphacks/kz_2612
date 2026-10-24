"""API の一連の流れ（作成 → 中身追加 → 開封 → アルバム）。姿勢推定は偽物に差し替える。"""

import datetime as dt
import io
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import deps
from app.main import app
from app.pose.angles import PersonPose
from app.pose.detector import PoseExtractionError
from app.repository import JsonItemStore, Repository
from app.settings import Settings
from app.storage import LocalStorage

BASE = {
    "left_elbow": 90.0, "right_elbow": 170.0, "left_shoulder": 45.0,
    "right_shoulder": 120.0, "left_knee": 175.0, "right_knee": 160.0,
}
TODAY = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()


def pose(x: float, **overrides) -> PersonPose:
    return PersonPose(angles={**BASE, **overrides}, hip_center_x=x)


class FakeDetector:
    """画像の中身ではなく、テストが指定したポーズを返す。"""

    def __init__(self):
        self.people: list[PersonPose] = [pose(0.3), pose(0.7)]

    def detect(self, image):
        return self.people

    def extract_key(self, image):
        if not self.people:
            raise PoseExtractionError("no_person", "人が見つからなかったよ。別の写真を選んでみて", 0)
        return self.people


@pytest.fixture
def env(tmp_path):
    settings = Settings(local_data_dir=str(tmp_path), public_base_url="http://testserver")
    detector = FakeDetector()
    app.dependency_overrides = {
        deps.settings_dep: lambda: settings,
        deps.get_storage: lambda: storage,
        deps.get_repository: lambda: repo,
        deps.get_detector: lambda: detector,
        # 顔の判定は test_face_api.py で偽物に差し替えて試す。ここでは切っておく
        deps.get_face_encoder: lambda: None,
    }
    storage = LocalStorage(tmp_path, "http://testserver")
    repo = Repository(JsonItemStore(None))
    client = TestClient(app)
    yield client, detector, settings
    app.dependency_overrides = {}


def png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), "white").save(buf, format="PNG")
    return buf.getvalue()


def upload(client, purpose: str, user: str = "alice") -> str:
    res = client.post("/uploads", json={"purpose": purpose, "content_type": "image/png"}, headers={"X-User-Id": user})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["s3_key"].startswith(f"uploads/{user}/{purpose}/")
    put = client.put(body["upload_url"], content=png(), headers=body["headers"])
    assert put.status_code == 200, put.text
    return body["s3_key"]


def create(client, open_date=TODAY, user="alice"):
    key = upload(client, "key", user)
    return client.post(
        "/capsules",
        json={"name": "成人式", "open_date": open_date.isoformat(), "key_photo_s3_key": key},
        headers={"X-User-Id": user},
    )


def open_with(client, capsule_id: str, user="alice"):
    key = upload(client, "attempt", user)
    return client.post(f"/capsules/{capsule_id}/open", json={"s3_key": key}, headers={"X-User-Id": user})


def test_full_flow(env):
    client, detector, _ = env
    res = create(client)
    assert res.status_code == 201, res.text
    capsule = res.json()
    cid = capsule["capsule_id"]
    assert capsule["people_count"] == 2
    assert capsule["status"] == "locked"
    assert capsule["can_open_now"] is True
    assert capsule["attempts_left"] is None  # 既定はロックなし
    assert set(capsule["guide"][0]["angles"]) == set(BASE)
    assert client.get(capsule["preview_url"]).status_code == 200

    h = {"X-User-Id": "alice"}
    assert client.post(f"/capsules/{cid}/contents", json={"type": "message", "text": "10年後のみんなへ"}, headers=h).status_code == 201
    photo = upload(client, "content")
    assert client.post(f"/capsules/{cid}/contents", json={"type": "photo", "s3_key": photo}, headers=h).status_code == 201

    listed = client.get("/capsules", headers=h).json()
    assert [c["capsule_id"] for c in listed] == [cid]
    detail = client.get(f"/capsules/{cid}", headers=h).json()
    assert detail["contents_count"] == 2
    assert "contents" not in detail  # 開封前に中身は返さない
    res = client.get(f"/capsules/{cid}/contents", headers=h)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unlock_required"

    # ポーズ違い
    detector.people = [pose(0.3), pose(0.7, right_elbow=60.0)]
    res = open_with(client, cid).json()
    assert res["ok"] is False
    assert res["result"]["reason"] == "pose_mismatch"
    assert "右の人の右ひじ" in res["result"]["message"]
    assert res["attempts_left"] is None
    assert res["opened"] is None
    assert res["unlock"] is None

    # 一致
    detector.people = [pose(0.3), pose(0.7)]
    res = open_with(client, cid).json()
    assert res["ok"] is True
    assert res["attempts_left"] is None
    opened = res["opened"]
    assert opened["url_expires_in"] == 60
    texts = [c["text"] for c in opened["contents"] if c["type"] == "message"]
    assert texts == ["10年後のみんなへ"]
    photo_url = next(c["url"] for c in opened["contents"] if c["type"] == "photo")
    assert client.get(photo_url).content == png()

    assert client.get(f"/capsules/{cid}", headers=h).json()["status"] == "opened"

    # 解除セッションでライブラリを使う
    assert res["unlock"]["token"]
    u = {**h, "X-Unlock-Token": res["unlock"]["token"]}
    assert client.get(f"/capsules/{cid}/contents", headers=h).status_code == 401  # トークンなし
    assert len(client.get(f"/capsules/{cid}/contents", headers=u).json()["contents"]) == 2
    album = client.get(f"/capsules/{cid}/album", headers=u).json()
    assert len(album["entries"]) == 1

    # 解除後も写真を追加できる
    more = upload(client, "content")
    assert client.post(f"/capsules/{cid}/contents", json={"type": "photo", "s3_key": more}, headers=h).status_code == 201
    assert len(client.get(f"/capsules/{cid}/contents", headers=u).json()["contents"]) == 3


def unlock(client, cid, user="alice") -> dict:
    res = open_with(client, cid, user).json()
    assert res["ok"], res
    return {"X-User-Id": user, "X-Unlock-Token": res["unlock"]["token"]}


def add_photo(client, cid, user="alice") -> str:
    key = upload(client, "content", user)
    res = client.post(f"/capsules/{cid}/contents", json={"type": "photo", "s3_key": key}, headers={"X-User-Id": user})
    assert res.status_code == 201, res.text
    return res.json()["content_id"]


def test_delete_photo(env, tmp_path):
    client, _, _ = env
    cid = create(client).json()["capsule_id"]
    content_id = add_photo(client, cid)
    u = unlock(client, cid)
    photo_url = client.get(f"/capsules/{cid}/contents", headers=u).json()["contents"][0]["url"]
    assert client.get(photo_url).status_code == 200

    # 解除していないと消せない
    res = client.delete(f"/capsules/{cid}/contents/{content_id}", headers={"X-User-Id": "alice"})
    assert res.status_code == 401

    assert client.delete(f"/capsules/{cid}/contents/{content_id}", headers=u).status_code == 204
    assert client.get(f"/capsules/{cid}/contents", headers=u).json()["contents"] == []
    # 画像そのものも消える
    assert not any((tmp_path / "objects" / "uploads" / "alice" / "content").glob("*"))
    res = client.delete(f"/capsules/{cid}/contents/{content_id}", headers=u)
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "content_not_found"


def test_only_author_or_owner_can_delete(env):
    client, _, _ = env
    cid = create(client).json()["capsule_id"]
    token = client.post(f"/capsules/{cid}/invites", headers={"X-User-Id": "alice"}).json()["token"]
    for user in ("bob", "carol"):
        client.post(f"/invites/{token}/accept", headers={"X-User-Id": user})
    alices = add_photo(client, cid, "alice")
    bobs = add_photo(client, cid, "bob")

    carol = unlock(client, cid, "carol")
    res = client.delete(f"/capsules/{cid}/contents/{bobs}", headers=carol)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "not_author"

    bob = unlock(client, cid, "bob")
    assert client.delete(f"/capsules/{cid}/contents/{alices}", headers=bob).status_code == 403
    assert client.delete(f"/capsules/{cid}/contents/{bobs}", headers=bob).status_code == 204
    # 作成者は誰の写真でも消せる
    other = add_photo(client, cid, "carol")
    assert client.delete(f"/capsules/{cid}/contents/{other}", headers=unlock(client, cid, "alice")).status_code == 204


def test_unlock_token_is_bound_to_user_and_capsule(env):
    client, _, _ = env
    cid = create(client).json()["capsule_id"]
    other = create(client).json()["capsule_id"]
    token = client.post(f"/capsules/{cid}/invites", headers={"X-User-Id": "alice"}).json()["token"]
    client.post(f"/invites/{token}/accept", headers={"X-User-Id": "bob"})
    u = unlock(client, cid)

    # 別のカプセルには使えない
    assert client.get(f"/capsules/{other}/contents", headers=u).status_code == 401
    # 別の人（メンバーでも）には使えない
    stolen = {**u, "X-User-Id": "bob"}
    assert client.get(f"/capsules/{cid}/contents", headers=stolen).status_code == 401


def test_unlock_expires(env):
    client, _, _ = env
    cid = create(client).json()["capsule_id"]
    u = unlock(client, cid)
    assert client.get(f"/capsules/{cid}/contents", headers=u).status_code == 200
    # 期限を過去にずらす
    repo = app.dependency_overrides[deps.get_repository]()
    session = repo.get_unlock_session(u["X-Unlock-Token"])
    repo.create_unlock_session({**session, "token": u["X-Unlock-Token"], "expires_at": "2000-01-01T00:00:00+00:00"})
    res = client.get(f"/capsules/{cid}/contents", headers=u)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unlock_expired"


def test_no_lock_and_no_unlock_expiry_by_default(env):
    client, detector, _ = env
    cid = create(client).json()["capsule_id"]
    assert client.get(f"/capsules/{cid}", headers={"X-User-Id": "alice"}).json()["attempts_left"] is None

    # 何回失敗してもロックしない
    detector.people = [pose(0.5)]
    for _ in range(8):
        res = open_with(client, cid)
        assert res.status_code == 200
        assert res.json()["attempts_left"] is None

    # 解除の期限なし
    detector.people = [pose(0.3), pose(0.7)]
    res = open_with(client, cid).json()
    assert res["unlock"]["expires_at"] is None
    u = {"X-User-Id": "alice", "X-Unlock-Token": res["unlock"]["token"]}
    assert client.get(f"/capsules/{cid}/contents", headers=u).status_code == 200


def test_open_date_is_optional(env):
    client, _, _ = env
    key = upload(client, "key")
    res = client.post("/capsules", json={"name": "いつでも", "key_photo_s3_key": key}, headers={"X-User-Id": "alice"})
    assert res.status_code == 201, res.text
    capsule = res.json()
    assert capsule["open_date"] is None
    assert capsule["days_until_open"] is None
    assert capsule["can_open_now"] is True
    later = create(client, open_date=TODAY + dt.timedelta(days=3)).json()["capsule_id"]
    # 一覧は開封日の近い順、開封日なしは後ろ
    ids = [c["capsule_id"] for c in client.get("/capsules", headers={"X-User-Id": "alice"}).json()]
    assert ids == [later, capsule["capsule_id"]]
    assert open_with(client, capsule["capsule_id"]).json()["ok"] is True


def test_not_open_yet_and_demo_override(env):
    client, _, settings = env
    cid = create(client, open_date=TODAY + dt.timedelta(days=30)).json()["capsule_id"]
    detail = client.get(f"/capsules/{cid}", headers={"X-User-Id": "alice"}).json()
    assert detail["days_until_open"] == 30
    assert detail["can_open_now"] is False
    res = open_with(client, cid)
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "not_open_yet"

    app.dependency_overrides[deps.settings_dep] = lambda: replace(settings, ignore_open_date=True)
    assert open_with(client, cid).json()["ok"] is True


def test_lock_after_five_failures_when_enabled(env):
    client, detector, settings = env
    app.dependency_overrides[deps.settings_dep] = lambda: replace(settings, max_failures=5)
    cid = create(client).json()["capsule_id"]
    detector.people = [pose(0.5)]  # 人数違い
    lefts = [open_with(client, cid).json()["attempts_left"] for _ in range(5)]
    assert lefts == [4, 3, 2, 1, 0]
    res = open_with(client, cid)
    assert res.status_code == 423
    assert res.json()["error"]["code"] == "locked"
    assert client.get(f"/capsules/{cid}", headers={"X-User-Id": "alice"}).json()["can_open_now"] is False


def test_no_person_does_not_count_as_failure(env):
    client, detector, settings = env
    app.dependency_overrides[deps.settings_dep] = lambda: replace(settings, max_failures=5)
    cid = create(client).json()["capsule_id"]
    detector.people = []
    res = open_with(client, cid).json()
    assert res["result"]["reason"] == "no_person"
    assert res["attempts_left"] == 5


def test_other_user_is_rejected(env):
    client, _, _ = env
    cid = create(client).json()["capsule_id"]
    res = client.get(f"/capsules/{cid}", headers={"X-User-Id": "mallory"})
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "not_member"
    assert client.get("/capsules/nope", headers={"X-User-Id": "alice"}).status_code == 404


def test_cannot_use_someone_elses_upload(env):
    client, _, _ = env
    cid = create(client).json()["capsule_id"]
    mallory_key = upload(client, "attempt", user="mallory")
    res = client.post(f"/capsules/{cid}/open", json={"s3_key": mallory_key}, headers={"X-User-Id": "alice"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "invalid_s3_key"


def test_key_photo_without_people(env):
    client, detector, _ = env
    detector.people = []
    res = create(client)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "no_person"


def test_upload_not_found(env):
    client, _, _ = env
    res = client.post(
        "/capsules",
        json={"name": "x", "open_date": TODAY.isoformat(), "key_photo_s3_key": "uploads/alice/key/missing.png"},
        headers={"X-User-Id": "alice"},
    )
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "upload_not_found"


def test_tampered_upload_url_is_rejected(env):
    client, _, _ = env
    body = client.post("/uploads", json={"purpose": "key"}, headers={"X-User-Id": "alice"}).json()
    tampered = body["upload_url"].replace("uploads/alice", "uploads/bob")
    assert client.put(tampered, content=png()).status_code == 403


def test_validation_error_shape(env):
    client, _, _ = env
    res = client.post("/uploads", json={"purpose": "nope"})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "validation_error"
