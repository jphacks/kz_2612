"""DynamoDB の1テーブル設計（シングルテーブル）。

| エンティティ | PK              | SK                          | GSI1PK        | GSI1SK           |
| ------------ | --------------- | --------------------------- | ------------- | ---------------- |
| Capsule      | CAPSULE#{id}    | META                        |               |                  |
| Member       | CAPSULE#{id}    | MEMBER#{userId}             | USER#{userId} | CAPSULE#{id}     |
| Content      | CAPSULE#{id}    | CONTENT#{createdAt}#{cid}   |               |                  |
| Invite       | INVITE#{token}  | META                        |               |                  |
| UnlockSession| SESSION#{token} | META                        |               |                  |
| InviteRef    | CAPSULE#{id}    | INVITE#{token}              |               |                  |
| SessionRef   | CAPSULE#{id}    | SESSION#{token}             |               |                  |

UnlockSession の ttl（UNIX秒）は DynamoDB の TTL を有効にすると自動で消える（任意）。
*Ref はフォルダを削除するときに、別のパーティションにある招待・解除セッションを漏れなく消すための目印。

ItemStore が「アイテムの読み書き」だけを担当し、Repository はその上で共通に動く。
ローカルでは JSON ファイル、AWS では DynamoDB の ItemStore を使う。
"""

from __future__ import annotations

import json
import threading
from decimal import Decimal
from pathlib import Path
from typing import Any, Protocol


class ItemStore(Protocol):
    def put(self, item: dict) -> None: ...
    def get(self, pk: str, sk: str) -> dict | None: ...
    def update(self, pk: str, sk: str, fields: dict) -> dict: ...
    def delete(self, pk: str, sk: str) -> None: ...
    def query(self, pk: str, sk_prefix: str) -> list[dict]: ...
    def query_gsi1(self, gsi1pk: str) -> list[dict]: ...


def _to_dynamo(value: Any) -> Any:
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_dynamo(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_dynamo(v) for v in value]
    return value


def _from_dynamo(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {k: _from_dynamo(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_dynamo(v) for v in value]
    return value


class DynamoItemStore:
    def __init__(self, table_name: str, region: str, resource=None):
        import boto3

        self.table = (resource or boto3.resource("dynamodb", region_name=region)).Table(table_name)

    def put(self, item: dict) -> None:
        self.table.put_item(Item=_to_dynamo(item))

    def get(self, pk: str, sk: str) -> dict | None:
        item = self.table.get_item(Key={"PK": pk, "SK": sk}).get("Item")
        return _from_dynamo(item) if item else None

    def update(self, pk: str, sk: str, fields: dict) -> dict:
        names = {f"#f{i}": k for i, k in enumerate(fields)}
        values = {f":v{i}": _to_dynamo(v) for i, v in enumerate(fields.values())}
        expr = "SET " + ", ".join(f"#f{i} = :v{i}" for i in range(len(fields)))
        res = self.table.update_item(
            Key={"PK": pk, "SK": sk},
            UpdateExpression=expr,
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW",
        )
        return _from_dynamo(res["Attributes"])

    def delete(self, pk: str, sk: str) -> None:
        self.table.delete_item(Key={"PK": pk, "SK": sk})

    def _query_all(self, **kwargs) -> list[dict]:
        items, start = [], None
        while True:
            if start:
                kwargs["ExclusiveStartKey"] = start
            res = self.table.query(**kwargs)
            items.extend(res["Items"])
            start = res.get("LastEvaluatedKey")
            if not start:
                return [_from_dynamo(i) for i in items]

    def query(self, pk: str, sk_prefix: str) -> list[dict]:
        from boto3.dynamodb.conditions import Key

        if not sk_prefix:
            # SK の条件に空文字は使えないので、パーティションの全件を取る
            return self._query_all(KeyConditionExpression=Key("PK").eq(pk))
        return self._query_all(KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with(sk_prefix))

    def query_gsi1(self, gsi1pk: str) -> list[dict]:
        from boto3.dynamodb.conditions import Key

        return self._query_all(IndexName="GSI1", KeyConditionExpression=Key("GSI1PK").eq(gsi1pk))


class JsonItemStore:
    """ローカル開発用。--reload で再起動してもデータが残るよう JSON ファイルに保存する。"""

    def __init__(self, path: str | Path | None):
        self.path = Path(path) if path else None
        self._lock = threading.Lock()
        self._items: dict[str, dict] = {}
        if self.path and self.path.exists():
            self._items = json.loads(self.path.read_text(encoding="utf-8"))

    def _save(self) -> None:
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self._items, ensure_ascii=False), encoding="utf-8")

    @staticmethod
    def _k(pk: str, sk: str) -> str:
        return f"{pk}|{sk}"

    def put(self, item: dict) -> None:
        with self._lock:
            self._items[self._k(item["PK"], item["SK"])] = json.loads(json.dumps(item))
            self._save()

    def get(self, pk: str, sk: str) -> dict | None:
        item = self._items.get(self._k(pk, sk))
        return json.loads(json.dumps(item)) if item else None

    def update(self, pk: str, sk: str, fields: dict) -> dict:
        with self._lock:
            item = self._items.setdefault(self._k(pk, sk), {"PK": pk, "SK": sk})
            item.update(json.loads(json.dumps(fields)))
            self._save()
            return json.loads(json.dumps(item))

    def delete(self, pk: str, sk: str) -> None:
        with self._lock:
            self._items.pop(self._k(pk, sk), None)
            self._save()

    def query(self, pk: str, sk_prefix: str) -> list[dict]:
        items = [i for i in self._items.values() if i["PK"] == pk and i["SK"].startswith(sk_prefix)]
        return sorted(items, key=lambda i: i["SK"])

    def query_gsi1(self, gsi1pk: str) -> list[dict]:
        return [i for i in self._items.values() if i.get("GSI1PK") == gsi1pk]


def _strip(item: dict | None) -> dict | None:
    if item is None:
        return None
    return {k: v for k, v in item.items() if k not in ("PK", "SK", "GSI1PK", "GSI1SK", "entity")}


class Repository:
    def __init__(self, store: ItemStore):
        self.store = store

    # Capsule
    def create_capsule(self, capsule: dict) -> None:
        self.store.put({"PK": f"CAPSULE#{capsule['capsule_id']}", "SK": "META", "entity": "Capsule", **capsule})

    def get_capsule(self, capsule_id: str) -> dict | None:
        return _strip(self.store.get(f"CAPSULE#{capsule_id}", "META"))

    def update_capsule(self, capsule_id: str, fields: dict) -> dict:
        return _strip(self.store.update(f"CAPSULE#{capsule_id}", "META", fields))  # type: ignore[return-value]

    # Member
    def add_member(self, capsule_id: str, user_id: str, role: str, email: str | None = None) -> None:
        self.store.put(
            {
                "PK": f"CAPSULE#{capsule_id}",
                "SK": f"MEMBER#{user_id}",
                "entity": "Member",
                "GSI1PK": f"USER#{user_id}",
                "GSI1SK": f"CAPSULE#{capsule_id}",
                "capsule_id": capsule_id,
                "user_id": user_id,
                "role": role,
                "email": email,
            }
        )

    def get_member(self, capsule_id: str, user_id: str) -> dict | None:
        return _strip(self.store.get(f"CAPSULE#{capsule_id}", f"MEMBER#{user_id}"))

    def list_members(self, capsule_id: str) -> list[dict]:
        return [_strip(i) for i in self.store.query(f"CAPSULE#{capsule_id}", "MEMBER#")]  # type: ignore[misc]

    def list_memberships(self, user_id: str) -> list[dict]:
        return [_strip(i) for i in self.store.query_gsi1(f"USER#{user_id}")]  # type: ignore[misc]

    # Content
    def add_content(self, content: dict) -> None:
        self.store.put(
            {
                "PK": f"CAPSULE#{content['capsule_id']}",
                "SK": f"CONTENT#{content['created_at']}#{content['content_id']}",
                "entity": "Content",
                **content,
            }
        )

    def list_contents(self, capsule_id: str) -> list[dict]:
        return [_strip(i) for i in self.store.query(f"CAPSULE#{capsule_id}", "CONTENT#")]  # type: ignore[misc]

    def get_content(self, capsule_id: str, content_id: str) -> dict | None:
        return next((c for c in self.list_contents(capsule_id) if c["content_id"] == content_id), None)

    def delete_content(self, content: dict) -> None:
        self.store.delete(
            f"CAPSULE#{content['capsule_id']}", f"CONTENT#{content['created_at']}#{content['content_id']}"
        )

    # Invite（招待リンク）。トークンだけで引けるよう、カプセルとは別のパーティションに置く
    def create_invite(self, invite: dict) -> None:
        self.store.put({"PK": f"INVITE#{invite['token']}", "SK": "META", "entity": "Invite", **invite})
        self.store.put(
            {
                "PK": f"CAPSULE#{invite['capsule_id']}",
                "SK": f"INVITE#{invite['token']}",
                "entity": "InviteRef",
                "token": invite["token"],
            }
        )

    def get_invite(self, token: str) -> dict | None:
        return _strip(self.store.get(f"INVITE#{token}", "META"))

    # UnlockSession（ポーズで解除してからライブラリを使える間の合言葉）
    def create_unlock_session(self, session: dict) -> None:
        self.store.put({"PK": f"SESSION#{session['token']}", "SK": "META", "entity": "UnlockSession", **session})
        ref = {
            "PK": f"CAPSULE#{session['capsule_id']}",
            "SK": f"SESSION#{session['token']}",
            "entity": "SessionRef",
            "token": session["token"],
        }
        if session.get("ttl"):
            ref["ttl"] = session["ttl"]
        self.store.put(ref)

    def get_unlock_session(self, token: str) -> dict | None:
        return _strip(self.store.get(f"SESSION#{token}", "META"))

    # フォルダの削除
    def delete_capsule(self, capsule_id: str) -> list[dict]:
        """フォルダに関するアイテムをすべて消す（メンバー・写真・招待・解除セッション）。

        消したアイテムを返すので、呼び出し側でそこに書かれた画像（S3）も消す。
        """
        pk = f"CAPSULE#{capsule_id}"
        items = self.store.query(pk, "")
        for item in items:
            # 別のパーティションにある本体（招待・解除セッション）も消す
            if item.get("entity") == "InviteRef":
                self.store.delete(f"INVITE#{item['token']}", "META")
            elif item.get("entity") == "SessionRef":
                self.store.delete(f"SESSION#{item['token']}", "META")
            self.store.delete(item["PK"], item["SK"])
        return items
