"""MediaPipe Pose Landmarker で画像から人物ごとのポーズを抽出する（旧エンジン。EMO_POSE_ENGINE=mediapipe で使う）。

近くに並んだ複数人や、腰が写っていない写真では骨格を読み違えやすいので、既定は RTMPose（rtm_detector.py）。
Lambda では同じコンテナが再利用されるので、検出器はモジュール単位で1つだけ作って使い回す。
"""

from __future__ import annotations

import os
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision
from PIL import Image

from app.pose.angles import Landmark, PersonPose, person_pose_from_landmarks, sort_left_to_right
from app.pose.base import PoseExtractionError, draw_overlay, load_image, validate_key
from app.pose.config import MAX_PEOPLE

__all__ = ["PoseDetector", "PoseExtractionError", "draw_overlay", "load_image", "DEFAULT_MODEL_PATH"]

DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "pose_landmarker_full.task"


class PoseDetector:
    def __init__(
        self,
        model_path: str | Path | None = None,
        min_visibility: float = 0.5,
        detection_confidence: float | None = None,
        min_points_per_person: int = 2,
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
        self.min_points_per_person = min_points_per_person

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
        return validate_key(self.detect(image), self.min_points_per_person)
