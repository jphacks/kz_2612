@echo off
rem One-time AWS setup: DynamoDB, S3, IAM role, ECR, Lambda, API Gateway.
rem Safe to re-run: existing resources are reused. Output is also saved to infra\setup.log.
setlocal
if not "%~1"=="run" (
  cmd /c ""%~f0" run 2>&1" | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%~dp0setup.log'"
  exit /b
)
cd /d "%~dp0.."
set ACCOUNT=024363637530
set REGION=ap-northeast-1
set AWS_DEFAULT_REGION=%REGION%
set AWS_PAGER=
set BUCKET=emo-capsule-fukushima-1024
set REGISTRY=%ACCOUNT%.dkr.ecr.%REGION%.amazonaws.com
set URI=%REGISTRY%/emo-api:latest
set ROLE_ARN=arn:aws:iam::%ACCOUNT%:role/emo-lambda-role

echo === [0] check login and Docker
aws sts get-caller-identity --query Arn --output text || (echo ERROR: run "aws login" first & exit /b 1)
docker info >nul 2>&1 || (echo ERROR: start Docker Desktop first & exit /b 1)

echo === [1] DynamoDB
aws dynamodb describe-table --table-name emo-timecapsule --query Table.TableStatus --output text 2>nul || aws dynamodb create-table --cli-input-json file://infra/dynamodb-table.json --query TableDescription.TableStatus --output text || exit /b 1

echo === [2] S3
aws s3api put-public-access-block --bucket %BUCKET% --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true || exit /b 1
aws s3api put-bucket-cors --bucket %BUCKET% --cors-configuration file://infra/s3-cors.json || exit /b 1
echo ok

echo === [3] IAM role
aws iam get-role --role-name emo-lambda-role --query Role.Arn --output text 2>nul || aws iam create-role --role-name emo-lambda-role --assume-role-policy-document file://infra/lambda-trust.json --query Role.Arn --output text || exit /b 1
aws iam attach-role-policy --role-name emo-lambda-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole || exit /b 1
aws iam put-role-policy --role-name emo-lambda-role --policy-name emo-app --policy-document file://infra/lambda-policy.json || exit /b 1
echo ok

echo === [4] ECR build and push (first build takes 10-20 min)
aws ecr describe-repositories --repository-names emo-api --query repositories[0].repositoryUri --output text 2>nul || aws ecr create-repository --repository-name emo-api --query repository.repositoryUri --output text || exit /b 1
aws ecr get-login-password | docker login --username AWS --password-stdin %REGISTRY% || exit /b 1
docker build --platform linux/amd64 --provenance=false -t emo-api backend || exit /b 1
docker tag emo-api:latest %URI% || exit /b 1
docker push %URI% || exit /b 1

echo === [5] Lambda
aws lambda get-function --function-name emo-api --query Configuration.FunctionArn --output text 2>nul
if errorlevel 1 (
  call :create_lambda || exit /b 1
) else (
  aws lambda update-function-code --function-name emo-api --image-uri %URI% --query LastUpdateStatus --output text || exit /b 1
  aws lambda wait function-updated-v2 --function-name emo-api || exit /b 1
  aws lambda update-function-configuration --function-name emo-api --memory-size 3008 --timeout 30 --environment file://infra/lambda-env.json --query LastUpdateStatus --output text || exit /b 1
  aws lambda wait function-updated-v2 --function-name emo-api || exit /b 1
)

echo === [6] API Gateway
set API_ID=
for /f "usebackq delims=" %%a in (`aws apigatewayv2 get-apis --query "Items[?Name=='emo-api'].ApiId" --output text`) do set API_ID=%%a
if not defined API_ID for /f "usebackq delims=" %%a in (`aws apigatewayv2 create-api --name emo-api --protocol-type HTTP --target arn:aws:lambda:%REGION%:%ACCOUNT%:function:emo-api --query ApiId --output text`) do set API_ID=%%a
if not defined API_ID (echo ERROR: could not create API & exit /b 1)
aws lambda add-permission --function-name emo-api --statement-id apigw-invoke --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:%REGION%:%ACCOUNT%:%API_ID%/*" >nul 2>&1
set ENDPOINT=https://%API_ID%.execute-api.%REGION%.amazonaws.com
echo %ENDPOINT%> infra\api-endpoint.txt
echo API endpoint: %ENDPOINT%

echo === [7] health check (first call loads the model, ~10s)
curl -s -m 60 %ENDPOINT%/health
echo.
echo === DONE
exit /b 0

:create_lambda
for /l %%i in (1,1,6) do (
  aws lambda create-function --function-name emo-api --package-type Image --code ImageUri=%URI% --role %ROLE_ARN% --memory-size 3008 --timeout 30 --environment file://infra/lambda-env.json --query FunctionArn --output text && goto :created
  echo role not ready yet, retrying in 10s...
  timeout /t 10 /nobreak >nul
)
exit /b 1
:created
aws lambda wait function-active-v2 --function-name emo-api
exit /b %errorlevel%
