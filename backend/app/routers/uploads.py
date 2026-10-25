"""画像アップロード用の署名付きURL発行。

画像は API Gateway（上限10MB）を通さず、ブラウザから S3 に直接 PUT する（PRD 9章）。
"""

from __future__ import annotations

import hashlib
import uuid

from fastapi import APIRouter, Depends

from app.deps import current_user, get_storage, settings_dep
from app.schemas import UploadRequest, UploadResponse
from app.settings import Settings
from app.storage import Storage

router = APIRouter(tags=["uploads"])

EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def upload_prefix(user_id: str, purpose: str) -> str:
    """アップロード先のキーの先頭。他人のアップロードを流用できないよう、使う側でもこの形を検査する。"""
    # ローカル開発IDは `dev:mail@example.com` の形で、`:` はWindowsのフォルダ名に使えない。
    # メールアドレスをS3キーへ露出させないためにも、ユーザーIDは固定長のハッシュにそろえる。
    safe_user_id = hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:32]
    return f"uploads/{safe_user_id}/{purpose}/"


@router.post("/uploads", response_model=UploadResponse, summary="アップロード用URLを発行")
def create_upload(
    body: UploadRequest,
    user: dict = Depends(current_user),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(settings_dep),
) -> UploadResponse:
    key = f"{upload_prefix(user['user_id'], body.purpose)}{uuid.uuid4().hex}.{EXTENSIONS[body.content_type]}"
    return UploadResponse(
        upload_url=storage.presign_put(key, body.content_type, settings.upload_url_expires),
        headers={"Content-Type": body.content_type},
        s3_key=key,
        expires_in=settings.upload_url_expires,
    )
