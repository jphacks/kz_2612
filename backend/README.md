# backend（エモ認証）

FastAPI（Lambda）側。API 仕様は `docs/api.md`。

## セットアップ（Windows / Git Bash）

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt
.venv/Scripts/python -m pip install --no-deps -r requirements-nodeps.txt
.venv/Scripts/python scripts/download_models.py   # models/ に約160MB
```

## 姿勢推定エンジン

既定は **RTMPose**（rtmlib＋onnxruntime。YOLOX-m で人を見つけてから RTMPose-m で一人ずつ骨格を読む）。
`EMO_POSE_ENGINE=mediapipe` で MediaPipe Pose Landmarker に戻せる。

RTMPose にした理由（2026-10-24、2人で胸から上を撮った実写真で比較）:

| | MediaPipe | RTMPose |
| --- | --- | --- |
| 顔の横に手を上げたポーズ | 腕を下ろしたように読み違える | 正しく読める |
| 2人が近くに並ぶ | 片方の骨格が隣の人の腕をつかむ／1人しか見つからない | 2人とも見つかる |
| 正しいポーズの撮り直し | 人数違いで失敗 | 一致（スコア81） |
| 速さ（CPU、1枚） | 約0.05秒 | 約1秒 |

MediaPipe は腰の位置を手がかりに体の向きを決めるので、腰が写っていない近い写真に弱い。
RTMPose は画面外の関節も推測して返すので、確からしさ0.5未満の点と画像の外の点は「写っていない」として扱う（`EMO_RTM_MIN_SCORE`）。

## 2枚の写真を照合する

```bash
.venv/Scripts/python -m app.pose.cli 当時.jpg 今.jpg --overlay-dir out/
```

- 一致なら終了コード0、不一致なら1、鍵の写真が使えなければ2
- `--overlay-dir` に骨格を重ねたプレビューを出力
- 許容値は `--tolerance 15` のように変えて調整できる

## 1人でテストプレイする

```bash
.venv/Scripts/python -m app.dev
```

ブラウザで http://localhost:8000/dev を開く（`app.dev` は開封日の制限も外して起動する）（ローカル専用の簡易ページ。カメラで鍵を撮る → メッセージを入れる → ポーズで開ける、が試せる）。
鍵の写真は両ひじと両手首まで写るように撮る。

## テスト

```bash
.venv/Scripts/python -m pytest
```

実写真での結合テストは `tests/images/person.jpg` を置くと走る（git には入れない）。

## 構成

| ファイル | 役割 |
| --- | --- |
| `app/pose/angles.py` | 33点の座標 → 点の位置（両肩の中心が原点、肩幅が1）と6関節の角度。腰（見えなければ肩）の中心xで左から並べる |
| `app/pose/matcher.py` | 鍵と撮影ポーズの照合。失敗理由と「あと少し！右の人の右ひじを…」の声かけを返す |
| `app/pose/rtm_detector.py` | RTMPose で画像から人ごとの骨格を抽出（既定） |
| `app/pose/detector.py` | MediaPipe Pose Landmarker 版（`EMO_POSE_ENGINE=mediapipe`） |
| `app/pose/base.py` | 両エンジン共通（鍵として使えるかの確認、骨格プレビューの描画） |
| `app/pose/face.py` | 顔の判定（顔の検出・特徴・人への結びつけ・照合・顔の記憶の更新） |
| `app/pose/config.py` | 判定の設定値（環境変数で上書き可） |
| `app/pose/cli.py` | 手元で2枚を比べるツール |

## 設定（環境変数）

| 変数 | 既定 | 意味 |
| --- | --- | --- |
| `EMO_POINT_TOLERANCE` | 0.35 | 各人の点の位置のずれ（肩幅を1）の平均の許容値 |
| `EMO_MAX_POINT_DIFF` | 1.0 | 1点だけ大きくずれたときの上限（肩幅の何倍か） |
| `EMO_MAX_MISSING_POINTS` | 2 | 開けるとき、当時写っていた点が1人何点まで隠れてよいか |
| `EMO_MIN_POINTS_PER_PERSON` | 2 | 鍵にするのに必要な、1人あたりの点（ひじ・手首・ひざ・足首）の数（両肩は必須） |
| `EMO_JUDGE_WITH_ANGLES` | false | 関節の角度も合否に使うか（既定は表示用だけ） |
| `EMO_FACE_CHECK` | true | 顔の判定をするか（YuNet＋SFace） |
| `EMO_FACE_THRESHOLD` | 0.40 | 顔の記憶のうちいちばん似ている顔との類似度のしきい値 |
| `EMO_FACE_MARGIN` | 0.05 | ほかの立ち位置の人の記憶より、どれだけ似ている必要があるか |
| `EMO_MAX_HIDDEN_FACES` | 0 | 顔が見えなくてもよい人数 |
| `EMO_FACE_MEMORY` | 5 | 開けたときの顔を1人何件まで覚えるか（鍵の写真の顔は別にずっと残す） |
| `EMO_TOLERANCE_DEG` | 20 | 角度を使うときの、各人の平均角度差の許容値（度） |
| `EMO_MAX_JOINT_DIFF_DEG` | 45 | 1関節だけ大きくずれたときの上限（度） |
| `EMO_ALLOW_MIRROR` | false | 左右反転した撮影画像も一致とみなすか |
| `EMO_MIN_VISIBILITY` | 0.5 | これ未満の関節は「写っていない」として比較から外す |
| `EMO_MIN_JOINTS_PER_PERSON` | 2 | 角度を使うとき、最低限比べられる関節数 |
| `EMO_POSE_ENGINE` | rtmpose | 姿勢推定エンジン（`rtmpose` / `mediapipe`） |
| `EMO_RTM_MIN_SCORE` | 0.5 | RTMPose でこれ未満の点は「写っていない」とする |
| `EMO_RTM_DET_PATH` / `EMO_RTM_POSE_PATH` | `models/rtm_*.onnx` | RTMPose のモデルの場所 |
| `EMO_DETECTION_CONFIDENCE` | 0.2 | MediaPipe の人物検出のしきい値 |
| `EMO_POSE_MODEL_PATH` | `models/pose_landmarker_full.task` | MediaPipe のモデルの場所 |

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
    {"position": 0, "ok": false, "mean_point_diff": 0.41, "missing_joints": [],
     "points": {"left_knee": {"key": [0.3, 2.5], "attempt": [0.6, 2.0], "diff": 0.58, "ok": false}},
     "mean_diff_deg": 42.7, "max_diff_deg": 80.1,
     "joints": {"left_knee": {"key_deg": 95.0, "attempt_deg": 175.1, "diff_deg": 80.1, "ok": false}}}
  ]
}
```

- `reason`: `count_mismatch`（人数違い）／`pose_mismatch`（ポーズ違い）／`body_not_visible`（体が写りきっていない）／`no_person`
- `score`: 一致度ゲージ用の0〜100。平均ずれ0度で100、許容値ちょうどで70
- `joints` の `ok` で、関節ごとに色を変えて表示できる
- 関節の左右は「写っている本人から見た左右」
