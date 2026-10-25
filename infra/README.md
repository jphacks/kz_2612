# infra（AWS 担当）

`docs/api.md` の「AWS 向け」をそのまま作るための設定ファイルと手順。コマンドは Windows のコマンドプロンプトで、**リポジトリのルート**（`kz_2612`）から実行する。

| 項目 | 値 |
| --- | --- |
| アカウント / リージョン | `024363637530` / `ap-northeast-1` |
| S3 バケット | `emo-capsule-fukushima-1024` |
| DynamoDB テーブル | `emo-timecapsule`（PK/SK＋GSI1） |
| ECR リポジトリ / Lambda 関数 | `emo-api` |
| Lambda 実行ロール | `emo-lambda-role` |

## 初回だけ

`infra\setup.cmd` を実行すれば以下をまとめて行う（何度実行しても大丈夫。ログは `infra/setup.log`、APIのURLは `infra/api-endpoint.txt`）。個別に実行するときは次のとおり。

```bat
rem 1. DynamoDB
aws dynamodb create-table --cli-input-json file://infra/dynamodb-table.json

rem 2. S3（非公開の確認と CORS）
aws s3api put-public-access-block --bucket emo-capsule-fukushima-1024 --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-cors --bucket emo-capsule-fukushima-1024 --cors-configuration file://infra/s3-cors.json

rem 3. Lambda の実行ロール
aws iam create-role --role-name emo-lambda-role --assume-role-policy-document file://infra/lambda-trust.json
aws iam attach-role-policy --role-name emo-lambda-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam put-role-policy --role-name emo-lambda-role --policy-name emo-app --policy-document file://infra/lambda-policy.json

rem 4. ECR に最初のイメージを置く
aws ecr create-repository --repository-name emo-api
aws ecr get-login-password | docker login --username AWS --password-stdin 024363637530.dkr.ecr.ap-northeast-1.amazonaws.com
docker build --platform linux/amd64 --provenance=false -t emo-api backend
docker tag emo-api:latest 024363637530.dkr.ecr.ap-northeast-1.amazonaws.com/emo-api:latest
docker push 024363637530.dkr.ecr.ap-northeast-1.amazonaws.com/emo-api:latest

rem 5. Lambda（ロール作成直後は失敗することがある。10秒待って再実行）
aws lambda create-function --function-name emo-api --package-type Image --code ImageUri=024363637530.dkr.ecr.ap-northeast-1.amazonaws.com/emo-api:latest --role arn:aws:iam::024363637530:role/emo-lambda-role --memory-size 3008 --timeout 30 --environment file://infra/lambda-env.json
aws lambda wait function-active-v2 --function-name emo-api

rem 6. API Gateway（HTTP API）。出力の ApiId と ApiEndpoint を控える
aws apigatewayv2 create-api --name emo-api --protocol-type HTTP --target arn:aws:lambda:ap-northeast-1:024363637530:function:emo-api
aws lambda add-permission --function-name emo-api --statement-id apigw-invoke --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:ap-northeast-1:024363637530:<ApiId>/*"
```

確認：`curl <ApiEndpoint>/health` → `{"status":"ok","backend":"aws"}`

- CORS は FastAPI が返すので、API Gateway 側では**設定しない**（`docs/api.md`）
- 手元でコンテナだけ確かめたいとき：`docker run --rm -p 9000:8080 emo-api` → 別窓で `curl -X POST http://localhost:9000/2015-03-31/functions/function/invocations -d @infra/event-health.json`

## コードを変えたら

```bat
infra\deploy.cmd
```

## Googleログイン（Cognito）

フロントはCognitoの認証コードフロー（PKCE）に対応済み。AWS側は
`infra/cognito-google.yaml` をCloudFormationで作成する。

事前にGoogle Cloud ConsoleでOAuthクライアントを作り、承認済みの
リダイレクトURIへ次を登録する。

`https://<Cognitoドメイン>/oauth2/idpresponse`

API IDと既存Lambda integration IDは次のコマンドで確認できる。

```bat
aws apigatewayv2 get-apis --query "Items[?Name=='emo-api'].ApiId" --output text
aws apigatewayv2 get-integrations --api-id <ApiId> --query "Items[0].IntegrationId" --output text
```

CloudFormationには次を指定する。

- `ApiId`：既存HTTP APIのID
- `ApiIntegrationId`：上で確認したintegration ID
- `GoogleClientId` / `GoogleClientSecret`：Google OAuthクライアント
- `FrontendUrl`：Amplifyのオリジン
- `DomainPrefix`：世界で一意なCognitoドメイン名

作成後、Outputsの値をフロントのビルド環境へ設定する。

```env
VITE_COGNITO_DOMAIN=<CognitoDomain>
VITE_COGNITO_CLIENT_ID=<ClientId>
VITE_COGNITO_REDIRECT_URI=https://<AmplifyのURL>/auth/callback
```

最後に `infra/lambda-env.json` の `EMO_AUTH_MODE` を
`cognito` へ変更してLambda設定を反映する。先に変更すると既存の
開発用ヘッダーが使えなくなるため、CognitoとAPI Gatewayの設定完了後に行う。

## 設定を変えるとき

- フロントを公開したら、そのURLを `infra/s3-cors.json` の `AllowedOrigins` と `infra/lambda-env.json` の `EMO_CORS_ORIGINS`（カンマ区切り）に足して反映する

```bat
aws s3api put-bucket-cors --bucket emo-capsule-fukushima-1024 --cors-configuration file://infra/s3-cors.json
aws lambda update-function-configuration --function-name emo-api --environment file://infra/lambda-env.json
```

## 発表前

`curl -X POST <ApiEndpoint>/warmup` を数回叩いてコールドスタートを済ませる。
