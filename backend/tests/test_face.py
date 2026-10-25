"""顔の判定の単体テスト（モデルを使わない部分）と、モデルを使う結合テスト。"""

from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app.pose.angles import Landmark, PersonPose
from app.pose.face import (
    DEFAULT_DET_PATH,
    DEFAULT_REC_PATH,
    Face,
    FaceConfig,
    assign_faces,
    match_faces,
    new_memory,
    similarity,
    update_memory,
)

CFG = FaceConfig()


def emb(*values) -> list[float]:
    """似かたを調整しやすいよう、少数の成分から長さ1の特徴を作る。"""
    v = np.zeros(128)
    v[: len(values)] = values
    return (v / np.linalg.norm(v)).tolist()


A = emb(1, 0, 0)
B = emb(0, 1, 0)
A_OLDER = emb(1, 0.6, 0.4)   # 年月で少し変わった A（A との類似度 0.81 くらい）
STRANGER = emb(0, 0, 1)


def face(embedding, box=(0, 0, 10, 10)) -> Face:
    return Face(box=box, embedding=embedding)


def test_similarity():
    assert similarity(A, A) == pytest.approx(1.0)
    assert similarity(A, B) == pytest.approx(0.0)
    assert similarity(A, A_OLDER) > CFG.threshold


def test_same_people_pass():
    r = match_faces([new_memory(face(A)), new_memory(face(B))], [face(A_OLDER), face(B)], CFG)
    assert r.ok
    assert [p.ok for p in r.people] == [True, True]


def test_stranger_is_rejected():
    r = match_faces([new_memory(face(A)), new_memory(face(B))], [face(A), face(STRANGER)], CFG)
    assert not r.ok
    assert r.reason == "face_mismatch"
    assert "右の人の顔" in r.message


def test_swapped_positions_are_rejected():
    # 本人同士だが立ち位置が入れ替わっている → ほかの立ち位置の人のほうが似ている
    r = match_faces([new_memory(face(A)), new_memory(face(B))], [face(B), face(A)], CFG)
    assert not r.ok
    assert r.reason == "face_mismatch"


def test_margin_against_other_position():
    # しきい値は超えているが、隣の人の記憶とほぼ同じくらい似ている → 確かめられない
    ab = emb(1, 1, 0)  # A とも B とも 0.71
    r = match_faces([new_memory(face(A)), new_memory(face(B))], [face(ab), face(B)], CFG)
    assert not r.ok
    assert "別の立ち位置" in r.message


def test_hidden_face():
    r = match_faces([new_memory(face(A)), new_memory(face(B))], [face(A), None], FaceConfig(max_hidden=0))
    assert not r.ok
    assert r.reason == "face_not_visible"
    assert "右の人の顔が見えない" in r.message
    assert match_faces([new_memory(face(A)), new_memory(face(B))], [face(A), None], FaceConfig(max_hidden=1)).ok


def test_position_without_memory_is_not_checked():
    # 鍵の写真で顔が見えなかった人は、まだ判定しない（最初に開けたときの顔から覚える）
    r = match_faces([new_memory(face(A)), new_memory(None)], [face(A), face(STRANGER)], CFG)
    assert r.ok
    assert r.people[1].checked is False


def test_memory_follows_aging():
    # 鍵の写真の顔だけだと通らないほど変わっても、開けるたびに覚えた最近の顔で通る
    very_old = emb(1, 0, 0)
    now = emb(0.3, 1, 0)           # 鍵の写真の顔との類似度 0.29（しきい値未満）
    last_time = emb(0.35, 0.95, 0)  # 前回開けたときの顔
    memory = update_memory(new_memory(face(very_old)), face(last_time), CFG.memory)
    assert not match_faces([new_memory(face(very_old))], [face(now)], CFG).ok
    assert match_faces([memory], [face(now)], CFG).ok


def test_update_memory_keeps_key_face_and_latest():
    memory = new_memory(face(A))
    for i in range(8):
        memory = update_memory(memory, face(emb(1, i * 0.01)), limit=5)
    assert [m["source"] for m in memory] == ["key"] + ["open"] * 5
    assert memory[0]["embedding"] == A
    assert update_memory(memory, None, 5) == memory


def _person(head_x: float, head_y: float) -> PersonPose:
    lms = [Landmark(0.5, 0.5, 0.0) for _ in range(33)]
    lms[0] = Landmark(head_x, head_y, 1.0)  # 鼻
    return PersonPose(angles={}, hip_center_x=head_x, landmarks=lms)


def test_assign_faces_by_head_position():
    people = [_person(0.25, 0.3), _person(0.75, 0.3)]
    right_face = face(B, box=(70, 20, 15, 15))  # 中心 (77.5, 27.5)
    left_face = face(A, box=(20, 22, 12, 12))
    stray = face(STRANGER, box=(45, 80, 10, 10))  # 誰の頭でもない場所（背景の人など）
    assigned = assign_faces(people, [right_face, stray, left_face], 100, 100)
    assert assigned == [left_face, right_face]


def test_assign_faces_none_when_head_not_visible():
    p = _person(0.5, 0.3)
    p.landmarks[0] = Landmark(0.5, 0.3, 0.0)
    assert assign_faces([p], [face(A, box=(45, 25, 10, 10))], 100, 100) == [None]


def test_config_from_env(monkeypatch):
    monkeypatch.setenv("EMO_FACE_THRESHOLD", "0.5")
    monkeypatch.setenv("EMO_FACE_CHECK", "false")
    c = FaceConfig.from_env()
    assert c.threshold == 0.5 and c.enabled is False


IMAGES = Path(__file__).parent / "images"


@pytest.mark.skipif(not (DEFAULT_DET_PATH.exists() and DEFAULT_REC_PATH.exists()), reason="顔のモデル未取得")
def test_encoder_on_blank_and_real_photo():
    from app.pose.face import FaceEncoder

    enc = FaceEncoder()
    assert enc.encode(Image.new("RGB", (320, 240), "white")) == []
    if (IMAGES / "person.jpg").exists():
        from app.pose.base import load_image

        faces = enc.encode(load_image(IMAGES / "person.jpg"))
        assert len(faces) == 1
        assert len(faces[0].embedding) == 128
        assert similarity(faces[0].embedding, faces[0].embedding) == pytest.approx(1.0)
