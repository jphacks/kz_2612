"""関節座標から6関節（左右の肘・肩・膝）の角度を求める。

左右は MediaPipe と同じく「写っている本人から見た左右」。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

import numpy as np

# MediaPipe Pose の33点のうち使うもの
L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANKLE, R_ANKLE = 27, 28

# 関節名 → (端点A, 頂点, 端点B)。頂点での角度 ∠A-頂点-B を測る
# 肩だけは例外で、B は反対側の肩。腰が写っていない上半身だけの写真でも測れるよう、
# 「肩のラインに垂直な下向き（＝胴体の向き）」と上腕のなす角を測る（腕を下ろして0度、水平で90度、真上で180度）
JOINTS: dict[str, tuple[int, int, int]] = {
    "left_elbow": (L_SHOULDER, L_ELBOW, L_WRIST),
    "right_elbow": (R_SHOULDER, R_ELBOW, R_WRIST),
    "left_shoulder": (L_ELBOW, L_SHOULDER, R_SHOULDER),
    "right_shoulder": (R_ELBOW, R_SHOULDER, L_SHOULDER),
    "left_knee": (L_HIP, L_KNEE, L_ANKLE),
    "right_knee": (R_HIP, R_KNEE, R_ANKLE),
}
SHOULDER_JOINTS = ("left_shoulder", "right_shoulder")

GUIDE_POINTS: dict[str, int] = {
    "left_shoulder": L_SHOULDER, "right_shoulder": R_SHOULDER,
    "left_elbow": L_ELBOW, "right_elbow": R_ELBOW,
    "left_wrist": L_WRIST, "right_wrist": R_WRIST,
    "left_hip": L_HIP, "right_hip": R_HIP,
    "left_knee": L_KNEE, "right_knee": R_KNEE,
    "left_ankle": L_ANKLE, "right_ankle": R_ANKLE,
}

# 鏡像のときに入れ替わる関節
MIRROR_JOINT = {
    "left_elbow": "right_elbow",
    "right_elbow": "left_elbow",
    "left_shoulder": "right_shoulder",
    "right_shoulder": "left_shoulder",
    "left_knee": "right_knee",
    "right_knee": "left_knee",
}


@dataclass
class Landmark:
    x: float  # 0〜1 に正規化された画像座標
    y: float
    visibility: float = 1.0


@dataclass
class PersonPose:
    """1人分の鍵。保存するのは角度の数値と並び順に使う位置だけ（顔の特徴は持たない）。"""

    # 関節名 → 角度（度）。写っていない関節は None
    angles: dict[str, float | None]
    # 腰の中心の x 座標（0〜1）。左から並べるために使う
    hip_center_x: float
    # プレビュー描画用の座標。DynamoDB には保存しない
    landmarks: list[Landmark] = field(default_factory=list, repr=False)

    def to_dict(self) -> dict:
        return {
            "angles": {k: (None if v is None else round(v, 1)) for k, v in self.angles.items()},
            "hip_center_x": round(self.hip_center_x, 4),
        }

    def measurable_joints(self) -> int:
        """角度が測れた関節の数。"""
        return sum(v is not None for v in self.angles.values())

    def guide_points(self) -> dict[str, list[float] | None]:
        """開封カメラのガイド表示用に、体の12点だけを正規化座標で返す（顔の点は含めない）。"""
        if not self.landmarks:
            return {}
        return {
            name: (
                [round(self.landmarks[i].x, 4), round(self.landmarks[i].y, 4)]
                if self.landmarks[i].visibility >= 0.5
                else None
            )
            for name, i in GUIDE_POINTS.items()
        }

    @classmethod
    def from_dict(cls, data: dict) -> "PersonPose":
        return cls(
            angles={k: (None if v is None else float(v)) for k, v in data["angles"].items()},
            hip_center_x=float(data["hip_center_x"]),
        )


def joint_angle(a: np.ndarray, vertex: np.ndarray, b: np.ndarray) -> float:
    """頂点 vertex における ∠a-vertex-b を 0〜180 度で返す。"""
    v1 = a - vertex
    v2 = b - vertex
    n1 = np.linalg.norm(v1)
    n2 = np.linalg.norm(v2)
    if n1 == 0 or n2 == 0:
        return 0.0
    cos = float(np.dot(v1, v2) / (n1 * n2))
    return float(np.degrees(np.arccos(np.clip(cos, -1.0, 1.0))))


def shoulder_angle(elbow: np.ndarray, shoulder: np.ndarray, other_shoulder: np.ndarray) -> float:
    """上腕と「肩のラインに垂直な下向き」のなす角。腰の位置を使わない。"""
    line = other_shoulder - shoulder
    down = np.array([-line[1], line[0]])
    if down[1] < 0:  # 画像の y は下向きが正。下を向く方の垂線を選ぶ
        down = -down
    return joint_angle(elbow, shoulder, shoulder + down)


def person_pose_from_landmarks(
    landmarks: Sequence[Landmark],
    image_width: int,
    image_height: int,
    min_visibility: float = 0.5,
) -> PersonPose:
    """33点の正規化座標から PersonPose を作る。

    正規化座標のままだと縦横比で角度が歪むので、ピクセル単位に戻してから測る。
    """
    scale = np.array([image_width, image_height], dtype=float)

    def point(i: int) -> np.ndarray:
        return np.array([landmarks[i].x, landmarks[i].y], dtype=float) * scale

    angles: dict[str, float | None] = {}
    for name, (a, v, b) in JOINTS.items():
        if min(landmarks[a].visibility, landmarks[v].visibility, landmarks[b].visibility) < min_visibility:
            angles[name] = None
        elif name in SHOULDER_JOINTS:
            angles[name] = shoulder_angle(point(a), point(v), point(b))
        else:
            angles[name] = joint_angle(point(a), point(v), point(b))

    hip_center_x = (landmarks[L_HIP].x + landmarks[R_HIP].x) / 2
    return PersonPose(angles=angles, hip_center_x=hip_center_x, landmarks=list(landmarks))


def sort_left_to_right(people: list[PersonPose]) -> list[PersonPose]:
    return sorted(people, key=lambda p: p.hip_center_x)


def mirrored(person: PersonPose) -> PersonPose:
    """左右反転した画像で同じ人を検出したときのポーズ。"""
    return PersonPose(
        angles={MIRROR_JOINT[k]: v for k, v in person.angles.items()},
        hip_center_x=1.0 - person.hip_center_x,
        landmarks=person.landmarks,
    )
