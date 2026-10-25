# GitHub Actions から AWS を使う（OIDC）

GitHub Actions が AWS を操作できるようにする設定です。AWS の鍵（アクセスキー）は GitHub に保存しません。自動デプロイ（#20）と、判定の回帰テストで使う写真の取得（#21）が、この設定を前提にしています。

## しくみ

1. ワークフローを動かすたびに、GitHub が「このリポジトリの、このブランチで動いている」という証明書（OIDC トークン）を発行する
2. AWS がその証明書を確かめる。条件に合えばロール（権限のまとまり）を一時的に貸す。期限は1時間ほど
3. 鍵を保存していないので、漏れる鍵がない。借りられる条件と、できる操作はロールごとに絞ってある

## 作るもの

| 名前 | 何か | 借りられる条件 | できること |
| --- | --- | --- | --- |
| `token.actions.githubusercontent.com` | OIDC プロバイダ（「GitHub の証明書を信用する」という AWS の設定） | — | — |
| `emo-github-deploy` | デプロイ用ロール | このリポジトリの `main` ブランチで動くワークフローだけ | ECR の `emo-api` へのイメージの push と取得、Lambda `emo-api` のコードの更新と取得 |
| `emo-github-regression` | 回帰テスト用ロール | このリポジトリの PR と `main` | 写真用バケットの `cases/` の下の読み取りだけ |
| `emo-capsule-regression-1024` | 回帰テストの写真を置く非公開バケット | — | 公開はすべて禁止。アプリのバケットとは分けてある |

許す操作の詳しい中身は `infra/github-oidc/*.json` に書いてあります。`*-trust.json` が借りられる条件、`*-policy.json` ができる操作です。

### fork からの PR は写真を読めない

公開リポジトリには、だれでも fork（リポジトリのコピー）から PR を送れます。GitHub は、fork からの PR には OIDC の証明書を発行しません。そのため、回帰テスト用のロールは借りられず、写真は読めません。

チームのメンバーが同じリポジトリのブランチから出した PR は、ロールを借りられます。ワークフローを書き換えれば写真を取り出せてしまうので、リポジトリに書き込めるのはチームの3人だけにしておいてください。

## 設定する（AWS 担当が1回だけ）

リポジトリのルートで、`aws login` と `gh auth login` を済ませてから実行します。

```bat
infra\setup-github-oidc.cmd
```

このスクリプトは、上の表のものを作ります。そのあと、GitHub のリポジトリ変数（Variables）を3つ登録します。

| 変数 | 値 |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::024363637530:role/emo-github-deploy` |
| `AWS_REGRESSION_ROLE_ARN` | `arn:aws:iam::024363637530:role/emo-github-regression` |
| `REGRESSION_BUCKET` | `emo-capsule-regression-1024` |

ロールの ARN（AWS 上での名前）は秘密ではないので、Secrets ではなく Variables に置きます。何度実行しても大丈夫です。すでにあるものはそのまま使い、ポリシーは上書きして最新にします。

## 確かめる

GitHub の Actions タブ →「AWS 接続の確認 (AWS connection check)」→「Run workflow」で、ブランチとロールを選んで実行します。

| 選ぶブランチ | 選ぶロール | 期待する結果 |
| --- | --- | --- |
| `main` | deploy | 成功する。`emo-github-deploy` のロールの名前が表示される |
| `main` | regression | 成功する。`cases/` の下のファイル数が表示される（写真の名前は出さない） |
| `main` 以外 | deploy | **失敗する**（`Not authorized to perform sts:AssumeRoleWithWebIdentity`）。main 以外からはデプロイ用のロールを借りられない |

## 注意

- デプロイのワークフロー（#20）では `environment:` を使わないでください。使うと証明書の中身が `repo:jphacks/kz_2612:environment:<名前>` に変わり、デプロイ用のロールを借りられなくなります。使う場合は、`deploy-trust.json` の条件も合わせて変えてください。
- 写真を足すときは、`aws s3 cp <ファイル> s3://emo-capsule-regression-1024/cases/<ケース名>/` で置きます。置き方の決まりは #21 で決めます。
