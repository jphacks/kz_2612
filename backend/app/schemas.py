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
    open_date: dt.date | None = Field(default=None, description="開封日（日本時間）。省略するといつでも開けられる")
    key_photo_s3_key: str


class GuidePerson(BaseModel):
    position: int = Field(description="左から何番目か（0始まり）")
    angles: dict[str, float | None]
    points: dict[str, list[float] | None] = Field(description="体の12点の正規化座標 [x, y]（0〜1）")
    face_registered: bool = Field(default=False, description="顔の記憶があるか（鍵の写真で顔が見えなかった人は、最初に開けたときに覚える）")


class CapsuleSummary(BaseModel):
    capsule_id: str
    name: str
    open_date: dt.date | None
    days_until_open: int | None = Field(description="開封日までの日数。開封日がなければ null")
    status: Literal["locked", "opened"] = Field(description="opened は一度でも開けたことがある")
    people_count: int
    role: Literal["owner", "member"]


class CapsuleListItem(CapsuleSummary):
    key_photo_url: str = Field(description="一覧のサムネイル用。鍵の写真の署名付きURL")
    url_expires_in: int


class CapsuleDetail(CapsuleSummary):
    key_photo_url: str
    preview_url: str | None = Field(description="鍵の写真に骨格を重ねたプレビュー")
    url_expires_in: int
    guide: list[GuidePerson]
    can_open_now: bool = Field(description="開封日を過ぎていて、ロック中でない")
    locked_until: dt.datetime | None
    attempts_left: int | None = Field(description="ロックまでの残り回数。null は回数制限なし")
    contents_count: int
    opened_at: dt.datetime | None


class AddContentRequest(BaseModel):
    type: Literal["photo"]
    s3_key: str = Field(description="purpose=content でアップロードした写真")


class ContentMeta(BaseModel):
    content_id: str
    type: Literal["photo"]
    author_id: str
    created_at: dt.datetime


class ContentView(ContentMeta):
    url: str


class OpenRequest(BaseModel):
    s3_key: str = Field(description="purpose=attempt でアップロードした撮影画像")


class JointDiffOut(BaseModel):
    key_deg: float
    attempt_deg: float
    diff_deg: float
    ok: bool


class PointDiffOut(BaseModel):
    key: list[float]
    attempt: list[float]
    diff: float = Field(description="肩幅を1とした距離")
    ok: bool


class PersonResultOut(BaseModel):
    position: int
    ok: bool
    mean_diff_deg: float | None
    max_diff_deg: float | None
    joints: dict[str, JointDiffOut]
    missing_joints: list[str] = Field(default_factory=list, description="当時は写っていたのに今は写っていない点。両肩が見えないときは shoulders")
    points: dict[str, PointDiffOut] = Field(default_factory=dict, description="点の位置のずれ（両肩の中心が原点、肩幅が1）")
    mean_point_diff: float | None = None


class FacePersonOut(BaseModel):
    position: int = Field(description="左から何番目か（0始まり）")
    visible: bool = Field(description="顔が見えたか")
    checked: bool = Field(description="顔の記憶があって判定したか")
    ok: bool
    similarity: float | None = Field(description="顔の記憶のうち、いちばん似ている顔との類似度（-1〜1）")
    others: float | None = Field(description="ほかの立ち位置の人の記憶との、いちばん高い類似度")


class MatchResultOut(BaseModel):
    ok: bool
    reason: Literal["count_mismatch", "pose_mismatch", "body_not_visible", "no_person",
                    "face_not_visible", "face_mismatch"] | None
    score: int = Field(description="一致度ゲージ用 0〜100。許容値ちょうどで70")
    message: str = Field(description="そのまま画面に出せる声かけ")
    expected_people: int
    detected_people: int
    mirrored: bool
    people: list[PersonResultOut]
    faces: list[FacePersonOut] = Field(default_factory=list, description="顔の判定（ポーズが合ったときだけ入る）")


class OpenedContents(BaseModel):
    key_photo_url: str
    contents: list[ContentView]
    url_expires_in: int


class UnlockSession(BaseModel):
    token: str = Field(description="ライブラリの API に X-Unlock-Token ヘッダーで付ける")
    expires_at: dt.datetime | None = Field(description="null は期限なし")


class OpenResponse(BaseModel):
    ok: bool
    result: MatchResultOut
    attempts_left: int | None = Field(description="ロックまでの残り回数。null は回数制限なし")
    locked_until: dt.datetime | None
    opened: OpenedContents | None = Field(description="ok=true のときだけ入る")
    unlock: UnlockSession | None = Field(default=None, description="ok=true のときだけ入る。解除中の閲覧セッション")


class MemberOut(BaseModel):
    user_id: str
    role: Literal["owner", "member"]
    email: str | None = None


class InviteCreated(BaseModel):
    token: str = Field(description="招待リンクに埋め込む。例: https://<フロント>/invite/{token}")
    expires_at: dt.datetime


class InvitePreview(BaseModel):
    """招待リンクを開いた人に見せる情報。参加前なので写真や中身は含めない。"""
    capsule_id: str
    capsule_name: str
    open_date: dt.date | None
    days_until_open: int | None
    people_count: int = Field(description="鍵の写真に写っている人数（開けるときに揃う必要がある人数）")
    members_count: int
    invited_by: str
    expires_at: dt.datetime
    already_member: bool
