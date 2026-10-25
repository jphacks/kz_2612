@echo off
rem One-time setup so GitHub Actions can use AWS without access keys (issue #19).
rem Creates: OIDC provider, deploy role, regression-test role, private bucket for test photos.
rem Safe to re-run. Run from the repository root after "aws login". See infra\github-oidc.md.
setlocal
cd /d "%~dp0.."
set ACCOUNT=024363637530
set REGION=ap-northeast-1
set AWS_DEFAULT_REGION=%REGION%
set AWS_PAGER=
set PHOTO_BUCKET=emo-capsule-regression-1024
set PROVIDER_ARN=arn:aws:iam::%ACCOUNT%:oidc-provider/token.actions.githubusercontent.com

echo === [0] check login
aws sts get-caller-identity --query Arn --output text || (echo ERROR: run "aws login" first & exit /b 1)

echo === [1] OIDC provider for GitHub
aws iam get-open-id-connect-provider --open-id-connect-provider-arn %PROVIDER_ARN% --query Url --output text 2>nul || aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 --query OpenIDConnectProviderArn --output text || exit /b 1

echo === [2] deploy role (main branch only)
aws iam get-role --role-name emo-github-deploy --query Role.Arn --output text 2>nul || aws iam create-role --role-name emo-github-deploy --assume-role-policy-document file://infra/github-oidc/deploy-trust.json --query Role.Arn --output text || exit /b 1
aws iam update-assume-role-policy --role-name emo-github-deploy --policy-document file://infra/github-oidc/deploy-trust.json || exit /b 1
aws iam put-role-policy --role-name emo-github-deploy --policy-name emo-deploy --policy-document file://infra/github-oidc/deploy-policy.json || exit /b 1
echo ok

echo === [3] regression-test role (PRs and main, read-only photos)
aws iam get-role --role-name emo-github-regression --query Role.Arn --output text 2>nul || aws iam create-role --role-name emo-github-regression --assume-role-policy-document file://infra/github-oidc/regression-trust.json --query Role.Arn --output text || exit /b 1
aws iam update-assume-role-policy --role-name emo-github-regression --policy-document file://infra/github-oidc/regression-trust.json || exit /b 1
aws iam put-role-policy --role-name emo-github-regression --policy-name emo-regression-read --policy-document file://infra/github-oidc/regression-policy.json || exit /b 1
echo ok

echo === [4] private bucket for test photos
aws s3api head-bucket --bucket %PHOTO_BUCKET% 2>nul || aws s3api create-bucket --bucket %PHOTO_BUCKET% --create-bucket-configuration LocationConstraint=%REGION% --query Location --output text || exit /b 1
aws s3api put-public-access-block --bucket %PHOTO_BUCKET% --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true || exit /b 1
echo ok

echo === [5] GitHub repository variables (needs gh CLI login; skip with Ctrl+C and set them on the web if not)
gh variable set AWS_DEPLOY_ROLE_ARN --repo jphacks/kz_2612 --body arn:aws:iam::%ACCOUNT%:role/emo-github-deploy || exit /b 1
gh variable set AWS_REGRESSION_ROLE_ARN --repo jphacks/kz_2612 --body arn:aws:iam::%ACCOUNT%:role/emo-github-regression || exit /b 1
gh variable set REGRESSION_BUCKET --repo jphacks/kz_2612 --body %PHOTO_BUCKET% || exit /b 1
echo Done. Next: run the "AWS connection check" workflow in the Actions tab (see infra\github-oidc.md).
