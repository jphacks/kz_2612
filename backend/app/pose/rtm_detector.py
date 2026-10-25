"""RTMPose（rtmlib、onnxruntime）で画像から人物ごとのポーズを抽出する。既定のエンジン。

人を見つける（YOLOX）→ 一人ずつ骨格を読む（RTMPose）の2段階なので、
近くに並んだ複数人や、胸から上だけの写真でも骨格を読み違えにくい（MediaPipe との比較は README 参照）。
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
from PIL import Image

from app.pose.angles import Landmark, PersonPose, person_pose_from_landmarks, sort_left_to_right
from app.pose.base import validate_key

MODELS = Path(__file__).resolve().parents[2] / "models"
DEFAULT_DET_PATH = MODELS / "rtm_det_yolox_m.onnx"
DEFAULT_POSE_PATH = MODELS / "rtm_pose_rtmpose_m.onnx"

# COCO の17点 → MediaPipe の33点の番号（角度の計算は MediaPipe の番号で書いてあるのでそろえる）
# 鼻・目・耳は、顔をどの人に結びつけるかに使う
COCO_TO_MP = {
    0: 0, 1: 2, 2: 5, 3: 7, 4: 8,
    5: 11, 6: 12, 7: 13, 8: 14, 9: 15, 10: 16, 11: 23, 12: 24, 13: 25, 14: 26, 15: 27, 16: 28,
}
L_SHOULDER, R_SHOULDER = 5, 6


class RtmPoseDetector:
    def __init__(
        self,
        det_path: str | Path | None = None,
        pose_path: str | Path | None = None,
        min_score: float | None = None,
        min_points_per_person: int = 2,
    ):
        from rtmlib import Body  # 起動を軽くするため、使うときに読み込む

        det_path = Path(det_path or os.environ.get("EMO_RTM_DET_PATH") or DEFAULT_DET_PATH)
        pose_path = Path(pose_path or os.environ.get("EMO_RTM_POSE_PATH") or DEFAULT_POSE_PATH)
        for p in (det_path, pose_path):
            if not p.exists():
                raise FileNotFoundError(f"姿勢推定モデルが見つかりません: {p}（backend/README.md 参照）")
        # balanced モードと同じモデル・入力サイズ（YOLOX-m ＋ RTMPose-m）
        self._body = Body(
            det=str(det_path), det_input_size=(640, 640),
            pose=str(pose_path), pose_input_size=(192, 256),
            backend="onnxruntime", device="cpu",
        )
        # RTMPose の点ごとの確からしさ（0〜1くらい）がこれ以上なら「写っている」とみなす。
        # 0.3 だと、画面外のひざ・足首を下端に寄せて推測した点（0.3〜0.47）まで拾ってしまう
        self.min_score = float(os.environ.get("EMO_RTM_MIN_SCORE", "0.5")) if min_score is None else min_score
        self.min_points_per_person = min_points_per_person

    def close(self) -> None:
        pass

    def __enter__(self) -> "RtmPoseDetector":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def detect(self, image: Image.Image) -> list[PersonPose]:
        """画像に写っている人を左から順に返す。"""
        bgr = np.ascontiguousarray(np.asarray(image)[:, :, ::-1])
        keypoints, scores = self._body(bgr)
        w, h = image.size
        people = []
        for kpts, sc in zip(keypoints, scores):
            # 両肩が見えない検出は、背景を人と見間違えたものとして捨てる
            if min(sc[L_SHOULDER], sc[R_SHOULDER]) < self.min_score:
                continue
            lms = [Landmark(0.5, 0.5, 0.0) for _ in range(33)]
            for coco, mp_index in COCO_TO_MP.items():
                x, y = float(kpts[coco][0]) / w, float(kpts[coco][1]) / h
                # 画像の外にある点は推測なので「写っていない」とする
                inside = 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0
                # 見えている／いないの2値にして、MediaPipe と同じしきい値（0.5）で扱えるようにする
                visible = 1.0 if inside and sc[coco] >= self.min_score else 0.0
                lms[mp_index] = Landmark(x, y, visible)
            people.append(person_pose_from_landmarks(lms, w, h))
        return sort_left_to_right(people)

    def extract_key(self, image: Image.Image) -> list[PersonPose]:
        return validate_key(self.detect(image), self.min_points_per_person)
