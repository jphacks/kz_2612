"""FastAPI の依存性。テストでは app.dependency_overrides で差し替える。"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from fastapi import Depends, Header, Request

from app.errors import ApiError
from app.pose.base import Detector
from app.pose.config import MatchConfig
from app.pose.face import FaceConfig, FaceEncoder
from app.repository import DynamoItemStore, JsonItemStore, Repository
from app.settings import Settings, get_settings
from app.storage import LocalStorage, S3Storage, Storage

DEMO_USER_ID = "demo-user"


def settings_dep() -> Settings:
    return get_settings()


@lru_cache
def get_storage() -> Storage:
    s = get_settings()
    if s.backend == "aws":
        return S3Storage(s.bucket, s.region)
    return LocalStorage(s.local_data_dir, s.public_base_url)


@lru_cache
def get_repository() -> Repository:
    s = get_settings()
    if s.backend == "aws":
        return Repository(DynamoItemStore(s.table, s.region))
    return Repository(JsonItemStore(Path(s.local_data_dir) / "db.json"))


@lru_cache
def get_detector() -> Detector:
    # Lambda ではコンテナが再利用される間、モデルを読み込んだまま使い回す
    config = get_match_config()
    if os.environ.get("EMO_POSE_ENGINE", "rtmpose") == "mediapipe":
        from app.pose.detector import PoseDetector

        return PoseDetector(min_visibility=config.min_visibility, min_points_per_person=config.min_points_per_person)
    from app.pose.rtm_detector import RtmPoseDetector

    return RtmPoseDetector(min_points_per_person=config.min_points_per_person)


@lru_cache
def get_face_config() -> FaceConfig:
    return FaceConfig.from_env()


@lru_cache
def get_face_encoder() -> FaceEncoder | None:
    """顔の判定を切っているときは None。"""
    return FaceEncoder() if get_face_config().enabled else None


@lru_cache
def get_match_config() -> MatchConfig:
    return MatchConfig.from_env()


def _gateway_user(request: Request) -> dict | None:
    event = request.scope.get("aws.event")
    if not isinstance(event, dict):
        return None
    request_context = event.get("requestContext")
    if not isinstance(request_context, dict):
        return None
    authorizer = request_context.get("authorizer")
    if not isinstance(authorizer, dict):
        return None
    jwt = authorizer.get("jwt")
    if not isinstance(jwt, dict):
        return None
    claims = jwt.get("claims")
    if not isinstance(claims, dict) or not claims.get("sub"):
        return None
    return {
        "user_id": str(claims["sub"]),
        "email": claims.get("email"),
    }


def optional_user(
    request: Request,
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
    settings: Settings = Depends(settings_dep),
) -> dict | None:
    """ログイン中のユーザー。公開APIでは未ログインなら None を返す。"""
    gateway_user = _gateway_user(request)
    if gateway_user:
        return gateway_user
    if settings.auth_mode == "cognito":
        return None
    return {"user_id": x_user_id or DEMO_USER_ID, "email": x_user_email}


def current_user(
    user: dict | None = Depends(optional_user),
) -> dict:
    """ログイン中のユーザー。

    development では X-User-Id、cognito では API Gateway が検証した claims を使う。
    """
    if user is None:
        raise ApiError(401, "login_required", "続けるにはGoogleでログインしてね")
    return user
