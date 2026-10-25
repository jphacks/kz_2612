"""DynamoDB・S3 まわりを moto（AWS のモック）で確かめる。テーブル定義は docs/api.md と同じ。"""

import boto3
import pytest
from moto import mock_aws

from app.repository import DynamoItemStore, Repository
from app.storage import S3Storage

REGION = "ap-northeast-1"


@pytest.fixture
def aws(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name=REGION)
        ddb.create_table(
            TableName="emo",
            KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": n, "AttributeType": "S"} for n in ("PK", "SK", "GSI1PK", "GSI1SK")],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "GSI1",
                    "KeySchema": [
                        {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                        {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        s3 = boto3.client("s3", region_name=REGION)
        s3.create_bucket(Bucket="emo-bucket", CreateBucketConfiguration={"LocationConstraint": REGION})
        yield ddb, s3


def test_repository_on_dynamodb(aws):
    ddb, _ = aws
    repo = Repository(DynamoItemStore("emo", REGION, resource=ddb))
    repo.create_capsule(
        {
            "capsule_id": "c1",
            "name": "結婚式",
            "open_date": "2036-10-24",
            "status": "locked",
            "fail_count": 0,
            "key_pose": {
                "version": 1,
                "people": [{"angles": {"left_elbow": 90.5, "left_knee": None}, "hip_center_x": 0.42}],
            },
        }
    )
    repo.add_member("c1", "alice", "owner")
    repo.add_content(
        {
            "capsule_id": "c1",
            "content_id": "x",
            "type": "photo",
            "s3_key": "contents/x.jpg",
            "author_id": "alice",
            "created_at": "2026-10-24T00:00:00+00:00",
        }
    )

    capsule = repo.get_capsule("c1")
    assert capsule["key_pose"]["people"][0]["angles"] == {"left_elbow": 90.5, "left_knee": None}
    assert capsule["fail_count"] == 0 and isinstance(capsule["fail_count"], int)
    assert "PK" not in capsule

    updated = repo.update_capsule("c1", {"fail_count": 3, "locked_until": None})
    assert updated["fail_count"] == 3
    assert [m["capsule_id"] for m in repo.list_memberships("alice")] == ["c1"]
    assert repo.get_member("c1", "bob") is None
    assert [c["s3_key"] for c in repo.list_contents("c1")] == ["contents/x.jpg"]

    repo.add_member("c1", "bob", "member", "bob@example.com")
    assert [m["user_id"] for m in repo.list_members("c1")] == ["alice", "bob"]
    repo.create_invite(
        {
            "token": "t0k3n",
            "capsule_id": "c1",
            "created_by": "alice",
            "created_at": "2026-10-24T00:00:00+00:00",
            "expires_at": "2026-11-07T00:00:00+00:00",
        }
    )
    assert repo.get_invite("t0k3n")["capsule_id"] == "c1"
    assert repo.get_invite("nope") is None
    # 招待はカプセルとは別のパーティションなので、カプセル配下の検索には出てこない
    assert repo.list_contents("c1")[0]["s3_key"] == "contents/x.jpg"

    repo.create_unlock_session(
        {
            "token": "s3ss",
            "capsule_id": "c1",
            "user_id": "alice",
            "expires_at": "2026-10-24T01:00:00+00:00",
            "ttl": 1792803600,
        }
    )
    assert repo.get_unlock_session("s3ss")["ttl"] == 1792803600
    content = repo.get_content("c1", "x")
    repo.delete_content(content)
    assert repo.list_contents("c1") == []
    assert repo.get_content("c1", "x") is None

    # フォルダの削除: パーティションの全件と、別パーティションの招待・解除セッションも消える
    items = repo.delete_capsule("c1")
    assert {i["entity"] for i in items} >= {"Capsule", "Member", "InviteRef", "SessionRef"}
    assert repo.get_capsule("c1") is None
    assert repo.get_invite("t0k3n") is None
    assert repo.get_unlock_session("s3ss") is None
    assert repo.list_memberships("alice") == []


def test_s3_storage(aws):
    storage = S3Storage("emo-bucket", REGION)
    assert storage.size("nope.jpg") is None
    storage.put_bytes("previews/a.jpg", b"abc", "image/jpeg")
    assert storage.size("previews/a.jpg") == 3
    assert storage.get_bytes("previews/a.jpg") == b"abc"
    storage.delete("previews/a.jpg")
    assert storage.size("previews/a.jpg") is None
    url = storage.presign_put("uploads/alice/key/a.jpg", "image/jpeg", 300)
    assert "X-Amz-Signature" in url and "emo-bucket" in url
