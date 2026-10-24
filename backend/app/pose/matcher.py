"""鍵のポーズと撮影したポーズの照合。

判定ルール（PRD F-4）:
- 人数が一致すること
- 左から順に対応づけ、各人の平均角度差が許容値以内であること
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.pose.angles import MIRROR_JOINT, PersonPose, mirrored, sort_left_to_right
from app.pose.config import MatchConfig

Reason = Literal["count_mismatch", "pose_mismatch", "body_not_visible", "no_person"]

JOINT_LABELS = {
    "left_elbow": "左ひじ",
    "right_elbow": "右ひじ",
    "left_shoulder": "左腕",
    "right_shoulder": "右腕",
    "left_knee": "左ひざ",
    "right_knee": "右ひざ",
}


@dataclass
class JointDiff:
    key_deg: float
    attempt_deg: float
    diff_deg: float
    ok: bool

    def to_dict(self) -> dict:
        return {
            "key_deg": round(self.key_deg, 1),
            "attempt_deg": round(self.attempt_deg, 1),
            "diff_deg": round(self.diff_deg, 1),
            "ok": self.ok,
        }


@dataclass
class PersonResult:
    # 撮影画像での左からの位置（0始まり）
    position: int
    ok: bool
    mean_diff_deg: float | None
    max_diff_deg: float | None
    # 撮影画像側の関節名 → ずれ
    joints: dict[str, JointDiff] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "position": self.position,
            "ok": self.ok,
            "mean_diff_deg": None if self.mean_diff_deg is None else round(self.mean_diff_deg, 1),
            "max_diff_deg": None if self.max_diff_deg is None else round(self.max_diff_deg, 1),
            "joints": {k: v.to_dict() for k, v in self.joints.items()},
        }


@dataclass
class MatchResult:
    ok: bool
    reason: Reason | None
    # 一致度ゲージ用 0〜100。平均ずれ0度で100、許容値ちょうどで70
    score: int
    message: str
    expected_people: int
    detected_people: int
    mirrored: bool = False
    people: list[PersonResult] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "reason": self.reason,
            "score": self.score,
            "message": self.message,
            "expected_people": self.expected_people,
            "detected_people": self.detected_people,
            "mirrored": self.mirrored,
            "people": [p.to_dict() for p in self.people],
        }


def _score(mean_diff: float, tolerance: float) -> int:
    return int(round(max(0.0, min(100.0, 100.0 - mean_diff * 30.0 / tolerance))))


def _position_label(position: int, total: int) -> str:
    if total == 1:
        return ""
    if total == 2:
        return "左の人の" if position == 0 else "右の人の"
    return f"左から{position + 1}番目の人の"


def _hint(joint: str, d: JointDiff) -> str:
    bigger = d.attempt_deg < d.key_deg  # 当時より角度を大きくすればよい
    if joint.endswith("shoulder"):
        return "もう少し上げて" if bigger else "もう少し下げて"
    return "もう少し伸ばして" if bigger else "もう少し曲げて"


def _compare_person(
    key: PersonPose, attempt: PersonPose, position: int, config: MatchConfig, joint_name_map: dict[str, str]
) -> PersonResult:
    joints: dict[str, JointDiff] = {}
    for name, key_deg in key.angles.items():
        attempt_deg = attempt.angles.get(name)
        if key_deg is None or attempt_deg is None:
            continue
        diff = abs(key_deg - attempt_deg)
        joints[joint_name_map[name]] = JointDiff(key_deg, attempt_deg, diff, diff <= config.tolerance_deg)

    if len(joints) < config.min_joints_per_person:
        return PersonResult(position=position, ok=False, mean_diff_deg=None, max_diff_deg=None, joints=joints)

    diffs = [j.diff_deg for j in joints.values()]
    mean_diff = sum(diffs) / len(diffs)
    max_diff = max(diffs)
    ok = mean_diff <= config.tolerance_deg and max_diff <= config.max_joint_diff_deg
    return PersonResult(position=position, ok=ok, mean_diff_deg=mean_diff, max_diff_deg=max_diff, joints=joints)


def _compare_all(
    key: list[PersonPose], attempt: list[PersonPose], config: MatchConfig, is_mirrored: bool
) -> list[PersonResult]:
    n = len(key)
    joint_name_map = MIRROR_JOINT if is_mirrored else {k: k for k in MIRROR_JOINT}
    results = []
    for i, (k, a) in enumerate(zip(key, attempt)):
        # 鏡像では左右の並びも逆になるので、撮影画像での位置に戻す
        position = n - 1 - i if is_mirrored else i
        results.append(_compare_person(k, a, position, config, joint_name_map))
    return sorted(results, key=lambda r: r.position)


def _overall_mean(results: list[PersonResult]) -> float:
    # 判定できなかった人がいる組み合わせは選ばれないよう大きな値にする
    if any(r.mean_diff_deg is None for r in results):
        return float("inf")
    return sum(r.mean_diff_deg for r in results) / len(results)  # type: ignore[misc]


def match_poses(key: list[PersonPose], attempt: list[PersonPose], config: MatchConfig | None = None) -> MatchResult:
    config = config or MatchConfig()
    key = sort_left_to_right(key)
    attempt = sort_left_to_right(attempt)
    expected, detected = len(key), len(attempt)

    if detected == 0:
        return MatchResult(False, "no_person", 0, "カメラに誰も写っていないみたい。画面に入ってみて", expected, detected)

    if expected != detected:
        if detected < expected:
            msg = f"あと{expected - detected}人足りないみたい。みんな画面に入ってる？"
        else:
            msg = f"当時は{expected}人だったよ。{detected - expected}人多いみたい"
        return MatchResult(False, "count_mismatch", 0, msg, expected, detected)

    candidates = [(False, _compare_all(key, attempt, config, False))]
    if config.allow_mirror:
        flipped = sort_left_to_right([mirrored(p) for p in attempt])
        candidates.append((True, _compare_all(key, flipped, config, True)))
    is_mirrored, people = min(candidates, key=lambda c: _overall_mean(c[1]))

    overall = _overall_mean(people)
    if overall == float("inf"):
        not_visible = next(r for r in people if r.mean_diff_deg is None)
        label = _position_label(not_visible.position, detected) or ""
        who = label[:-1] if label else "体"
        return MatchResult(
            False,
            "body_not_visible",
            0,
            f"{who}がよく見えないみたい。少し下がって、全身が写るようにしてみて",
            expected,
            detected,
            is_mirrored,
            people,
        )

    score = _score(overall, config.tolerance_deg)
    if all(r.ok for r in people):
        return MatchResult(True, None, score, "あの日のポーズ、そろったね！", expected, detected, is_mirrored, people)

    # いちばんずれている人の、いちばんずれている関節について声をかける
    worst_person = max((r for r in people if not r.ok), key=lambda r: r.mean_diff_deg or 0.0)
    worst_joint, worst = max(worst_person.joints.items(), key=lambda kv: kv[1].diff_deg)
    msg = (
        f"あと少し！{_position_label(worst_person.position, detected)}"
        f"{JOINT_LABELS[worst_joint]}を{_hint(worst_joint, worst)}"
    )
    return MatchResult(False, "pose_mismatch", score, msg, expected, detected, is_mirrored, people)
