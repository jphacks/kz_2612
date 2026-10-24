# エモ認証 API 仕様（v0.1）

フロントエンド担当・AWS担当向け。実装は `backend/`。
サーバーを起動すると `http://localhost:8000/docs` で同じ内容を試せる（OpenAPI / Swagger UI）。

- [フロントエンド向け](#フロントエンド向け)
- [AWS 向け](#aws-向け)
- [未実装・今後](#未実装今後)

---

## フロントエンド向け

### 基本

| 項目 | 内容 |
| --- | --- |
| ベースURL | ローカル `http://localhost:8000` ／ 本番は API Gateway の URL |
| 形式 | JSON（`Content-Type: application/json`） |
| 日付 | 開封日は `YYYY-MM-DD`（日本時間）。日時は ISO 8601（UTC） |
| 認証 | Cognito 導入までは `X-User-Id` ヘッダーでユーザーを指定（無ければ `demo-user`）。メンバー招待が未実装なので、デモは同じ ID で操作する |

### 画像のアップロード（全画像共通の2ステップ）

画像は API を通さず、発行された URL にブラウザから直接 PUT する（API Gateway の 10MB 上限を避けるため）。

```js
// 1. URL をもらう
const up = await fetch(`${API}/uploads`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ purpose: "attempt", content_type: "image/jpeg" }),
}).then(r => r.json());

// 2. そのまま PUT（headers は必ず up.headers を使う。署名に Content-Type が含まれている）
await fetch(up.upload_url, { method: "PUT", headers: up.headers, body: blob });

// 3. 以降の API には up.s3_key を渡す
```

- `purpose`: `key`（思い出の写真）／`attempt`（開封時の撮影）／`content`（中身の写真）。用途を間違えると `invalid_s3_key` になる
- アップロードURLの期限は5分、上限10MB
- **開封時の撮影画像は左右反転しないで送る**（`<video>` を鏡像表示していても、canvas に描くときは反転を戻す）

### エンドポイント一覧

| メソッド | パス | 用途 | 画面 |
| --- | --- | --- | --- |
| POST | `/uploads` | アップロード用URL発行 | 全般 |
| POST | `/capsules` | カプセル作成＋鍵のポーズ抽出 | 3. カプセル作成 |
| GET | `/capsules` | 自分のカプセル一覧 | 2. 一覧 |
| GET | `/capsules/{id}` | 詳細・開封カメラのガイド | 3, 5 |
| POST | `/capsules/{id}/contents` | 中身（メッセージ・写真）を追加 | 4. 中身の登録 |
| POST | `/capsules/{id}/open` | エモ認証で開封 | 5 → 6. 開封演出 |
| GET | `/capsules/{id}/contents` | 開封済みの中身を見直す | 6 |
| GET | `/capsules/{id}/album` | 認証アルバム | 7 |
| GET | `/health` | 死活確認 | — |
| POST | `/warmup` | モデルを温める（発表直前に叩く） | — |

---

#### POST /uploads

```json
// request
{ "purpose": "key", "content_type": "image/jpeg" }
// 200
{
  "upload_url": "https://...",
  "method": "PUT",
  "headers": { "Content-Type": "image/jpeg" },
  "s3_key": "uploads/demo-user/key/3f2a....jpg",
  "expires_in": 300
}
```

#### POST /capsules — カプセル作成（F-2）

```json
// request
{ "name": "成人式", "open_date": "2036-01-12", "key_photo_s3_key": "uploads/demo-user/key/3f2a....jpg" }
```

201 で下の「カプセル詳細」を返す。`preview_url` が骨格を重ねたプレビュー画像。

| エラー | code | 画面での案内 |
| --- | --- | --- |
| 422 | `no_person` | 人が写っていない → 別の写真を選ぶ |
| 422 | `too_many_people` | 5人以上 → 4人までの写真を選ぶ（`detected_people` 付き） |
| 422 | `pose_not_visible` | 腕が写っていないなどで、比べられる関節が1人4つ未満 → ひじと手首まで写る写真にする |
| 404 | `upload_not_found` | PUT が終わる前に呼んだ |

#### GET /capsules — 一覧

```json
[
  {
    "capsule_id": "a1b2c3d4e5f6",
    "name": "成人式",
    "open_date": "2036-01-12",
    "days_until_open": 3367,
    "status": "locked",          // locked | opened
    "people_count": 4,
    "role": "owner"              // owner | member
  }
]
```

#### GET /capsules/{id} — 詳細（中身は含まない）

```json
{
  "capsule_id": "a1b2c3d4e5f6",
  "name": "成人式",
  "open_date": "2036-01-12",
  "days_until_open": 3367,
  "status": "locked",
  "people_count": 2,
  "role": "owner",
  "key_photo_url": "https://...",   // 当時の写真（60秒で失効）
  "preview_url": "https://...",     // 骨格を重ねたプレビュー
  "url_expires_in": 60,
  "guide": [                        // 開封カメラのガイド表示用。左から順
    {
      "position": 0,
      "angles": { "left_elbow": 92.1, "right_elbow": 168.0, "left_shoulder": 40.2,
                  "right_shoulder": 118.5, "left_knee": 175.3, "right_knee": null },
      "points": { "left_shoulder": [0.21, 0.33], "left_elbow": [0.18, 0.45], "...": "...",
                  "right_ankle": null }
    }
  ],
  "can_open_now": false,            // 開封日を過ぎていて、ロック中でない
  "locked_until": null,
  "attempts_left": 5,
  "contents_count": 3,
  "opened_at": null
}
```

- `points` は体の12点（左右の肩・肘・手首・腰・膝・足首）の正規化座標 `[x, y]`（0〜1、画像の左上が原点）。写っていない点は `null`
- `angles` は MediaPipe JS で今の骨格から同じ角度を計算すれば、関節ごとのずれを色で出せる（判定はサーバー側だけで行う）
- 左右は「写っている本人から見た左右」（MediaPipe と同じ）
- 署名付きURLは60秒で切れるので、表示し直すときは詳細を取り直す

#### POST /capsules/{id}/contents — 中身の追加（F-3）

```json
{ "type": "message", "text": "10年後のみんなへ" }
{ "type": "photo", "s3_key": "uploads/demo-user/content/....jpg" }
```

201 で `{ content_id, type, author_id, created_at }`。開封後は 409 `already_opened`。

#### POST /capsules/{id}/open — エモ認証で開封（F-4）

```json
// request（purpose=attempt でアップロードした画像）
{ "s3_key": "uploads/demo-user/attempt/....jpg" }
```

照合した結果は、一致してもしなくても **200** で返す。

```json
{
  "ok": false,
  "result": {
    "ok": false,
    "reason": "pose_mismatch",      // count_mismatch | pose_mismatch | body_not_visible | no_person | null
    "score": 62,                    // 一致度ゲージ 0〜100。許容値ちょうどで70
    "message": "あと少し！右の人の右ひじをもう少し伸ばして",   // そのまま表示してよい
    "expected_people": 2,
    "detected_people": 2,
    "mirrored": false,
    "people": [
      {
        "position": 1, "ok": false, "mean_diff_deg": 24.3, "max_diff_deg": 41.0,
        "joints": {
          "right_elbow": { "key_deg": 170.0, "attempt_deg": 129.0, "diff_deg": 41.0, "ok": false }
        }
      }
    ]
  },
  "attempts_left": 4,
  "locked_until": null,
  "opened": null
}
```

一致したとき（`ok: true`）は `opened` に中身が入る。**中身の URL は60秒で失効する**ので、受け取ったらすぐ表示する。

```json
"opened": {
  "key_photo_url": "https://...",       // 当時
  "attempt_photo_url": "https://...",   // 今（並べて表示する）
  "contents": [
    { "content_id": "...", "type": "message", "text": "10年後のみんなへ", "url": null, "author_id": "...", "created_at": "..." },
    { "content_id": "...", "type": "photo", "text": null, "url": "https://...", "author_id": "...", "created_at": "..." }
  ],
  "url_expires_in": 60
}
```

- 当時の写真で写っていた関節だけを比べる。上半身だけの写真が鍵なら上半身だけで開けられ、全身の写真が鍵なら今も全身（ひざまで）写っている必要がある。足りないときは `reason: "body_not_visible"` と、各人の `missing_joints`（写っていない関節）を返す
- 肩の角度は「肩のラインに垂直な下向き」と上腕のなす角（腕を下ろして0度、水平で90度、真上で180度）。腰が写っていなくても測れる
- 5回失敗すると10分ロック。失敗に数えるのは `count_mismatch` と `pose_mismatch` だけ（誰も写っていない・体が切れているのは数えない）
- 開封済みのカプセルも再び開けられる。開けるたびに認証アルバムに写真が増える（F-7）

| エラー | code | 意味 |
| --- | --- | --- |
| 409 | `not_open_yet` | 開封日前（`open_date` 付き） |
| 423 | `locked` | 失敗が続いてロック中（`locked_until` 付き） |
| 400 | `invalid_s3_key` | purpose=attempt 以外、または他人のアップロード |
| 404 | `upload_not_found` | PUT が終わる前に呼んだ |

#### GET /capsules/{id}/contents ／ GET /capsules/{id}/album

開封済みのときだけ使える（未開封なら 409 `not_opened`）。中身の見直しと、開封に成功したときの写真の一覧。

```json
// album
{ "key_photo_url": "https://...", "entries": [ { "opened_at": "...", "photo_url": "https://...", "score": 91 } ], "url_expires_in": 60 }
```

### エラーの形（全API共通）

```json
{ "error": { "code": "not_member", "message": "このカプセルのメンバーではないみたい" } }
```

`message` は画面にそのまま出せる文言。表示を作り込むときは `code` で分ける。

| status | code |
| --- | --- |
| 400 | `invalid_s3_key` `invalid_image` `text_required` `s3_key_required` |
| 403 | `not_member` |
| 404 | `capsule_not_found` `upload_not_found` |
| 409 | `not_open_yet` `already_opened` `not_opened` |
| 413 | `image_too_large` |
| 422 | `no_person` `too_many_people` `pose_not_visible` `validation_error`（`details` 付き） |
| 423 | `locked` |

### ローカルで動かす

```bash
cd backend
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

ローカルでは S3 の代わりに `http://localhost:8000/local-s3/...` の URL が返る（使い方は S3 と同じ）。データは `backend/.local_data/` に保存される。

---

## AWS 向け

### 構成

```
React (Amplify) ──API──▶ API Gateway (HTTP API) ──▶ Lambda (コンテナ, FastAPI+Mangum) ──▶ DynamoDB
      │                                                     │
      └──── 署名付きURLで直接 PUT / GET ────▶ S3 (非公開) ◀──┘
```

### Lambda

| 項目 | 値 |
| --- | --- |
| パッケージ | コンテナイメージ（`backend/Dockerfile`）→ ECR |
| ハンドラ | Dockerfile の `CMD ["app.main.handler"]`（設定不要） |
| アーキテクチャ | x86_64（Docker Desktop でビルドしたもの） |
| メモリ | 3008 MB（MediaPipe の読み込みが速くなる） |
| タイムアウト | 30 秒 |
| 環境変数 | 下表 |

```bash
cd backend
docker build --platform linux/amd64 --provenance=false -t emo-api .
# 手元確認（Lambda RIE 内蔵）
docker run --rm -p 9000:8080 -e EMO_BUCKET=... -e EMO_TABLE=... -e AWS_REGION=ap-northeast-1 \
  -e AWS_ACCESS_KEY_ID=... -e AWS_SECRET_ACCESS_KEY=... emo-api
```

| 環境変数 | 必須 | 例・既定 | 内容 |
| --- | --- | --- | --- |
| `EMO_BACKEND` | | `aws`（Dockerfile で設定済み） | |
| `EMO_BUCKET` | ✓ | `emo-timecapsule-xxxx` | S3 バケット名 |
| `EMO_TABLE` | ✓ | `emo-timecapsule` | DynamoDB テーブル名 |
| `EMO_CORS_ORIGINS` | ✓ | `https://main.xxxx.amplifyapp.com,http://localhost:5173` | API の CORS 許可オリジン（カンマ区切り） |
| `EMO_IGNORE_OPEN_DATE` | | `false` | デモ時は `true` で開封日前でも開けられる |
| `EMO_TOLERANCE_DEG` | | `20` | 判定の許容値（度） |
| `EMO_MAX_FAILURES` / `EMO_LOCK_MINUTES` | | `5` / `10` | 失敗回数とロック時間 |
| `EMO_DETECTION_CONFIDENCE` | | `0.2` | 人物検出のしきい値 |

その他の判定パラメータは `backend/README.md` を参照。

### API Gateway

- HTTP API、ルート `ANY /{proxy+}` と `ANY /` を Lambda に統合（ペイロード v2.0）
- CORS は FastAPI 側で処理しているので、API Gateway の CORS 設定は**しない**（二重になるとエラー）
- Cognito を入れるときは JWT オーソライザーを付け、`backend/app/deps.py` の `current_user` を claims 読み取りに差し替える（バックエンドで対応）

### DynamoDB（1テーブル）

| 項目 | 値 |
| --- | --- |
| テーブル名 | `EMO_TABLE` |
| パーティションキー | `PK`（文字列） |
| ソートキー | `SK`（文字列） |
| GSI | `GSI1`：PK=`GSI1PK`（文字列）、SK=`GSI1SK`（文字列）、射影 ALL |
| 課金 | オンデマンド |

| エンティティ | PK | SK | GSI1PK | GSI1SK |
| --- | --- | --- | --- | --- |
| Capsule | `CAPSULE#{id}` | `META` | | |
| Member | `CAPSULE#{id}` | `MEMBER#{userId}` | `USER#{userId}` | `CAPSULE#{id}` |
| Content | `CAPSULE#{id}` | `CONTENT#{createdAt}#{cid}` | | |
| OpenRecord | `CAPSULE#{id}` | `OPEN#{openedAt}` | | |

```bash
aws dynamodb create-table --table-name emo-timecapsule \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S AttributeName=GSI1SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes 'IndexName=GSI1,KeySchema=[{AttributeName=GSI1PK,KeyType=HASH},{AttributeName=GSI1SK,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
  --billing-mode PAY_PER_REQUEST
```

### S3

- パブリックアクセスは**すべてブロック**。閲覧は署名付きURLのみ
- キーの使い方: `uploads/{userId}/{key|attempt|content}/...`（ブラウザから PUT）、`previews/{capsuleId}.jpg`（Lambda が書き込む）
- ブラウザから直接 PUT / GET するので CORS 設定が必要:

```json
[
  {
    "AllowedOrigins": ["https://main.xxxx.amplifyapp.com", "http://localhost:5173"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3000
  }
]
```

- 任意: `uploads/*/attempt/` に数日〜数十日のライフサイクル削除を入れてもよい。ただし成功時の写真はアルバムで使うので、消すならアルバム用にコピーする対応がバックエンド側で必要（相談）

### Lambda 実行ロール（最小権限）

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::BUCKET_NAME/*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"],
      "Resource": [
        "arn:aws:dynamodb:ap-northeast-1:ACCOUNT_ID:table/TABLE_NAME",
        "arn:aws:dynamodb:ap-northeast-1:ACCOUNT_ID:table/TABLE_NAME/index/GSI1"
      ]
    }
  ]
}
```

- `head_object` は `s3:GetObject` 権限で動く。ただしオブジェクトが無いときに 404 ではなく 403 を返さないよう、`s3:ListBucket`（Resource: `arn:aws:s3:::BUCKET_NAME`）も付けておくこと
- 署名付きURLはこのロールの権限で発行されるので、ロールに `s3:PutObject` / `s3:GetObject` が無いとブラウザからのアップロードも失敗する
- CloudWatch Logs 用に `AWSLambdaBasicExecutionRole` も付ける

### ログ（CloudWatch Logs）

判定ごとに1行の JSON を出す（画像そのものは出さない）。

```json
{"event": "open_attempt", "capsule_id": "a1b2...", "detected_people": 2, "diffs": [8.1, 24.3], "ok": false, "reason": "pose_mismatch", "fail_count": 1, "locked": false, "ms": 840}
```

### 発表前

`POST /warmup` を数回叩いてコールドスタートを済ませておく。

---

## 未実装・今後

| 機能 | 状態 |
| --- | --- |
| メンバー招待（招待リンク） | 未実装。次に `POST /capsules/{id}/invites` と `POST /invites/{token}/accept` を追加予定 |
| Cognito（Googleログイン） | 未実装。いまは `X-User-Id` ヘッダーで代替 |
| 開封日の通知（EventBridge Scheduler＋SES） | 未実装（PRD でも優先度低） |
