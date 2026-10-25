# エモ認証 API 仕様（v0.2）

フロントエンド担当・AWS担当向け。実装は `backend/`。

**カプセル（画面ではフォルダ）は「ポーズで開ける共有アルバム」。** フォルダに入るたびにみんなでポーズを揃えてロックを解除し、解除している間だけ写真を見る・追加する・削除する（Figma の画面フローに合わせた）。
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
| 日付 | 開封日は `YYYY-MM-DD`（日本時間、**任意**）。日時は ISO 8601（UTC） |
| 認証 | Cognito 導入までは `X-User-Id` ヘッダーでユーザーを指定（無ければ `demo-user`）。メールアドレスは `X-User-Email`（任意） |
| ロック解除 | ポーズが一致すると `unlock.token` が返る。ライブラリの API には `X-Unlock-Token` ヘッダーで付ける（最大12時間） |

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

- `purpose`: `key`（鍵写真）／`cover`（任意の表紙画像）／`attempt`（開封時の撮影）／`content`（中身の写真）。用途を間違えると `invalid_s3_key` になる
- アップロードURLの期限は5分、上限10MB
- **開封時の撮影画像は左右反転しないで送る**（`<video>` を鏡像表示していても、canvas に描くときは反転を戻す）

### エンドポイント一覧

| メソッド | パス | 用途 | 画面 |
| --- | --- | --- | --- |
| POST | `/uploads` | アップロード用URL発行 | 全般 |
| POST | `/capsules` | フォルダ作成＋鍵のポーズ抽出 | 作成登録画面 |
| GET | `/capsules` | 自分のフォルダ一覧 | フォルダー一覧画面 |
| GET | `/capsules/{id}` | 詳細・写真認証カメラのガイド | 写真認証画面 |
| POST | `/capsules/{id}/open` | ポーズでロック解除 | 写真を撮る → 認証中/成功/失敗 |
| GET | `/capsules/{id}/contents` | ライブラリ（写真一覧）🔓 | 写真ライブラリ画面・1枚写真画面 |
| POST | `/capsules/{id}/contents` | 写真を追加（最大20枚） | 追加 → アップロード |
| DELETE | `/capsules/{id}/contents/{content_id}` | 写真を削除 🔓 | 選択 → 削除 |
| DELETE | `/capsules/{id}` | フォルダを削除（参加者なら誰でも） | （フローには未記載） |
| POST | `/capsules/{id}/invites` | 招待リンクを発行（作成者のみ） | 作成登録画面（参加アカウント） |
| GET | `/invites/{token}` | 招待の中身を確認（参加前） | 招待ページ |
| POST | `/invites/{token}/accept` | 招待から参加 | 招待ページ |
| GET | `/capsules/{id}/members` | メンバー一覧 | 作成登録画面 |

🔓 はロック解除中だけ使える（`X-Unlock-Token` が必要）。

#### 画面フローとの対応

```
フォルダー一覧  GET /capsules
 ├ フォルダ新規作成 → 作成登録画面   POST /uploads(key・任意のcover・0〜20枚のcontent) → POST /capsules → POST /capsules/{id}/invites
 └ フォルダ押下 → 写真認証画面       GET /capsules/{id}（guide でガイド表示）
     └ 写真を撮る                    POST /uploads(attempt) → POST /capsules/{id}/open
         ├ 失敗 → result.message を表示して撮り直し
         └ 成功 → unlock.token を保存 → 写真ライブラリ画面
             ├ 一覧・1枚表示         GET /capsules/{id}/contents   （X-Unlock-Token）
             ├ 追加 → アップロード    POST /uploads(content) → POST /capsules/{id}/contents
             ├ 選択 → 削除           DELETE /capsules/{id}/contents/{content_id}（X-Unlock-Token）
             └ 期限切れ・ログアウト・アカウント切替 → トークンを破棄
```
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
{
  "name": "成人式",
  "open_date": "2036-01-12",
  "key_photo_s3_key": "uploads/demo-user/key/3f2a....jpg",
  "cover_photo_s3_key": "uploads/demo-user/cover/7a1b....jpg",
  "initial_photo_s3_keys": ["uploads/demo-user/content/8c2d....jpg"]
}
```

`open_date` は省略できる（省略するといつでも開けられる。一覧・詳細では `open_date` と `days_until_open` が `null`）。
`cover_photo_s3_key` は任意。省略時は鍵写真を流用せず通常のフォルダ表紙を表示する。`initial_photo_s3_keys` は作成時に入れる写真0〜20枚。

201 で下の「カプセル詳細」を返す。`preview_url` が骨格を重ねたプレビュー画像。

| エラー | code | 画面での案内 |
| --- | --- | --- |
| 422 | `no_person` | 人が写っていない → 別の写真を選ぶ |
| 422 | `too_many_people` | 5人以上 → 4人までの写真を選ぶ（`detected_people` 付き） |
| 422 | `pose_not_visible` | 両肩が見えない、または腕などの点（ひじ・手首・ひざ・足首）が1人2つ未満 → 両肩と腕が写る写真にする。片手を隠したポーズは OK |
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
    "role": "owner",             // owner | member
    "poses": [                   // 鍵の写真の各人の体の点（左から順）。写真は出さず、ポーズの形だけを一覧で見せる用
      { "left_shoulder": [0.31, 0.42], "left_wrist": [0.22, 0.18], "left_knee": null }
    ],
    "cover_photo_url": "https://..." // 表紙未設定なら null
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

#### POST /capsules/{id}/contents — 写真の追加

```json
{ "type": "photo", "s3_key": "uploads/demo-user/content/....jpg" }
```

201 で `{ content_id, type, author_id, created_at }`。メンバーならいつでも追加できる（解除は不要。作成時の登録にも、ライブラリからの追加にも使う）。
追加したあとライブラリを表示し直すときは `GET /capsules/{id}/contents` を呼ぶ。

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
    "reason": "pose_mismatch",      // count_mismatch | pose_mismatch | body_not_visible | no_person | face_not_visible | face_mismatch | null
    "score": 62,                    // 一致度ゲージ 0〜100。許容値ちょうどで70
    "message": "あと少し！右の人の右手をもう少し上に",   // そのまま表示してよい
    "expected_people": 2,
    "detected_people": 2,
    "mirrored": false,
    "people": [
      {
        "position": 1, "ok": false,
        "mean_point_diff": 0.41,       // 点の位置のずれの平均（肩幅を1）。0.35 以内なら一致
        "points": {                    // 点ごとのずれ。ok で色分けする
          "right_wrist": { "key": [-0.9, -0.2], "attempt": [-0.9, 0.6], "diff": 0.8, "ok": false },
          "right_elbow": { "key": [-0.8, 0.6], "attempt": [-0.85, 0.65], "diff": 0.07, "ok": true }
        },
        "missing_joints": ["left_wrist"],   // 当時は写っていたのに今は隠れている点（"shoulders" は両肩が見えない）
        "mean_diff_deg": 24.3, "max_diff_deg": 41.0,   // 関節角度のずれ（表示用。合否には使わない）
        "joints": {
          "right_elbow": { "key_deg": 170.0, "attempt_deg": 129.0, "diff_deg": 41.0, "ok": false }
        }
      }
    ],
    "faces": []                     // 顔の判定。ポーズが合ったときだけ入る（下の例）
  },
  "attempts_left": 4,
  "locked_until": null,
  "opened": null,
  "unlock": null
}
```

一致したとき（`ok: true`）は `opened` に中身が、`unlock` に解除セッションが入る。

```json
"unlock": { "token": "kZ3...（32文字くらい）", "expires_at": "2026-10-24T05:17:24Z" }
```

- `unlock.token` を保存し、ライブラリの API（🔓）に `X-Unlock-Token` ヘッダーで付ける
- 有効なのは**解除した本人・そのフォルダだけ**で、既定は最大12時間。期限が切れると 401 `unlock_expired` になるので、写真認証画面に戻す
- 画面更新やフォルダー一覧へ戻る操作ではトークンを保持する。期限切れ・ログアウト・アカウント切替時に破棄する

`opened` の写真 URL は60秒で失効する。認証に使った撮影画像は判定用に読み込んだ直後に削除し、レスポンスにも含めない。

```json
"opened": {
  "key_photo_url": "https://...",       // 当時
  "contents": [
    { "content_id": "...", "type": "photo", "url": "https://...", "author_id": "...", "created_at": "..." }
  ],
  "url_expires_in": 60
}
```

- **点の位置で比べる**: ひじ・手首・ひざ・足首が、両肩の中心から見てどこにあるか（肩幅を1とした座標、y は下向きが正）。カメラとの距離が違っても比べられる
- 当時の写真で写っていない点は比べない（片手を隠した自由なポーズでも開けられる）
- 当時は写っていたのに今は隠れている点は、1人2点まで許す（少しずれた扱いで、スコアが下がる）。3点以上隠れると `reason: "body_not_visible"` と `missing_joints` を返す
- 点の名前: `left_elbow` `right_elbow` `left_wrist` `right_wrist` `left_knee` `right_knee` `left_ankle` `right_ankle`（左右は写っている本人から見た左右）
- 関節の角度（`joints`）は表示用。ひじを曲げたポーズでは少し動くだけで角度が大きく変わるので、合否には使わない

**顔の判定**（ポーズが合ったあとに行う）

```json
"faces": [
  { "position": 0, "visible": true, "checked": true, "ok": true,  "similarity": 0.82, "others": 0.25 },
  { "position": 1, "visible": true, "checked": true, "ok": false, "similarity": 0.10, "others": 0.05 }
]
```

- 立ち位置ごとに、**鍵の写真の顔と、これまで開けたときの顔（顔の記憶）**のうち、いちばん似ている顔と比べる。`similarity` は −1〜1
- `similarity` が 0.40 以上、かつ、ほかの立ち位置の人の記憶（`others`）より 0.05 以上似ていれば `ok`
- 顔が見えない人がいると `reason: "face_not_visible"`、本人と確かめられない人がいると `reason: "face_mismatch"`（`message` に声かけが入る）
- `checked: false` は、鍵の写真でその人の顔が見えず、まだ記憶がない人（判定しない。開けたときの顔から覚える）
- 開けるのに成功すると、そのときの顔が記憶に加わる（年月で顔が変わってもついていける）
- 詳細（`GET /capsules/{id}`）の `guide[].face_registered` で、顔の記憶があるかわかる
- 失敗によるロックは既定で無し（何回でも撮り直せる。`attempts_left` は `null`）。`EMO_MAX_FAILURES` を設定すると、その回数の失敗でロックされ 423 `locked` になる。失敗に数えるのは `count_mismatch` と `pose_mismatch` だけ
- 何度でも開けられる。認証写真は成功・失敗にかかわらず保存しない

| エラー | code | 意味 |
| --- | --- | --- |
| 409 | `not_open_yet` | 開封日前（開封日を設定したときだけ。`open_date` 付き） |
| 423 | `locked` | 失敗が続いてロック中（`EMO_MAX_FAILURES` を設定したときだけ。`locked_until` 付き） |
| 400 | `invalid_s3_key` | purpose=attempt 以外、または他人のアップロード |
| 404 | `upload_not_found` | PUT が終わる前に呼んだ |

#### GET /capsules/{id}/contents — ライブラリ 🔓

形は `opened` と同じ（`key_photo_url`・`contents`・`url_expires_in`）。

- **写真の URL は60秒で失効する。** 1枚表示で左右にスライドするときなど、表示できなくなったら（`<img>` の `onerror`）このAPIを呼び直して URL を取り直す。解除中なら何度呼んでもよい
- `contents` は追加した順。削除ボタンは全員に出してよい（参加者なら誰の写真でも消せる）

| エラー | code | 意味 |
| --- | --- | --- |
| 401 | `unlock_required` | トークンがない・違う → 写真認証画面へ |
| 401 | `unlock_expired` | 解除の期限切れ（`EMO_UNLOCK_MINUTES` を設定したときだけ）→ 写真認証画面へ |

#### DELETE /capsules/{id}/contents/{content_id} — 写真を削除 🔓

204（本文なし）。画像ファイルも消える。複数選んで消すときは1枚ずつ呼ぶ。

- フォルダの**参加者なら誰でも**、誰が追加した写真でも消せる（共有フォルダのため）

| エラー | code | 意味 |
| --- | --- | --- |
| 403 | `not_member` | フォルダの参加者ではない |
| 404 | `content_not_found` | もう消えている |
| 401 | `unlock_required` / `unlock_expired` | 解除していない・期限切れ |

#### DELETE /capsules/{id} — フォルダを削除

204（本文なし）。**フォルダの参加者なら誰でも**消せる（作成者でなくてもよい）。ポーズでの解除は不要（メンバーが揃わなくても消せるように）。

消えるもの（元に戻せない。メンバー全員から見えなくなる）:

| 種類 | 中身 |
| --- | --- |
| 鍵 | 鍵の写真、骨格プレビュー、鍵のポーズ、顔の記憶 |
| 中身 | 入れた写真 |
| 認証まわり | 解除セッション（認証写真と認証アルバムは保存しない） |
| 参加 | メンバー、招待リンク |

- 消したあとは、そのフォルダの API はすべて 404 `capsule_not_found`、招待リンクも 404 になる
- 誰でも消せるので、画面では「元に戻せない」ことを伝える確認ダイアログを出してください

| エラー | code | 意味 |
| --- | --- | --- |
| 403 | `not_member` | フォルダの参加者ではない |
| 404 | `capsule_not_found` | もう消えている |

### メンバー招待（F-3）

作成者が招待リンクを発行 → 受け取った人がリンクを開いてログイン → 「参加する」でメンバーになる。
参加後は全員が写真の追加・削除・フォルダ削除・開封を同じ権限で行える（招待リンクの発行だけは作成者のみ）。

**招待リンクの URL はフロントで組み立てる**：`https://<フロントのURL>/invite/{token}` のようなページを作り、そのページで下の GET → POST を呼ぶ。

- リンクは期限（14日）まで使えるが、作成者を含めて4人に達すると新しく参加できない
- 参加アカウントと鍵写真の人物・人数は照合しない。参加登録はフォルダを自分の一覧に表示するために行う
- 開封済みのフォルダにも参加できる。ただし中身を見るには自分たちでポーズを揃えて解除する必要があるので、リンクを知っているだけでは見られない

#### POST /capsules/{id}/invites — 招待リンクを発行（作成者のみ）

```json
// 201
{ "token": "_UjqeDeIX8y3iyMOTTYcPQ", "expires_at": "2026-11-07T03:40:00Z" }
```

| エラー | code | 意味 |
| --- | --- | --- |
| 403 | `not_owner` | 作成者以外が発行しようとした |

#### GET /invites/{token} — 招待の中身を確認（参加前でも見られる）

招待ページを開いたときに呼ぶ。写真や中身は返さない。

```json
{
  "capsule_id": "a1b2c3d4e5f6",
  "capsule_name": "成人式",
  "open_date": "2036-01-12",  // 開封日なしなら null
  "days_until_open": 3367,    // 開封日なしなら null
  "people_count": 4,          // 開けるときに揃う人数
  "members_count": 3,
  "invited_by": "user-123",
  "expires_at": "2026-11-07T03:40:00Z",
  "already_member": false     // true なら「参加する」ではなくカプセルへのリンクを出す
}
```

#### POST /invites/{token}/accept — 参加する

200 でカプセルの一覧と同じ形（`CapsuleSummary`、`role: "member"`）を返す。すでにメンバーなら何もせず同じ形を返す（2回押してもエラーにならない）。

| エラー | code | 意味 |
| --- | --- | --- |
| 404 | `invite_not_found` | リンクが間違っている |
| 410 | `invite_expired` | 期限切れ → 作成者に新しいリンクをもらう |

#### GET /capsules/{id}/members — メンバー一覧

```json
[ { "user_id": "alice", "role": "owner", "email": "alice@example.com" }, { "user_id": "bob", "role": "member", "email": null } ]
```

`email` は、ログイン時のメールアドレス（いまは `X-User-Email` ヘッダー。Cognito 導入後は自動）。開封日の通知に使う予定。

### エラーの形（全API共通）

```json
{ "error": { "code": "not_member", "message": "このカプセルのメンバーではないみたい" } }
```

`message` は画面にそのまま出せる文言。表示を作り込むときは `code` で分ける。

| status | code |
| --- | --- |
| 400 | `invalid_s3_key` `invalid_image` `text_required` `s3_key_required` |
| 401 | `unlock_required` `unlock_expired` |
| 403 | `not_member` `not_owner` |
| 404 | `capsule_not_found` `upload_not_found` `invite_not_found` `content_not_found` |
| 409 | `not_open_yet` |
| 410 | `invite_expired` |
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
| メモリ | 3008 MB（姿勢推定の速さに効く。RTMPose は温まった状態で1枚約1秒） |
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
| `EMO_INVITE_DAYS` | | `14` | 招待リンクの有効期限（日） |
| `EMO_UNLOCK_MINUTES` | | `720` | ポーズで解除してからライブラリを使える時間（分）。既定は最大12時間 |
| `EMO_POINT_TOLERANCE` | | `0.35` | 点の位置のずれの許容値（肩幅を1） |
| `EMO_MAX_MISSING_POINTS` | | `2` | 開けるとき、当時写っていた点が何点まで隠れてよいか |
| `EMO_FACE_CHECK` | | `true` | 顔の判定をするか |
| `EMO_FACE_THRESHOLD` / `EMO_FACE_MARGIN` | | `0.40` / `0.05` | 顔の類似度のしきい値と、ほかの人との差 |
| `EMO_MAX_HIDDEN_FACES` | | `0` | 顔が見えなくてもよい人数 |
| `EMO_FACE_MEMORY` | | `5` | 開けたときの顔を1人何件まで覚えるか |
| `EMO_MAX_FAILURES` / `EMO_LOCK_MINUTES` | | `0` / `10` | 何回失敗したら何分ロックするか。0 はロックしない |
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
| Invite | `INVITE#{token}` | `META` | | |
| UnlockSession | `SESSION#{token}` | `META` | | |
| InviteRef | `CAPSULE#{id}` | `INVITE#{token}` | | |
| SessionRef | `CAPSULE#{id}` | `SESSION#{token}` | | |

`*Ref` はフォルダを削除するときの目印（別のパーティションにある招待・解除セッションを漏れなく消すため）。

任意：テーブルの TTL を属性 `ttl` で有効にすると、期限切れの UnlockSession が自動で消える（有効にしなくても動く）。

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
- キーの使い方: `uploads/{userIdのハッシュ}/{key|cover|attempt|content}/...`（ブラウザから PUT）、`previews/{capsuleId}.jpg`（Lambda が書き込む）
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
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::BUCKET_NAME/*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"],
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
| Cognito（Googleログイン） | 未実装。いまは `X-User-Id` ヘッダーで代替 |
| 開封日の通知（EventBridge Scheduler＋SES） | 未実装（PRD でも優先度低） |
