"""開封時の顔の判定と、顔の記憶の更新（API 経由）。顔のモデルは偽物に差し替える。"""

from app import deps
from app.main import app
from app.pose.angles import Landmark, PersonPose
from app.pose.face import Face, FaceConfig
from tests.test_api import BASE, create, env, open_with  # noqa: F401  (env は fixture)
from tests.test_face import A, A_OLDER, B, STRANGER

SIZE = 64  # テストで上げる画像（白い PNG）の大きさ


def person_with_head(x: float) -> PersonPose:
    lms = [Landmark(0.5, 0.5, 0.0) for _ in range(33)]
    lms[0] = Landmark(x, 0.3, 1.0)  # 鼻
    return PersonPose(angles=dict(BASE), hip_center_x=x, landmarks=lms)


class FakeFaceEncoder:
    """左から順に、テストが指定した特徴の顔を、その人の頭の位置に置く。None はその人の顔が見えない。"""

    def __init__(self):
        self.embeddings = [A, B]

    def encode(self, image):
        xs = [0.3, 0.7]
        return [Face(box=(x * SIZE - 4, 0.3 * SIZE - 4, 8, 8), embedding=e)
                for x, e in zip(xs, self.embeddings) if e is not None]


def setup(env):
    client, detector, _ = env
    detector.people = [person_with_head(0.3), person_with_head(0.7)]
    faces = FakeFaceEncoder()
    app.dependency_overrides[deps.get_face_encoder] = lambda: faces
    app.dependency_overrides[deps.get_face_config] = lambda: FaceConfig(memory=2)
    return client, faces


def memory_of(capsule_id):
    repo = app.dependency_overrides[deps.get_repository]()
    return [p["faces"] for p in repo.get_capsule(capsule_id)["key_pose"]["people"]]


def test_key_photo_faces_become_memory(env):
    client, _ = setup(env)
    cap = create(client).json()
    assert [g["face_registered"] for g in cap["guide"]] == [True, True]
    assert [len(m) for m in memory_of(cap["capsule_id"])] == [1, 1]


def test_same_people_open_and_memory_grows(env):
    client, faces = setup(env)
    cid = create(client).json()["capsule_id"]
    faces.embeddings = [A_OLDER, B]
    res = open_with(client, cid).json()
    assert res["ok"] is True
    assert [f["ok"] for f in res["result"]["faces"]] == [True, True]
    # 開けるたびに覚える。鍵の写真の顔は残し、開けたときの顔は新しい2件（memory=2）だけ
    for _ in range(3):
        open_with(client, cid)
    sources = [[m["source"] for m in mem] for mem in memory_of(cid)]
    assert sources == [["key", "open", "open"], ["key", "open", "open"]]


def test_stranger_with_same_pose_cannot_open(env):
    client, faces = setup(env)
    cid = create(client).json()["capsule_id"]
    faces.embeddings = [A, STRANGER]
    res = open_with(client, cid).json()
    assert res["ok"] is False
    assert res["result"]["reason"] == "face_mismatch"
    assert "右の人の顔" in res["result"]["message"]
    assert res["unlock"] is None
    # 失敗したときは覚えない
    assert [len(m) for m in memory_of(cid)] == [1, 1]


def test_hidden_face_cannot_open(env):
    client, faces = setup(env)
    app.dependency_overrides[deps.get_face_config] = lambda: FaceConfig(memory=2, max_hidden=0)
    cid = create(client).json()["capsule_id"]
    faces.embeddings = [A, None]
    res = open_with(client, cid).json()
    assert res["result"]["reason"] == "face_not_visible"


def test_one_hidden_face_is_allowed_by_default(env):
    # 既定では、横を向くなどで顔が見えない人が1人までなら開く
    client, faces = setup(env)
    cid = create(client).json()["capsule_id"]
    faces.embeddings = [A, None]
    assert open_with(client, cid).json()["ok"] is True


def test_faces_not_checked_when_pose_fails(env):
    client, faces = setup(env)
    cid = create(client).json()["capsule_id"]
    _, detector, _ = env
    detector.people = [person_with_head(0.5)]
    res = open_with(client, cid).json()
    assert res["result"]["reason"] == "count_mismatch"
    assert res["result"]["faces"] == []


def test_face_check_can_be_turned_off(env):
    client, faces = setup(env)
    cid = create(client).json()["capsule_id"]
    app.dependency_overrides[deps.get_face_encoder] = lambda: None
    faces.embeddings = [STRANGER, STRANGER]
    assert open_with(client, cid).json()["ok"] is True
