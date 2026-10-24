"""FastAPI の依存性。テストでは app.dependency_overrides で差し替える。"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from fastapi import Header

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


def current_user(
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
) -> dict:
    """ログイン中のユーザー。

    Cognito が入るまでは X-User-Id ヘッダー（無ければ固定のデモユーザー）で代替する（PRD F-1）。
    Cognito 導入後は API Gateway の JWT オーソライザーの claims（sub, email）に置き換える。
    """
    return {"user_id": x_user_id or DEMO_USER_ID, "email": x_user_email}
