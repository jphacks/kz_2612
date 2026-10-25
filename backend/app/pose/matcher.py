"""鍵のポーズと撮影したポーズの照合。

判定ルール:
- 人数が一致すること（PRD F-4）
- 全員が判定できる（体が見えている）こと
- 一致度（全員のずれの平均から出す 0〜100）が pass_score（既定55）以上なら一致
- 一致度のもとになるずれは、左から順に対応づけ、各人について
  - 点の位置（主）: ひじ・手首・ひざ・足首の、両肩から見た位置のずれ（肩幅を1とした距離）の平均が許容値以内
    - 当時の写真で写っていない点は比べない（自由なポーズで片手が隠れていてもよい）
    - 当時は写っていたのに今は隠れている点は、1人 max_missing_points 点まで許す（そのぶん少しずれた扱い）
  - 関節の角度（補助）: 既定では表示用。EMO_JUDGE_WITH_ANGLES=true のときだけ、両方で測れた角度が2つ以上あれば平均の差も見る
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.pose.angles import MIRROR_JOINT, MIRROR_POINT, PersonPose, mirrored, sort_left_to_right
from app.pose.config import MatchConfig

Reason = Literal[
    "count_mismatch", "pose_mismatch", "body_not_visible", "no_person", "face_not_visible", "face_mismatch"
]

JOINT_LABELS = {
    "left_elbow": "左ひじ",
    "right_elbow": "右ひじ",
    "left_shoulder": "左腕",
    "right_shoulder": "右腕",
    "left_knee": "左ひざ",
    "right_knee": "右ひざ",
}
POINT_LABELS = {
    "left_elbow": "左ひじ",
    "right_elbow": "右ひじ",
    "left_wrist": "左手",
    "right_wrist": "右手",
    "left_knee": "左ひざ",
    "right_knee": "右ひざ",
    "left_ankle": "左足",
    "right_ankle": "右足",
    "shoulders": "肩",
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
class PointDiff:
    key: list[float]
    attempt: list[float]
    # 肩幅を1とした距離
    diff: float
    ok: bool

    def to_dict(self) -> dict:
        return {
            "key": [round(v, 3) for v in self.key],
            "attempt": [round(v, 3) for v in self.attempt],
            "diff": round(self.diff, 3),
            "ok": self.ok,
        }


@dataclass
class PersonResult:
    # 撮影画像での左からの位置（0始まり）
    position: int
    ok: bool
    mean_diff_deg: float | None
    max_diff_deg: float | None
    # 撮影画像側の関節名 → 角度のずれ
    joints: dict[str, JointDiff] = field(default_factory=dict)
    # 当時は写っていたのに今は写っていない点（撮影画像側の名前）。両肩が見えないときは "shoulders"
    missing_joints: list[str] = field(default_factory=list)
    # 撮影画像側の点の名前 → 位置のずれ
    points: dict[str, PointDiff] = field(default_factory=dict)
    # 位置のずれの平均（隠れた点のぶんも含む）。位置で比べられないときは None
    mean_point_diff: float | None = None
    # 総合のずれ（1.0 が許容値ちょうど）。判定できないときは None
    badness: float | None = None

    def to_dict(self) -> dict:
        return {
            "position": self.position,
            "ok": self.ok,
            "mean_diff_deg": None if self.mean_diff_deg is None else round(self.mean_diff_deg, 1),
            "max_diff_deg": None if self.max_diff_deg is None else round(self.max_diff_deg, 1),
            "joints": {k: v.to_dict() for k, v in self.joints.items()},
            "missing_joints": self.missing_joints,
            "points": {k: v.to_dict() for k, v in self.points.items()},
            "mean_point_diff": None if self.mean_point_diff is None else round(self.mean_point_diff, 3),
        }


@dataclass
class MatchResult:
    ok: bool
    reason: Reason | None
    # 一致度ゲージ用 0〜100。ずれ0で100、許容値ちょうどで70
    score: int
    message: str
    expected_people: int
    detected_people: int
    mirrored: bool = False
    people: list[PersonResult] = field(default_factory=list)
    # 顔の判定の結果（立ち位置ごと）。ポーズが合ったときだけ入る
    faces: list[dict] = field(default_factory=list)

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
            "faces": self.faces,
        }


def _score(badness: float) -> int:
    return int(round(max(0.0, min(100.0, 100.0 - badness * 30.0))))


def _position_label(position: int, total: int) -> str:
    if total == 1:
        return ""
    if total == 2:
        return "左の人の" if position == 0 else "右の人の"
    return f"左から{position + 1}番目の人の"


def _joint_hint(joint: str, d: JointDiff) -> str:
    bigger = d.attempt_deg < d.key_deg  # 当時より角度を大きくすればよい
    if joint.endswith("shoulder"):
        return f"{JOINT_LABELS[joint]}をもう少し上げて" if bigger else f"{JOINT_LABELS[joint]}をもう少し下げて"
    return f"{JOINT_LABELS[joint]}をもう少し伸ばして" if bigger else f"{JOINT_LABELS[joint]}をもう少し曲げて"


def _point_hint(name: str, d: PointDiff) -> str:
    dx, dy = d.key[0] - d.attempt[0], d.key[1] - d.attempt[1]
    if abs(dy) >= abs(dx):
        where = "上に" if dy < 0 else "下に"
    else:
        where = "外側に" if abs(d.key[0]) > abs(d.attempt[0]) else "内側に"
    return f"{POINT_LABELS[name]}をもう少し{where}"


def _compare_person(
    key: PersonPose,
    attempt: PersonPose,
    position: int,
    config: MatchConfig,
    joint_name_map: dict[str, str],
    point_name_map: dict[str, str],
) -> PersonResult:
    # 関節の角度（補助）: 両方で測れたものだけ比べる
    joints: dict[str, JointDiff] = {}
    for name, key_deg in key.angles.items():
        attempt_deg = attempt.angles.get(name)
        if key_deg is None or attempt_deg is None:
            continue
        diff = abs(key_deg - attempt_deg)
        joints[joint_name_map[name]] = JointDiff(key_deg, attempt_deg, diff, diff <= config.tolerance_deg)
    has_angles = len(joints) >= config.min_joints_per_person
    # 点の位置を持たない古い鍵は角度で比べるしかない
    use_angles = has_angles and (config.judge_with_angles or not key.rel)
    mean_deg = max_deg = None
    if joints:
        diffs = [j.diff_deg for j in joints.values()]
        mean_deg, max_deg = sum(diffs) / len(diffs), max(diffs)
    angles_ok = not use_angles or (mean_deg <= config.tolerance_deg and max_deg <= config.max_joint_diff_deg)

    def result(ok: bool, badness: float | None, **kw) -> PersonResult:
        return PersonResult(
            position=position, ok=ok, mean_diff_deg=mean_deg, max_diff_deg=max_deg, joints=joints, badness=badness, **kw
        )

    if not key.rel:
        # 点の位置を持たない古い鍵は、角度だけで比べる
        if not has_angles:
            return result(
                False,
                None,
                missing_joints=[
                    joint_name_map[k] for k, v in key.angles.items() if v is not None and attempt.angles.get(k) is None
                ],
            )
        return result(angles_ok, mean_deg / config.tolerance_deg)

    key_points = {k: v for k, v in key.rel.items() if v is not None}
    if not attempt.rel:
        return result(False, None, missing_joints=["shoulders"])

    points: dict[str, PointDiff] = {}
    missing: list[str] = []
    for name, kp in key_points.items():
        ap = attempt.rel.get(name)
        if ap is None:
            missing.append(point_name_map[name])
            continue
        diff = ((kp[0] - ap[0]) ** 2 + (kp[1] - ap[1]) ** 2) ** 0.5
        points[point_name_map[name]] = PointDiff(kp, ap, diff, diff <= config.point_tolerance)
    if len(missing) > config.max_missing_points or not points:
        return result(False, None, missing_joints=missing, points=points)

    # 隠れた点は「許容値ちょうどのずれ」として平均に入れる
    values = [p.diff for p in points.values()] + [config.point_tolerance] * len(missing)
    mean_point = sum(values) / len(values)
    points_ok = mean_point <= config.point_tolerance and max(p.diff for p in points.values()) <= config.max_point_diff

    badness_parts = [mean_point / config.point_tolerance]
    if use_angles:
        badness_parts.append(mean_deg / config.tolerance_deg)
    return result(
        points_ok and angles_ok,
        sum(badness_parts) / len(badness_parts),
        missing_joints=missing,
        points=points,
        mean_point_diff=mean_point,
    )


def _compare_all(
    key: list[PersonPose], attempt: list[PersonPose], config: MatchConfig, is_mirrored: bool
) -> list[PersonResult]:
    n = len(key)
    joint_name_map = MIRROR_JOINT if is_mirrored else {k: k for k in MIRROR_JOINT}
    point_name_map = MIRROR_POINT if is_mirrored else {k: k for k in MIRROR_POINT}
    results = []
    for i, (k, a) in enumerate(zip(key, attempt)):
        # 鏡像では左右の並びも逆になるので、撮影画像での位置に戻す
        position = n - 1 - i if is_mirrored else i
        results.append(_compare_person(k, a, position, config, joint_name_map, point_name_map))
    return sorted(results, key=lambda r: r.position)


def _overall(results: list[PersonResult]) -> float:
    # 判定できなかった人がいる組み合わせは選ばれないよう大きな値にする
    if any(r.badness is None for r in results):
        return float("inf")
    return sum(r.badness for r in results) / len(results)  # type: ignore[misc]


def _not_visible_message(person: PersonResult, total: int) -> str:
    label = _position_label(person.position, total)
    missing = person.missing_joints
    if "shoulders" in missing:
        return f"{label}両肩まで写るように、少し下がってみて"
    if any(j.endswith(("knee", "ankle")) for j in missing):
        return f"{label}足まで写るように、少し下がってみて"
    if missing:
        names = "と".join(POINT_LABELS.get(j, JOINT_LABELS.get(j, j)) for j in missing[:2])
        return f"{label}{names}が見えないみたい。あの日みたいに写るようにしてみて"
    return f"{label[:-1] if label else '体'}がよく見えないみたい。少し下がって、体が写るようにしてみて"


def match_poses(key: list[PersonPose], attempt: list[PersonPose], config: MatchConfig | None = None) -> MatchResult:
    config = config or MatchConfig()
    key = sort_left_to_right(key)
    attempt = sort_left_to_right(attempt)
    expected, detected = len(key), len(attempt)

    if detected == 0:
        return MatchResult(
            False, "no_person", 0, "カメラに誰も写っていないみたい。画面に入ってみて", expected, detected
        )

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
    is_mirrored, people = min(candidates, key=lambda c: _overall(c[1]))

    overall = _overall(people)
    if overall == float("inf"):
        not_visible = next(r for r in people if r.badness is None)
        return MatchResult(
            False,
            "body_not_visible",
            0,
            _not_visible_message(not_visible, detected),
            expected,
            detected,
            is_mirrored,
            people,
        )

    # 合否は画面に出す一致度そのもので決める（表示と判定を食い違わせない）
    score = _score(overall)
    if score >= config.pass_score:
        return MatchResult(True, None, score, "あの日のポーズ、そろったね！", expected, detected, is_mirrored, people)

    # いちばんずれている人の、いちばんずれている点（または関節）について声をかける
    worst_person = max(people, key=lambda r: r.badness or 0.0)
    candidates_hint = [(d.diff / config.point_tolerance, _point_hint(n, d)) for n, d in worst_person.points.items()]
    if config.judge_with_angles or not worst_person.points:
        candidates_hint += [
            (d.diff_deg / config.tolerance_deg, _joint_hint(n, d)) for n, d in worst_person.joints.items()
        ]
    _, hint = max(candidates_hint, key=lambda c: c[0])
    msg = f"あと少し！{_position_label(worst_person.position, detected)}{hint}"
    return MatchResult(False, "pose_mismatch", score, msg, expected, detected, is_mirrored, people)
