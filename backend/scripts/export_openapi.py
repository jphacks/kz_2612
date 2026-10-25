"""FastAPI から OpenAPI（API の契約）を docs/openapi.json に書き出す。

モデルも AWS も読み込まない（app.main を import しても、モデルは最初に判定するまで読まれない）。
OS が違っても同じ中身になるよう、キーを並べ替え、改行は LF、末尾に改行を1つ付ける。

    python scripts/export_openapi.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
OUTPUT = BACKEND.parent / "docs" / "openapi.json"

# AWS のクライアントを作らないよう、保存先はローカルに固定する
os.environ["EMO_BACKEND"] = "local"
sys.path.insert(0, str(BACKEND))

from app.main import app  # noqa: E402


def main() -> None:
    text = json.dumps(app.openapi(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    # newline="\n" で Windows でも CRLF にならないようにする
    with OUTPUT.open("w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
