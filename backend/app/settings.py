"""アプリ全体の設定。すべて環境変数で上書きできる（Lambda の環境変数で設定する）。"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    # "local": JSONファイル＋ローカルディスク / "aws": DynamoDB＋S3
    backend: str = "local"
    bucket: str = "emo-timecapsule"
    table: str = "emo-timecapsule"
    region: str = "ap-northeast-1"
    # "development": X-User-* ヘッダーを使う / "cognito": API Gateway JWT claims を必須にする
    auth_mode: str = "development"

    upload_url_expires: int = 300
    # PRD: 中身の閲覧は期限60秒の署名付きURLのみ
    view_url_expires: int = 60
    max_upload_bytes: int = 10 * 1024 * 1024

    # 何回失敗したらロックするか。0 ならロックしない（既定）。例: 5 にすると5回失敗で lock_minutes 分ロック
    max_failures: int = 0
    lock_minutes: int = 10
    # デモ用: 開封日前でも開けるようにする
    ignore_open_date: bool = False
    # 招待リンクの有効期限（日）
    invite_days: int = 14
    # ポーズで解除してからライブラリを使える時間（分）。既定は最大12時間
    unlock_minutes: int = 12 * 60

    cors_origins: tuple[str, ...] = field(default_factory=lambda: ("*",))

    # backend=local のときだけ使う（どこから起動しても backend/.local_data に保存する）
    local_data_dir: str = str(Path(__file__).resolve().parents[1] / ".local_data")
    public_base_url: str = "http://localhost:8000"

    @classmethod
    def from_env(cls) -> Settings:
        d = cls()
        return cls(
            backend=_env("EMO_BACKEND", d.backend),
            bucket=_env("EMO_BUCKET", d.bucket),
            table=_env("EMO_TABLE", d.table),
            region=_env("AWS_REGION", d.region),
            auth_mode=_env("EMO_AUTH_MODE", d.auth_mode),
            upload_url_expires=int(_env("EMO_UPLOAD_URL_EXPIRES", str(d.upload_url_expires))),
            view_url_expires=int(_env("EMO_VIEW_URL_EXPIRES", str(d.view_url_expires))),
            max_upload_bytes=int(_env("EMO_MAX_UPLOAD_BYTES", str(d.max_upload_bytes))),
            max_failures=int(_env("EMO_MAX_FAILURES", str(d.max_failures))),
            lock_minutes=int(_env("EMO_LOCK_MINUTES", str(d.lock_minutes))),
            ignore_open_date=_env_bool("EMO_IGNORE_OPEN_DATE", d.ignore_open_date),
            invite_days=int(_env("EMO_INVITE_DAYS", str(d.invite_days))),
            unlock_minutes=int(_env("EMO_UNLOCK_MINUTES", str(d.unlock_minutes))),
            cors_origins=tuple(o.strip() for o in _env("EMO_CORS_ORIGINS", "*").split(",") if o.strip()),
            local_data_dir=_env("EMO_LOCAL_DATA_DIR", d.local_data_dir),
            public_base_url=_env("EMO_PUBLIC_BASE_URL", d.public_base_url).rstrip("/"),
        )


@lru_cache
def get_settings() -> Settings:
    return Settings.from_env()
