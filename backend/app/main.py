"""FastAPI アプリ。Lambda では handler（Mangum）が入口になる。

ローカル:  uvicorn app.main:app --reload
"""

from __future__ import annotations

import logging
import mimetypes

from fastapi import Depends, FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from mangum import Mangum
from PIL import Image

from app.deps import get_detector, get_storage
from app.errors import ApiError, install_error_handlers
from app.routers import capsules, uploads
from app.settings import get_settings
from app.storage import LocalStorage

logging.basicConfig(level=logging.INFO)

settings = get_settings()
app = FastAPI(
    title="webタイムカプセル / エモ認証 API",
    version="0.1.0",
    description="思い出の写真と同じポーズを、当時のメンバーが揃って再現したときだけ開くタイムカプセル。",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)
install_error_handlers(app)
app.include_router(uploads.router)
app.include_router(capsules.router)


@app.get("/health", tags=["system"], summary="死活確認")
def health() -> dict:
    return {"status": "ok", "backend": settings.backend}


@app.post("/warmup", tags=["system"], summary="モデルを読み込んで温める（発表直前に叩く）")
def warmup() -> dict:
    detector = get_detector()
    detector.detect(Image.new("RGB", (256, 256), "white"))
    return {"status": "warm"}


if settings.backend == "local":
    # ローカル開発用の S3 もどき。署名と期限は LocalStorage が検証する
    @app.put("/local-s3/{key:path}", include_in_schema=False)
    async def local_put(
        key: str, request: Request, method: str = Query(), exp: int = Query(), sig: str = Query(),
        storage: LocalStorage = Depends(get_storage),
    ) -> Response:
        if method != "PUT" or not storage.verify("PUT", key, exp, sig):
            raise ApiError(403, "invalid_signature", "アップロードURLの期限が切れたみたい。もう一度やり直してね")
        data = await request.body()
        if len(data) > settings.max_upload_bytes:
            raise ApiError(413, "image_too_large", "画像が大きすぎるみたい。10MBまでにしてね")
        storage.put_bytes(key, data, request.headers.get("content-type", "application/octet-stream"))
        return Response(status_code=200)

    @app.get("/local-s3/{key:path}", include_in_schema=False)
    def local_get(
        key: str, method: str = Query(), exp: int = Query(), sig: str = Query(),
        storage: LocalStorage = Depends(get_storage),
    ) -> Response:
        if method != "GET" or not storage.verify("GET", key, exp, sig):
            raise ApiError(403, "invalid_signature", "表示URLの期限が切れたみたい。もう一度開いてね")
        media_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
        return Response(storage.get_bytes(key), media_type=media_type)


handler = Mangum(app, lifespan="off")
