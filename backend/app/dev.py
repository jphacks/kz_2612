"""テストプレイ用にローカルで起動する（開封日の制限も外す）。

    python -m app.dev

本番と同じ制限で試したいときは `uvicorn app.main:app` で起動する。
環境変数を自分で指定した場合はそちらが優先される。
"""

import os

import uvicorn

# 失敗によるロックと解除の期限は、本番も既定で無し（settings.py）
DEV_DEFAULTS = {
    "EMO_BACKEND": "local",
    "EMO_IGNORE_OPEN_DATE": "true",  # 開封日前でも開けられる
}

if __name__ == "__main__":
    for key, value in DEV_DEFAULTS.items():
        os.environ.setdefault(key, value)
    print("テストプレイ用の設定で起動します:", {k: os.environ[k] for k in DEV_DEFAULTS})
    uvicorn.run("app.main:app", port=int(os.environ.get("PORT", "8000")))
