"""姿勢推定エンジン（RTMPose / MediaPipe）に共通の部品。"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Protocol

from PIL import Image, ImageDraw, ImageOps

from app.pose.angles import JOINTS, PersonPose
from app.pose.config import MAX_PEOPLE


class PoseExtractionError(Exception):
    """鍵の写真として使えない画像。code はフロントで案内文を出し分けるために使う。"""

    def __init__(self, code: str, message: str, detected_people: int):
        super().__init__(message)
        self.code = code
        self.message = message
        self.detected_people = detected_people


class Detector(Protocol):
    def detect(self, image: Image.Image) -> list[PersonPose]: ...
    def extract_key(self, image: Image.Image) -> list[PersonPose]: ...
    def close(self) -> None: ...


def load_image(data: bytes | str | Path) -> Image.Image:
    """バイト列またはパスから RGB 画像を読む。スマホ写真の EXIF の向きも直す。"""
    image = Image.open(io.BytesIO(data)) if isinstance(data, bytes) else Image.open(data)
    return ImageOps.exif_transpose(image).convert("RGB")


def validate_key(people: list[PersonPose], min_points_per_person: int) -> list[PersonPose]:
    """思い出の写真から取り出した鍵が使えるか確かめる（PRD F-2）。使えなければ PoseExtractionError。"""
    if not people:
        raise PoseExtractionError("no_person", "人が見つからなかったよ。別の写真を選んでみて", 0)
    if len(people) > MAX_PEOPLE:
        raise PoseExtractionError("too_many_people", f"{MAX_PEOPLE}人までの写真を選んでね", len(people))
    # 両肩と、ひじ・手首などの点が少しは写っていないと比べようがない（どう撮っても開けられないカプセルになる）。
    # 片手が隠れているなど、自由なポーズはそのまま鍵にできる
    unreadable = [i for i, p in enumerate(people) if p.visible_points() < min_points_per_person]
    if unreadable:
        who = (
            ""
            if len(people) == 1
            else (
                f"{'左' if unreadable[0] == 0 else '右'}の人の"
                if len(people) == 2
                else f"左から{unreadable[0] + 1}番目の人の"
            )
        )
        raise PoseExtractionError(
            "pose_not_visible",
            f"{who}ポーズが読み取れなかったよ。両肩と、腕（ひじか手）が写るように撮ってね",
            len(people),
        )
    return people


_COLORS = [(255, 99, 132), (54, 162, 235), (255, 206, 86), (75, 192, 192), (153, 102, 255)]
_BONES = [(11, 12), (11, 23), (12, 24), (23, 24)] + [pair for a, v, b in JOINTS.values() for pair in ((a, v), (v, b))]


def draw_overlay(image: Image.Image, people: list[PersonPose], min_visibility: float = 0.5) -> Image.Image:
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
        # 写っていない点（画面外を推測した点）は描かない。描くと読み取れているように見えてしまう
        seen = [lm.visibility >= min_visibility for lm in person.landmarks]
        for a, b in set(_BONES):
            if seen[a] and seen[b]:
                draw.line([pts[a], pts[b]], fill=color, width=r)
        for _, v, _ in JOINTS.values():
            if seen[v]:
                x, y = pts[v]
                draw.ellipse([x - r, y - r, x + r, y + r], fill=color)
        draw.text((person.hip_center_x * w, 10), str(idx + 1), fill=color)
    return out
