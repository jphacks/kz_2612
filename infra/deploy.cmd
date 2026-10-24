@echo off
rem Build, push to ECR, and update the Lambda function. Run after code changes.
setlocal
set ACCOUNT=024363637530
set REGION=ap-northeast-1
set REPO=emo-api
set REGISTRY=%ACCOUNT%.dkr.ecr.%REGION%.amazonaws.com
set URI=%REGISTRY%/%REPO%:latest

cd /d "%~dp0..\backend" || exit /b 1

aws ecr get-login-password --region %REGION% | docker login --username AWS --password-stdin %REGISTRY% || exit /b 1
docker build --platform linux/amd64 --provenance=false -t %REPO% . || exit /b 1
docker tag %REPO%:latest %URI% || exit /b 1
docker push %URI% || exit /b 1

aws lambda update-function-code --function-name emo-api --image-uri %URI% --region %REGION% --query "LastUpdateStatus" || exit /b 1
aws lambda wait function-updated-v2 --function-name emo-api --region %REGION% || exit /b 1
echo Deploy done.
