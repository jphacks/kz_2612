"""エラーはすべて {"error": {"code": ..., "message": ...}} の形で返す。

message はそのまま画面に出せる、やわらかい日本語にする（PRD: 冷たい「認証エラー」は出さない）。
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, **extra: Any):
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, e: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=e.status,
            content={"error": {"code": e.code, "message": e.message, **e.extra}},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, e: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "入力内容を確認してね",
                    "details": [{"loc": list(err["loc"]), "msg": err["msg"]} for err in e.errors()],
                }
            },
        )
