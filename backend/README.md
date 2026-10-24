# backend（エモ認証）

FastAPI（Lambda）側。いまはマイルストーン1「判定ロジック単体」まで。

## セットアップ（Windows / Git Bash）

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt
mkdir -p models
curl -sSfL -o models/pose_landmarker_full.task https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task
```

## 2枚の写真を照合する

```bash
.venv/Scripts/python -m app.pose.cli 当時.jpg 今.jpg --overlay-dir out/
```

- 一致なら終了コード0、不一致なら1、鍵の写真が使えなければ2
- `--overlay-dir` に骨格を重ねたプレビューを出力
- 許容値は `--tolerance 15` のように変えて調整できる

## テスト

```bash
.venv/Scripts/python -m pytest
```

実写真での結合テストは `tests/images/person.jpg` を置くと走る（git には入れない）。

## 構成

| ファイル | 役割 |
| --- | --- |
| `app/pose/angles.py` | 33点の座標 → 6関節（左右の肘・肩・膝）の角度。腰の中心xで左から並べる |
| `app/pose/matcher.py` | 鍵と撮影ポーズの照合。失敗理由と「あと少し！右の人の右ひじを…」の声かけを返す |
| `app/pose/detector.py` | MediaPipe Pose Landmarker で画像から最大4人を抽出。骨格プレビューの描画 |
| `app/pose/config.py` | 判定の設定値（環境変数で上書き可） |
| `app/pose/cli.py` | 手元で2枚を比べるツール |

## 設定（環境変数）

| 変数 | 既定 | 意味 |
| --- | --- | --- |
| `EMO_TOLERANCE_DEG` | 20 | 各人の平均角度差の許容値（度） |
| `EMO_MAX_JOINT_DIFF_DEG` | 45 | 1関節だけ大きくずれたときの上限（度） |
| `EMO_ALLOW_MIRROR` | false | 左右反転した撮影画像も一致とみなすか |
| `EMO_MIN_VISIBILITY` | 0.5 | これ未満の関節は「写っていない」として比較から外す |
| `EMO_MIN_JOINTS_PER_PERSON` | 4 | 1人あたり最低限比較できる関節数 |
| `EMO_DETECTION_CONFIDENCE` | 0.2 | 人物検出のしきい値。既定の0.5だと2人目以降を見落としやすい |
| `EMO_POSE_MODEL_PATH` | `models/pose_landmarker_full.task` | モデルの場所 |

## 照合結果（API でフロントに返す想定の形）

```json
{
  "ok": false,
  "reason": "pose_mismatch",
  "score": 37,
  "message": "あと少し！左の人の左ひざをもう少し曲げて",
  "expected_people": 2,
  "detected_people": 2,
  "mirrored": false,
  "people": [
    {"position": 0, "ok": false, "mean_diff_deg": 42.7, "max_diff_deg": 80.1,
     "joints": {"left_knee": {"key_deg": 95.0, "attempt_deg": 175.1, "diff_deg": 80.1, "ok": false}}}
  ]
}
```

- `reason`: `count_mismatch`（人数違い）／`pose_mismatch`（ポーズ違い）／`body_not_visible`（体が写りきっていない）／`no_person`
- `score`: 一致度ゲージ用の0〜100。平均ずれ0度で100、許容値ちょうどで70
- `joints` の `ok` で、関節ごとに色を変えて表示できる
- 関節の左右は「写っている本人から見た左右」
