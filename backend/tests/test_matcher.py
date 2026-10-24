"""照合ロジックの単体テスト（MediaPipe を使わない）。"""

import pytest

from app.pose.angles import Landmark, PersonPose, joint_angle, person_pose_from_landmarks
from app.pose.config import MatchConfig
from app.pose.matcher import match_poses

import numpy as np

BASE = {
    "left_elbow": 90.0,
    "right_elbow": 170.0,
    "left_shoulder": 45.0,
    "right_shoulder": 120.0,
    "left_knee": 175.0,
    "right_knee": 160.0,
}


def person(x: float, **overrides) -> PersonPose:
    return PersonPose(angles={**BASE, **overrides}, hip_center_x=x)


def test_joint_angle():
    v = np.array([0.0, 0.0])
    assert joint_angle(np.array([1.0, 0.0]), v, np.array([0.0, 1.0])) == pytest.approx(90.0)
    assert joint_angle(np.array([1.0, 0.0]), v, np.array([-1.0, 0.0])) == pytest.approx(180.0)
    assert joint_angle(np.array([1.0, 0.0]), v, np.array([1.0, 0.0])) == pytest.approx(0.0)


def test_angles_use_pixel_aspect():
    # 正規化座標では45度に見えても、横長画像ではピクセル上の角度が変わる
    lms = [Landmark(0.5, 0.5) for _ in range(33)]
    lms[11] = Landmark(0.5, 0.4)  # 左肩
    lms[13] = Landmark(0.5, 0.5)  # 左ひじ
    lms[15] = Landmark(0.6, 0.6)  # 左手首
    square = person_pose_from_landmarks(lms, 100, 100)
    wide = person_pose_from_landmarks(lms, 200, 100)
    assert square.angles["left_elbow"] == pytest.approx(135.0)
    assert wide.angles["left_elbow"] != pytest.approx(135.0)


def test_low_visibility_joint_is_none():
    lms = [Landmark(0.5, 0.5) for _ in range(33)]
    lms[27] = Landmark(0.5, 0.9, visibility=0.1)  # 左足首が写っていない
    pose = person_pose_from_landmarks(lms, 100, 100)
    assert pose.angles["left_knee"] is None


def test_same_pose_matches():
    result = match_poses([person(0.3), person(0.7)], [person(0.7), person(0.3)])
    assert result.ok
    assert result.score == 100


def test_small_diff_within_tolerance_matches():
    result = match_poses([person(0.5)], [person(0.5, left_elbow=105.0, right_knee=150.0)])
    assert result.ok
    assert 70 < result.score < 100


def test_count_mismatch():
    result = match_poses([person(0.3), person(0.7)], [person(0.5)])
    assert not result.ok
    assert result.reason == "count_mismatch"
    assert "1人足りない" in result.message


def test_no_person():
    result = match_poses([person(0.5)], [])
    assert result.reason == "no_person"


def test_pose_mismatch_points_to_worst_joint():
    attempt = [person(0.3), person(0.7, right_elbow=60.0, left_shoulder=10.0)]
    result = match_poses([person(0.3), person(0.7)], attempt)
    assert not result.ok
    assert result.reason == "pose_mismatch"
    assert result.people[0].ok and not result.people[1].ok
    assert result.people[1].joints["right_elbow"].ok is False
    assert "右の人の右ひじ" in result.message
    assert "伸ばして" in result.message


def test_one_joint_far_off_fails_even_if_mean_ok():
    # 平均は許容内でも、1関節だけ大きく外れたら失敗
    result = match_poses([person(0.5)], [person(0.5, right_shoulder=60.0)])
    assert not result.ok


def test_order_matters():
    a = person(0.3)
    b = person(0.7, left_elbow=170.0, right_elbow=90.0, left_shoulder=120.0, right_shoulder=45.0)
    # 立ち位置を入れ替えると一致しない
    swapped = [person(0.3, **{k: v for k, v in b.angles.items()}), person(0.7, **a.angles)]
    assert not match_poses([a, b], swapped).ok


def test_mirror_only_when_enabled():
    key = [person(0.5)]
    flipped = [person(
        0.5,
        left_elbow=BASE["right_elbow"], right_elbow=BASE["left_elbow"],
        left_shoulder=BASE["right_shoulder"], right_shoulder=BASE["left_shoulder"],
        left_knee=BASE["right_knee"], right_knee=BASE["left_knee"],
    )]
    assert not match_poses(key, flipped).ok
    result = match_poses(key, flipped, MatchConfig(allow_mirror=True))
    assert result.ok and result.mirrored


def test_body_not_visible():
    attempt = [person(0.5, left_knee=None, right_knee=None, left_shoulder=None)]
    result = match_poses([person(0.5)], attempt)
    assert result.reason == "body_not_visible"


def test_joint_missing_in_key_is_skipped():
    # 当時の写真で膝が写っていなければ、膝は比べない
    key = [person(0.5, left_knee=None, right_knee=None)]
    result = match_poses(key, [person(0.5, left_knee=30.0, right_knee=30.0)])
    assert result.ok


def test_roundtrip_dict():
    p = person(0.42, left_knee=None)
    assert PersonPose.from_dict(p.to_dict()).angles == p.angles


def test_config_from_env(monkeypatch):
    monkeypatch.setenv("EMO_TOLERANCE_DEG", "15")
    monkeypatch.setenv("EMO_ALLOW_MIRROR", "true")
    c = MatchConfig.from_env()
    assert c.tolerance_deg == 15.0 and c.allow_mirror
