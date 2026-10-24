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
    # フロントが反転しない画像を送る前提で既定はオフ（オンにすると判定が少し甘くなる）
    allow_mirror: bool = False
    # これ未満の visibility の関節は「写っていない」として比較から外す
    min_visibility: float = 0.5
    # 1人あたり最低これだけの関節が比較できないと判定しない
    min_joints_per_person: int = 4

    @classmethod
    def from_env(cls) -> "MatchConfig":
        default = cls()
        return cls(
            tolerance_deg=_env_float("EMO_TOLERANCE_DEG", default.tolerance_deg),
            max_joint_diff_deg=_env_float("EMO_MAX_JOINT_DIFF_DEG", default.max_joint_diff_deg),
            allow_mirror=_env_bool("EMO_ALLOW_MIRROR", default.allow_mirror),
            min_visibility=_env_float("EMO_MIN_VISIBILITY", default.min_visibility),
            min_joints_per_person=int(
                _env_float("EMO_MIN_JOINTS_PER_PERSON", default.min_joints_per_person)
            ),
        )


# 検出できる最大人数（PRD: 最大4人）。5人以上は「別の写真を」と案内する
MAX_PEOPLE = 4
