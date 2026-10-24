"""API の入出力。ここが API 仕様（/docs の OpenAPI）の元になる。"""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field

UploadPurpose = Literal["key", "attempt", "content"]
ImageType = Literal["image/jpeg", "image/png", "image/webp"]


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody


class UploadRequest(BaseModel):
    purpose: UploadPurpose = Field(description="key: 思い出の写真 / attempt: 開封時の撮影 / content: 中身の写真")
    content_type: ImageType = "image/jpeg"


class UploadResponse(BaseModel):
    upload_url: str
    method: Literal["PUT"] = "PUT"
    headers: dict[str, str] = Field(description="PUT のときに必ず付けるヘッダー")
    s3_key: str
    expires_in: int


class CreateCapsuleRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    open_date: dt.date = Field(description="開封日（日本時間）")
    key_photo_s3_key: str


class GuidePerson(BaseModel):
    position: int = Field(description="左から何番目か（0始まり）")
    angles: dict[str, float | None]
    points: dict[str, list[float] | None] = Field(description="体の12点の正規化座標 [x, y]（0〜1）")


class CapsuleSummary(BaseModel):
    capsule_id: str
    name: str
    open_date: dt.date
    days_until_open: int
    status: Literal["locked", "opened"]
    people_count: int
    role: Literal["owner", "member"]


class CapsuleDetail(CapsuleSummary):
    key_photo_url: str
    preview_url: str | None = Field(description="鍵の写真に骨格を重ねたプレビュー")
    url_expires_in: int
    guide: list[GuidePerson]
    can_open_now: bool = Field(description="開封日を過ぎていて、ロック中でない")
    locked_until: dt.datetime | None
    attempts_left: int
    contents_count: int
    opened_at: dt.datetime | None


class AddContentRequest(BaseModel):
    type: Literal["message", "photo"]
    text: str | None = Field(default=None, max_length=2000, description="type=message のとき必須")
    s3_key: str | None = Field(default=None, description="type=photo のとき必須（purpose=content でアップロードしたもの）")


class ContentMeta(BaseModel):
    content_id: str
    type: Literal["message", "photo"]
    author_id: str
    created_at: dt.datetime


class ContentView(ContentMeta):
    text: str | None = None
    url: str | None = None


class OpenRequest(BaseModel):
    s3_key: str = Field(description="purpose=attempt でアップロードした撮影画像")


class JointDiffOut(BaseModel):
    key_deg: float
    attempt_deg: float
    diff_deg: float
    ok: bool


class PersonResultOut(BaseModel):
    position: int
    ok: bool
    mean_diff_deg: float | None
    max_diff_deg: float | None
    joints: dict[str, JointDiffOut]


class MatchResultOut(BaseModel):
    ok: bool
    reason: Literal["count_mismatch", "pose_mismatch", "body_not_visible", "no_person"] | None
    score: int = Field(description="一致度ゲージ用 0〜100。許容値ちょうどで70")
    message: str = Field(description="そのまま画面に出せる声かけ")
    expected_people: int
    detected_people: int
    mirrored: bool
    people: list[PersonResultOut]


class OpenedContents(BaseModel):
    key_photo_url: str
    attempt_photo_url: str
    contents: list[ContentView]
    url_expires_in: int


class OpenResponse(BaseModel):
    ok: bool
    result: MatchResultOut
    attempts_left: int
    locked_until: dt.datetime | None
    opened: OpenedContents | None = Field(description="ok=true のときだけ入る")


class AlbumEntry(BaseModel):
    opened_at: dt.datetime
    photo_url: str
    score: int


class AlbumResponse(BaseModel):
    key_photo_url: str
    entries: list[AlbumEntry]
    url_expires_in: int
