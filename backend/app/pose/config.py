"""判定の設定値。PRD の方針どおり環境変数で外出しする。"""

import os
from dataclasses import dataclass


def _env_float(name: str, default: float) -> float:
    value = os.environ.get(name)
    return float(value) if value else default


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class MatchConfig:
    # 各人の平均角度差の許容値（度）。PRD の初期値は20度
    tolerance_deg: float = 20.0
    # 1関節だけ大きくずれている場合も失敗にする上限（度）
    max_joint_diff_deg: float = 45.0
    # 鏡像（左右反転した撮影画像）も一致とみなすか。
    # インカメラは端末によって左右が反転するので、デモに合わせて既定はオン（オフにすると判定が厳しくなる）
    allow_mirror: bool = True
    # これ未満の visibility の関節は「写っていない」として比較から外す
    min_visibility: float = 0.5
    # 関節の角度も合否に使うか。ひじを曲げたポーズでは少し動いただけで角度が大きく変わり厳しすぎるので、既定は表示用だけ
    judge_with_angles: bool = False
    # 1人あたり最低これだけの関節角度が比べられないと、角度は判定に使わない
    min_joints_per_person: int = 2
    # 点の位置のずれ（肩幅を1とした距離）。各人の平均がこれ以内なら一致
    # 0.35 では手足が少し違うだけで落ちたので、デモに合わせて 0.5 に緩めた
    point_tolerance: float = 0.5
    # 1点だけ大きくずれたときの上限（肩幅の何倍か）
    max_point_diff: float = 1.5
    # 当時は写っていたのに今は隠れている点を、1人何点まで許すか（隠れた点は point_tolerance のずれとして数える）
    max_missing_points: int = 3
    # 鍵にするには、1人あたり両肩と、これだけの点（ひじ・手首・ひざ・足首）が写っている必要がある
    min_points_per_person: int = 2

    @classmethod
    def from_env(cls) -> "MatchConfig":
        default = cls()
        return cls(
            tolerance_deg=_env_float("EMO_TOLERANCE_DEG", default.tolerance_deg),
            max_joint_diff_deg=_env_float("EMO_MAX_JOINT_DIFF_DEG", default.max_joint_diff_deg),
            allow_mirror=_env_bool("EMO_ALLOW_MIRROR", default.allow_mirror),
            min_visibility=_env_float("EMO_MIN_VISIBILITY", default.min_visibility),
            judge_with_angles=_env_bool("EMO_JUDGE_WITH_ANGLES", default.judge_with_angles),
            min_joints_per_person=int(
                _env_float("EMO_MIN_JOINTS_PER_PERSON", default.min_joints_per_person)
            ),
            point_tolerance=_env_float("EMO_POINT_TOLERANCE", default.point_tolerance),
            max_point_diff=_env_float("EMO_MAX_POINT_DIFF", default.max_point_diff),
            max_missing_points=int(_env_float("EMO_MAX_MISSING_POINTS", default.max_missing_points)),
            min_points_per_person=int(_env_float("EMO_MIN_POINTS_PER_PERSON", default.min_points_per_person)),
        )


# 検出できる最大人数（PRD: 最大4人）。5人以上は「別の写真を」と案内する
MAX_PEOPLE = 4
