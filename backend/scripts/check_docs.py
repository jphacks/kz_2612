"""設定値の既定値と backend/README.md の「設定（環境変数）」の表がずれていないか調べる。

モデルは読み込まない（dataclass の既定値と、コード中の os.environ.get の既定値を AST で読むだけ）。
ずれた項目を表示し、1つでもあれば終了コード 1 で終わる。

    python scripts/check_docs.py
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.pose.config import MatchConfig  # noqa: E402
from app.pose.face import FaceConfig  # noqa: E402
from app.settings import Settings  # noqa: E402

README = BACKEND / "README.md"
APP = BACKEND / "app"

# from_env() が `d.xxx` / `default.xxx` で参照する dataclass の既定値（ファイル名 → インスタンス）
DEFAULT_OBJECTS = {
    "settings.py": Settings(),
    "config.py": MatchConfig(),
    "face.py": FaceConfig(),
}

# 既定が「ファイルの場所」で、環境によって値が変わるもの。表に載っているかだけ確かめる
PATH_VARS = {
    "EMO_RTM_DET_PATH",
    "EMO_RTM_POSE_PATH",
    "EMO_POSE_MODEL_PATH",
    "EMO_FACE_DET_PATH",
    "EMO_FACE_REC_PATH",
    "EMO_LOCAL_DATA_DIR",
}

ENV_NAME = re.compile(r"^(EMO|AWS)_[A-Z0-9_]+$")
UNREADABLE = object()


def resolve(node: ast.expr | None, obj: object) -> object:
    """既定値を表す式を値にする。読めなければ UNREADABLE。"""
    if node is None:
        return UNREADABLE
    if isinstance(node, ast.Constant):
        return node.value
    # d.xxx / default.xxx
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id in ("d", "default"):
        return getattr(obj, node.attr, UNREADABLE) if obj is not None else UNREADABLE
    # str(...)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "str" and len(node.args) == 1:
        return resolve(node.args[0], obj)
    return UNREADABLE


def collect_code_defaults() -> tuple[dict[str, object], list[str]]:
    """app/ の中で環境変数を読んでいる箇所から {変数名: 既定値} を集める。"""
    defaults: dict[str, object] = {}
    problems: list[str] = []
    for path in sorted(APP.rglob("*.py")):
        obj = DEFAULT_OBJECTS.get(path.name)
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not (isinstance(node, ast.Call) and node.args):
                continue
            first = node.args[0]
            if not (isinstance(first, ast.Constant) and isinstance(first.value, str) and ENV_NAME.match(first.value)):
                continue
            name = first.value
            value = resolve(node.args[1], obj) if len(node.args) > 1 else UNREADABLE
            if name in defaults and defaults[name] is not UNREADABLE and value is not UNREADABLE:
                if defaults[name] != value:
                    problems.append(f"{name}: コード中で既定値が食い違っている（{defaults[name]!r} と {value!r}）")
            # 読めた値を優先する
            if name not in defaults or defaults[name] is UNREADABLE:
                defaults[name] = value
    return defaults, problems


def parse_table() -> dict[str, str]:
    """「設定（環境変数）」の表から {変数名: 既定のセルの文字列} を読む。"""
    text = README.read_text(encoding="utf-8")
    m = re.search(r"^## 設定（環境変数）\s*$(.*?)(?=^## |\Z)", text, re.S | re.M)
    if not m:
        sys.exit("backend/README.md に「## 設定（環境変数）」の節が見つからない")
    rows: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 2:
            continue
        for name in re.findall(r"`((?:EMO|AWS)_[A-Z0-9_]+)`", cells[0]):
            rows[name] = cells[1].strip("`").strip()
    return rows


def same(code: object, doc: str) -> bool:
    if isinstance(code, bool):
        return doc.lower() == str(code).lower()
    if isinstance(code, (int, float)):
        try:
            return float(doc) == float(code)
        except ValueError:
            return False
    return doc == str(code)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows のコンソール（cp932）でも文字化けさせない
    code, problems = collect_code_defaults()
    table = parse_table()

    for name in sorted(code.keys() | table.keys()):
        in_code, in_doc = name in code, name in table
        if in_code and not in_doc:
            problems.append(f"{name}: コードで環境変数として読んでいる（既定値 {code[name]!r}）が README の表にない")
        elif in_doc and not in_code:
            problems.append(f"{name}: README の表にあるがコードで使われていない")
        elif name in PATH_VARS:
            continue
        elif code[name] is UNREADABLE:
            problems.append(f"{name}: README の表にあるが、コードから既定値を読めない（表の値: {table[name]}）")
        elif not same(code[name], table[name]):
            problems.append(f"{name}: コードの既定値は {code[name]!r}、README の表は {table[name]}")

    if problems:
        print("ドキュメントとコードの既定値がずれている:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"OK: {len(table)} 項目の既定値が README の表と一致")
    return 0


if __name__ == "__main__":
    sys.exit(main())
