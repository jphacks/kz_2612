"""顔の判定。鍵の写真の顔（と、開けるたびに増える顔の記憶）と、今の顔を比べる。

- 顔を見つける: OpenCV の YuNet
- 顔の特徴を数字にする: OpenCV の SFace（128個の数字。コサイン類似度で比べる）
- 顔をどの人に結びつけるか: 骨格の鼻・目・耳が、その顔の枠の中にあるか

判定（立ち位置ごと）:
- 顔の記憶のうち、いちばん似ている顔との類似度が threshold 以上
- かつ、ほかの立ち位置の人の記憶より margin 以上よく似ている（入れ替わり・そっくりさん対策）
- 顔が見えない人は max_hidden 人まで

保存するのは顔の特徴の数字だけで、顔の画像は保存しない。
"""

from __future__ import annotations

import datetime as dt
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image

from app.pose.angles import PersonPose

MODELS = Path(__file__).resolve().parents[2] / "models"
DEFAULT_DET_PATH = MODELS / "face_detection_yunet_2023mar.onnx"
DEFAULT_REC_PATH = MODELS / "face_recognition_sface_2021dec.onnx"

# 骨格の頭の点（MediaPipe の番号）: 鼻・左目・右目・左耳・右耳
HEAD_POINTS = (0, 2, 5, 7, 8)


@dataclass(frozen=True)
class FaceConfig:
    enabled: bool = True
    # いちばん似ている記憶との類似度がこれ以上なら本人（今日の写真: 本人0.73〜0.94、友達0.19〜0.35、他人〜0.17）
    # 0.40 では髪型や光の加減で本人が落ちることがあったので、デモに合わせて 0.32 に緩めた
    threshold: float = 0.32
    # ほかの立ち位置の人の記憶より、これ以上よく似ている必要がある
    margin: float = 0.02
    # 顔が見えなくてもよい人数（0 だと横を向いた1人で落ちるので、デモに合わせて1人まで許す）
    max_hidden: int = 1
    # 開けたときの顔を、1人あたり何枚まで記憶しておくか（鍵の写真の顔は別にずっと残す）
    memory: int = 5

    @classmethod
    def from_env(cls) -> FaceConfig:
        d = cls()
        env = os.environ.get
        return cls(
            enabled=env("EMO_FACE_CHECK", "true").strip().lower() in ("1", "true", "yes", "on"),
            threshold=float(env("EMO_FACE_THRESHOLD", str(d.threshold))),
            margin=float(env("EMO_FACE_MARGIN", str(d.margin))),
            max_hidden=int(env("EMO_MAX_HIDDEN_FACES", str(d.max_hidden))),
            memory=int(env("EMO_FACE_MEMORY", str(d.memory))),
        )


@dataclass
class Face:
    # 画像上の顔の枠（ピクセル）
    box: tuple[float, float, float, float]
    # 長さ1にそろえた128個の特徴
    embedding: list[float]
    score: float = 1.0


class FaceEncoder:
    def __init__(self, det_path: str | Path | None = None, rec_path: str | Path | None = None):
        import cv2

        det_path = Path(det_path or os.environ.get("EMO_FACE_DET_PATH") or DEFAULT_DET_PATH)
        rec_path = Path(rec_path or os.environ.get("EMO_FACE_REC_PATH") or DEFAULT_REC_PATH)
        for p in (det_path, rec_path):
            if not p.exists():
                raise FileNotFoundError(f"顔のモデルが見つかりません: {p}（backend/README.md 参照）")
        self._cv2 = cv2
        # 顔らしさ0.8以上、最大20人
        self._det = cv2.FaceDetectorYN.create(str(det_path), "", (320, 320), 0.8, 0.3, 20)
        self._rec = cv2.FaceRecognizerSF.create(str(rec_path), "")

    def encode(self, image: Image.Image) -> list[Face]:
        bgr = np.ascontiguousarray(np.asarray(image)[:, :, ::-1])
        h, w = bgr.shape[:2]
        self._det.setInputSize((w, h))
        _, found = self._det.detect(bgr)
        faces = []
        for f in found if found is not None else []:
            feat = self._rec.feature(self._rec.alignCrop(bgr, f)).flatten().astype(float)
            norm = float(np.linalg.norm(feat)) or 1.0
            faces.append(
                Face(
                    box=(float(f[0]), float(f[1]), float(f[2]), float(f[3])),
                    embedding=(feat / norm).tolist(),
                    score=float(f[14]),
                )
            )
        return faces


def similarity(a: list[float], b: list[float]) -> float:
    """長さ1にそろえた特徴どうしのコサイン類似度（-1〜1）。"""
    return float(np.dot(np.asarray(a), np.asarray(b)))


def assign_faces(people: list[PersonPose], faces: list[Face], width: int, height: int) -> list[Face | None]:
    """見つけた顔を、骨格の人（左から順）に結びつける。結びつかない人は None。

    骨格の頭の点（鼻・目・耳）が、少し広げた顔の枠に入っていれば、その人の顔とみなす。
    1つの顔は1人にしか結びつけない。
    """
    pairs = []
    for i, person in enumerate(people):
        lms = person.landmarks
        pts = [(lms[k].x * width, lms[k].y * height) for k in HEAD_POINTS if lms and lms[k].visibility >= 0.5]
        if not pts:
            continue
        hx, hy = float(np.mean([p[0] for p in pts])), float(np.mean([p[1] for p in pts]))
        for j, face in enumerate(faces):
            x, y, w, h = face.box
            mx, my = w * 0.25, h * 0.25
            if x - mx <= hx <= x + w + mx and y - my <= hy <= y + h + my:
                dist = ((x + w / 2 - hx) ** 2 + (y + h / 2 - hy) ** 2) ** 0.5
                pairs.append((dist, i, j))
    result: list[Face | None] = [None] * len(people)
    used = set()
    for _, i, j in sorted(pairs):
        if result[i] is None and j not in used:
            result[i] = faces[j]
            used.add(j)
    return result


# ---- 顔の記憶 ----


def new_memory(face: Face | None) -> list[dict]:
    """鍵の写真の顔から、その人の顔の記憶を作る。顔が見つからなければ空（次に開けたときの顔から覚える）。"""
    return [] if face is None else [{"embedding": face.embedding, "source": "key"}]


def update_memory(memory: list[dict], face: Face | None, limit: int) -> list[dict]:
    """開けるのに成功したときの顔を記憶に加える。鍵の写真の顔は残し、開けたときの顔は新しい limit 件だけ持つ。"""
    if face is None:
        return memory
    key = [m for m in memory if m.get("source") == "key"]
    opened = [m for m in memory if m.get("source") != "key"]
    opened.append({"embedding": face.embedding, "source": "open", "at": dt.datetime.now(dt.UTC).isoformat()})
    return key + opened[-limit:]


# ---- 判定 ----

FaceReason = Literal["face_not_visible", "face_mismatch"]


@dataclass
class FacePersonResult:
    position: int
    # 顔が見えたか
    visible: bool
    # 記憶がない（鍵の写真で顔が見えず、まだ一度も開けていない）ときは判定しない
    checked: bool
    ok: bool
    similarity: float | None = None
    # ほかの立ち位置の人の記憶とのいちばん高い類似度
    others: float | None = None

    def to_dict(self) -> dict:
        r = lambda v: None if v is None else round(v, 3)  # noqa: E731
        return {
            "position": self.position,
            "visible": self.visible,
            "checked": self.checked,
            "ok": self.ok,
            "similarity": r(self.similarity),
            "others": r(self.others),
        }


@dataclass
class FaceResult:
    ok: bool
    reason: FaceReason | None
    message: str
    people: list[FacePersonResult] = field(default_factory=list)


def _label(position: int, total: int) -> str:
    if total == 1:
        return ""
    if total == 2:
        return "左の人の" if position == 0 else "右の人の"
    return f"左から{position + 1}番目の人の"


def match_faces(memories: list[list[dict]], faces: list[Face | None], config: FaceConfig) -> FaceResult:
    """立ち位置ごとの顔の記憶と、今の顔（左から順、見えなければ None）を比べる。"""
    n = len(memories)
    people: list[FacePersonResult] = []
    for i, (memory, face) in enumerate(zip(memories, faces)):
        if not memory:
            people.append(FacePersonResult(i, visible=face is not None, checked=False, ok=True))
            continue
        if face is None:
            people.append(FacePersonResult(i, visible=False, checked=True, ok=False))
            continue
        best = max(similarity(face.embedding, m["embedding"]) for m in memory)
        others = [similarity(face.embedding, m["embedding"]) for j, mem in enumerate(memories) if j != i for m in mem]
        other = max(others) if others else None
        ok = best >= config.threshold and (other is None or best - other >= config.margin)
        people.append(FacePersonResult(i, visible=True, checked=True, ok=ok, similarity=best, others=other))

    hidden = [p for p in people if p.checked and not p.visible]
    if len(hidden) > config.max_hidden:
        label = _label(hidden[0].position, n)
        return FaceResult(
            False,
            "face_not_visible",
            f"{label[:-1] if label else 'あなた'}の顔が見えないみたい。顔が写るようにしてみて",
            people,
        )
    wrong = [p for p in people if p.checked and p.visible and not p.ok]
    if wrong:
        p = wrong[0]
        label = _label(p.position, n)
        who = label[:-1] if label else "あなた"
        if p.similarity is not None and p.similarity >= config.threshold:
            # 本人らしいが、ほかの立ち位置の人のほうがもっと似ている
            msg = f"{who}が、あの日と別の立ち位置の人に見えるみたい。あの日と同じ並びになってる？"
        else:
            msg = f"{who}の顔が、あの日のメンバーと確かめられなかったよ。明るいところで、顔がよく見えるようにしてみて"
        return FaceResult(False, "face_mismatch", msg, people)
    return FaceResult(True, None, "", people)
