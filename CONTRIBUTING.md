# 開発の進め方

このリポジトリは「issue → PR → CI → マージ」の流れで進めます。CI や AWS が初めての人も、この順に動けば迷わないように書いています。

## 全体の流れ

1. **issue を作る**: 「New issue」から「タスク」を選ぶ。作った issue は `triage`（提案・人の確認待ち）になる
2. **人が確認する**: 内容に問題がなければ `agent-ready` を付ける。これは「Claude に任せてよい」の印
3. **実装して PR を作る**: PR のテンプレートに沿って書く。先頭に `Closes #番号` を書くと、マージ時に issue が自動で閉じる
4. **CI が緑になるまで直す**: 下の「用語」の CI が全部成功すると緑になる
5. **人がマージする**
6. **作業中に見つけた別の課題**: 自分で直さず、`triage` で新しい issue にする

人が判断するのは **「`agent-ready` を付ける」と「マージする」の2か所だけ**です。

## 用語

- **issue**: やることを書いた依頼票。GitHub の Issues タブで見られる
- **PR（プルリクエスト）**: 変更をまとめて main に取り込んでほしいと頼む画面。レビューと CI の結果が並ぶ
- **main**: リポジトリの本線。ここにあるものが動くものの正
- **CI**: push や PR のたびに GitHub が自動で走らせる検査。ここでは次の2つ
  - `frontend`: lint（書き方の検査）・型チェック・テスト・ビルド
  - `backend`: ruff（書き方の検査）・pytest（テスト）
- **緑 / 赤**: CI の成功 / 失敗。赤のままでは PR をマージできないように設定する予定（後述のブランチ保護）
- **ブランチ保護（ruleset）**: main に対するルール。PR を通すこと、CI を緑にすること、履歴を消さないことを強制する

## ラベル

| ラベル | 意味 |
| --- | --- |
| `triage` | 提案。人の確認待ち |
| `agent-ready` | 人が確認済み。Claude に任せてよい |
| `needs-human` | AWS の操作など、人の手作業が要る |
| `model:sonnet` / `model:haiku` / `model:opus` | 実装を任せる Claude のモデル。ふつうの実装は Sonnet、手順どおりの単純作業は Haiku、設計やセキュリティの判断が要るものは Opus |
| `area:*` | 触る場所（`ci`・`frontend`・`backend`・`infra`） |
| `ux` / `pitch` | 使いやすさの改善 / 発表の準備 |

## PR の書き方

- 先頭に `Closes #番号` を書く
- `前提知識` 欄に、PR を読むのに必要な用語を1〜2文ずつ書く
- `何が変わるか` は、ファイル名ではなく使う人から見た変化で書く。チームメイトに影響があるものには ⚠️ を付ける
- `確認したこと` は受け入れ条件ごとに結果を書く。確かめられなかったことは「未確認」と書く

## main のブランチ保護（管理者向け）

main への直接 push を禁止し、PR で CI が緑のときだけマージできるようにする設定です。**設定すると main へ直接 push できなくなるため、チームメイトに伝えてから実行してください。**

前提: `gh auth status` でリポジトリの管理者としてログインしていること。

### 1. ルールを作る

次のコマンドを実行します（リポジトリ直下で実行）。

```bash
gh api --method POST repos/jphacks/kz_2612/rulesets --input - <<'JSON'
{
  "name": "main を保護",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "frontend" },
          { "context": "backend" }
        ]
      }
    },
    { "type": "non_fast_forward" },
    { "type": "deletion" }
  ],
  "bypass_actors": []
}
JSON
```

- `pull_request`: main へは PR を通して入れる（承認は0人でよい）
- `required_status_checks`: `frontend` と `backend` の CI が緑でないとマージできない
- `non_fast_forward`: force push（履歴の上書き）を禁止する
- `deletion`: main ブランチの削除を禁止する

### 2. 設定されたか確かめる

```bash
gh api repos/jphacks/kz_2612/rulesets
```

一覧に「main を保護」が `enforcement: active` で出ればよいです。GitHub の Settings → Rules からも見られます。

### 3. 動くか確かめる

- main へ直接 `git push` すると拒否される
- CI が赤の PR は、マージボタンが押せない
