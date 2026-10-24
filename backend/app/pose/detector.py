"""MediaPipe Pose Landmarker で画像から人物ごとのポーズを抽出する。

Lambda では同じコンテナが再利用されるので、PoseDetector はモジュール単位で1つだけ作って使い回す。
"""

from __future__ import annotations

import io
import os
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision
from PIL import Image, ImageDraw, ImageOps

from app.pose.angles import JOINTS, Landmark, PersonPose, person_pose_from_landmarks, sort_left_to_right
from app.pose.config import MAX_PEOPLE

DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "pose_landmarker_full.task"


class PoseExtractionError(Exception):
    """鍵の写真として使えない画像。code はフロントで案内文を出し分けるために使う。"""

    def __init__(self, code: str, message: str, detected_people: int):
        super().__init__(message)
        self.code = code
        self.message = message
        self.detected_people = detected_people


def load_image(data: bytes | str | Path) -> Image.Image:
    """バイト列またはパスから RGB 画像を読む。スマホ写真の EXIF の向きも直す。"""
    image = Image.open(io.BytesIO(data)) if isinstance(data, bytes) else Image.open(data)
    return ImageOps.exif_transpose(image).convert("RGB")


class PoseDetector:
    def __init__(
        self,
        model_path: str | Path | None = None,
        min_visibility: float = 0.5,
        detection_confidence: float | None = None,
    ):
        model_path = Path(model_path or os.environ.get("EMO_POSE_MODEL_PATH") or DEFAULT_MODEL_PATH)
        if not model_path.exists():
            raise FileNotFoundError(f"姿勢推定モデルが見つかりません: {model_path}（backend/README.md 参照）")
        # 既定の0.5だと複数人の写真で2人目以降を見落としやすい。サンプルでは0.2で誤検出なし
        if detection_confidence is None:
            detection_confidence = float(os.environ.get("EMO_DETECTION_CONFIDENCE", "0.2"))
        options = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.IMAGE,
            # 5人以上を「多すぎる」と判定できるよう1人多く検出させる
            num_poses=MAX_PEOPLE + 1,
            min_pose_detection_confidence=detection_confidence,
            min_pose_presence_confidence=detection_confidence,
        )
        self._landmarker = vision.PoseLandmarker.create_from_options(options)
        self.min_visibility = min_visibility

    def close(self) -> None:
        self._landmarker.close()

    def __enter__(self) -> "PoseDetector":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def detect(self, image: Image.Image) -> list[PersonPose]:
        """画像に写っている人を左から順に返す。"""
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(image))
        result = self._landmarker.detect(mp_image)
        people = [
            person_pose_from_landmarks(
                [Landmark(lm.x, lm.y, lm.visibility if lm.visibility is not None else 1.0) for lm in pose],
                image.width,
                image.height,
                self.min_visibility,
            )
            for pose in result.pose_landmarks
        ]
        return sort_left_to_right(people)

    def extract_key(self, image: Image.Image) -> list[PersonPose]:
        """思い出の写真から鍵を取り出す（PRD F-2）。使えない写真なら PoseExtractionError。"""
        people = self.detect(image)
        if not people:
            raise PoseExtractionError("no_person", "人が見つからなかったよ。別の写真を選んでみて", 0)
        if len(people) > MAX_PEOPLE:
            raise PoseExtractionError(
                "too_many_people", f"{MAX_PEOPLE}人までの写真を選んでね", len(people)
            )
        return people


_COLORS = [(255, 99, 132), (54, 162, 235), (255, 206, 86), (75, 192, 192), (153, 102, 255)]
_BONES = [(11, 12), (11, 23), (12, 24), (23, 24)] + [
    pair for a, v, b in JOINTS.values() for pair in ((a, v), (v, b))
]


def draw_overlay(image: Image.Image, people: list[PersonPose]) -> Image.Image:
    """抽出結果のプレビュー（骨格を重ねた写真）を作る。"""
    out = image.copy()
    draw = ImageDraw.Draw(out)
    w, h = out.size
    r = max(3, min(w, h) // 120)
    for idx, person in enumerate(people):
        if not person.landmarks:
            continue
        color = _COLORS[idx % len(_COLORS)]
        pts = [(lm.x * w, lm.y * h) for lm in person.landmarks]
        for a, b in set(_BONES):
            draw.line([pts[a], pts[b]], fill=color, width=r)
        for _, v, _ in JOINTS.values():
            x, y = pts[v]
            draw.ellipse([x - r, y - r, x + r, y + r], fill=color)
        draw.text((person.hip_center_x * w, 10), str(idx + 1), fill=color)
    return out
