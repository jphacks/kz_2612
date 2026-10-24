"""画像の置き場所。AWS では S3、ローカル開発ではディスク上のファイル。

どちらも「ブラウザが署名付きURLで直接 PUT / GET する」形にそろえ、フロントのコードを変えずに切り替えられるようにする。
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from pathlib import Path
from typing import Protocol
from urllib.parse import quote, urlencode


class ObjectNotFound(Exception):
    pass


class Storage(Protocol):
    def presign_put(self, key: str, content_type: str, expires: int) -> str: ...
    def presign_get(self, key: str, expires: int) -> str: ...
    def size(self, key: str) -> int | None: ...
    def get_bytes(self, key: str) -> bytes: ...
    def put_bytes(self, key: str, data: bytes, content_type: str) -> None: ...


class S3Storage:
    def __init__(self, bucket: str, region: str, client=None):
        import boto3
        from botocore.config import Config

        self.bucket = bucket
        # 署名付きURLをリージョン付きのエンドポイントで発行する（CORS とリダイレクト対策）
        self.client = client or boto3.client(
            "s3", region_name=region, config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"})
        )

    def presign_put(self, key: str, content_type: str, expires: int) -> str:
        return self.client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=expires,
        )

    def presign_get(self, key: str, expires: int) -> str:
        return self.client.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=expires
        )

    def size(self, key: str) -> int | None:
        from botocore.exceptions import ClientError

        try:
            return self.client.head_object(Bucket=self.bucket, Key=key)["ContentLength"]
        except ClientError as e:
            if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
                return None
            raise

    def get_bytes(self, key: str) -> bytes:
        from botocore.exceptions import ClientError

        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except ClientError as e:
            if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
                raise ObjectNotFound(key) from e
            raise

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)


class LocalStorage:
    """ローカル開発用。URL は FastAPI の /local-s3/ に向き、期限と署名を S3 と同じように検証する。"""

    def __init__(self, root: str | Path, base_url: str, secret: bytes | None = None):
        self.root = Path(root) / "objects"
        self.root.mkdir(parents=True, exist_ok=True)
        self.base_url = base_url
        self.secret = secret or secrets.token_bytes(32)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root.resolve() not in path.parents:
            raise ValueError(f"invalid key: {key}")
        return path

    def _sign(self, method: str, key: str, exp: int) -> str:
        return hmac.new(self.secret, f"{method}\n{key}\n{exp}".encode(), hashlib.sha256).hexdigest()

    def _url(self, method: str, key: str, expires: int) -> str:
        exp = int(time.time()) + expires
        query = urlencode({"method": method, "exp": exp, "sig": self._sign(method, key, exp)})
        return f"{self.base_url}/local-s3/{quote(key)}?{query}"

    def verify(self, method: str, key: str, exp: int, sig: str) -> bool:
        return exp >= time.time() and hmac.compare_digest(sig, self._sign(method, key, exp))

    def presign_put(self, key: str, content_type: str, expires: int) -> str:
        return self._url("PUT", key, expires)

    def presign_get(self, key: str, expires: int) -> str:
        return self._url("GET", key, expires)

    def size(self, key: str) -> int | None:
        path = self._path(key)
        return path.stat().st_size if path.exists() else None

    def get_bytes(self, key: str) -> bytes:
        path = self._path(key)
        if not path.exists():
            raise ObjectNotFound(key)
        return path.read_bytes()

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
