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
    assert not match_poses(key, flipped, MatchConfig(allow_mirror=False)).ok
    result = match_poses(key, flipped, MatchConfig(allow_mirror=True))
    assert result.ok and result.mirrored


def test_body_not_visible_with_old_angle_only_key():
    # 点の位置を持たない古い鍵は角度だけで比べる。比べられる角度が足りなければ体が見えない扱い
    attempt = [person(0.5, left_knee=None, right_knee=None, left_shoulder=None, right_shoulder=None, left_elbow=None)]
    result = match_poses([person(0.5)], attempt)
    assert result.reason == "body_not_visible"


# ---- 点の位置で比べる（既定） ----

REL = {
    "left_elbow": [0.8, 0.6], "right_elbow": [-0.8, 0.6],
    "left_wrist": [0.9, -0.2], "right_wrist": [-0.9, -0.2],
    "left_knee": [0.3, 2.5], "right_knee": [-0.3, 2.5],
    "left_ankle": [0.3, 3.5], "right_ankle": [-0.3, 3.5],
}
UPPER_ONLY = {"left_knee": None, "right_knee": None, "left_ankle": None, "right_ankle": None}


def rperson(x: float, angles: dict | None = None, **rel) -> PersonPose:
    return PersonPose(angles=angles if angles is not None else dict(BASE), hip_center_x=x, rel={**REL, **rel})


def test_points_same_pose_matches():
    result = match_poses([rperson(0.5)], [rperson(0.5, left_wrist=[0.95, -0.1])])
    assert result.ok
    assert result.people[0].points["left_wrist"].diff == pytest.approx(0.112, abs=0.01)


def test_points_different_pose_fails_with_hint():
    # 右手を下ろした（当時は顔の横）
    result = match_poses([rperson(0.5)], [rperson(0.5, right_wrist=[-0.9, 1.6], right_elbow=[-0.9, 0.9])])
    assert not result.ok
    assert result.reason == "pose_mismatch"
    assert "右手をもう少し上に" in result.message


def test_hidden_hand_in_key_is_fine():
    # 当時、左手が隠れていた自由なポーズ。今も左手がどこにあっても関係ない
    key = [rperson(0.5, left_wrist=None, **UPPER_ONLY)]
    attempt = [rperson(0.5, left_wrist=[3.0, 3.0], **UPPER_ONLY)]
    assert match_poses(key, attempt).ok


def test_some_hidden_points_in_attempt_are_allowed():
    key = [rperson(0.5, **UPPER_ONLY)]
    # 1点隠れても開く（隠れた点は許容値ちょうどのずれとして数える）
    result = match_poses(key, [rperson(0.5, right_wrist=None, **UPPER_ONLY)])
    assert result.ok
    assert result.people[0].missing_joints == ["right_wrist"]
    assert result.score < 100


def test_too_many_hidden_points_is_body_not_visible():
    # 全身の鍵を、ひざ・足首の写っていない上半身だけの写真では開けられない（隠れてよいのは2点まで）
    result = match_poses([rperson(0.5)], [rperson(0.5, **UPPER_ONLY)])
    assert not result.ok
    assert result.reason == "body_not_visible"
    assert set(result.people[0].missing_joints) == set(UPPER_ONLY)
    assert "足まで写る" in result.message


def test_hidden_points_message_names_the_part():
    config = MatchConfig(max_missing_points=0)
    result = match_poses([rperson(0.5, **UPPER_ONLY)], [rperson(0.5, left_wrist=None, **UPPER_ONLY)], config)
    assert result.reason == "body_not_visible"
    assert "左手が見えない" in result.message


def test_shoulders_not_visible():
    attempt = [PersonPose(angles=dict(BASE), hip_center_x=0.5, rel={})]
    result = match_poses([rperson(0.5)], attempt)
    assert result.reason == "body_not_visible"
    assert "両肩" in result.message


def test_angles_do_not_decide_by_default():
    # ひじの角度が大きく違っても、手やひじの位置がそろっていれば開く（自由なポーズのため）
    bent = dict(BASE, left_elbow=10.0, right_elbow=100.0)
    assert match_poses([rperson(0.5)], [rperson(0.5, angles=bent)]).ok
    assert not match_poses([rperson(0.5)], [rperson(0.5, angles=bent)], MatchConfig(judge_with_angles=True)).ok


def test_rel_points_roundtrip_and_mirror():
    from app.pose.angles import mirrored

    p = rperson(0.3, left_wrist=None)
    q = PersonPose.from_dict(p.to_dict())
    assert q.rel["left_wrist"] is None and q.rel["right_elbow"] == [-0.8, 0.6]
    m = mirrored(p)
    assert m.rel["right_wrist"] is None and m.rel["left_elbow"] == [0.8, 0.6]


def test_rel_points_from_landmarks():
    lms = [Landmark(0.5, 0.5, 0.0) for _ in range(33)]
    lms[11], lms[12] = Landmark(0.6, 0.4), Landmark(0.4, 0.4)  # 肩（肩幅 0.2 × 幅100px = 20px）
    lms[13] = Landmark(0.7, 0.6)                                 # 左ひじだけ見える
    pose = person_pose_from_landmarks(lms, 100, 100)
    assert pose.rel["left_elbow"] == pytest.approx([1.0, 1.0])
    assert pose.rel["right_elbow"] is None
    assert pose.visible_points() == 1


def test_joint_missing_in_key_is_skipped():
    # 当時の写真で膝が写っていなければ、膝は比べない
    key = [person(0.5, left_knee=None, right_knee=None)]
    result = match_poses(key, [person(0.5, left_knee=30.0, right_knee=30.0)])
    assert result.ok


def test_upper_body_key_opens_with_upper_body():
    key = [person(0.5, left_knee=None, right_knee=None)]
    assert match_poses(key, [person(0.5, left_knee=None, right_knee=None)]).ok


def test_shoulder_angle_without_hips():
    from app.pose.angles import shoulder_angle

    s, other = np.array([0.0, 0.0]), np.array([-10.0, 0.0])  # 右に向かって左肩→右肩
    assert shoulder_angle(np.array([0.0, 10.0]), s, other) == pytest.approx(0.0)    # 腕を下ろす
    assert shoulder_angle(np.array([10.0, 0.0]), s, other) == pytest.approx(90.0)   # 水平
    assert shoulder_angle(np.array([0.0, -10.0]), s, other) == pytest.approx(180.0)  # 真上
    # 腰（23, 24）が見えていなくても肩の角度が出る
    lms = [Landmark(0.5, 0.5) for _ in range(33)]
    lms[11], lms[12], lms[13] = Landmark(0.6, 0.3), Landmark(0.4, 0.3), Landmark(0.7, 0.3)
    lms[23] = Landmark(0.6, 0.9, visibility=0.0)
    lms[24] = Landmark(0.4, 0.9, visibility=0.0)
    assert person_pose_from_landmarks(lms, 100, 100).angles["left_shoulder"] == pytest.approx(90.0)


def test_roundtrip_dict():
    p = person(0.42, left_knee=None)
    assert PersonPose.from_dict(p.to_dict()).angles == p.angles


def test_config_from_env(monkeypatch):
    monkeypatch.setenv("EMO_TOLERANCE_DEG", "15")
    monkeypatch.setenv("EMO_ALLOW_MIRROR", "true")
    c = MatchConfig.from_env()
    assert c.tolerance_deg == 15.0 and c.allow_mirror
