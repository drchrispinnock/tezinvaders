#!/usr/bin/env bash
# Bundle the verifier and upload it to the Lambda from deploy/verifier-lambda.yml.
# Usage: [AWS_PROFILE=…] [FUNCTION=tezinvaders-verifier] deploy/verifier-deploy.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FUNCTION="${FUNCTION:-tezinvaders-verifier}"
cd "$HERE/.."
npm run verifier:bundle
rm -f verifier/dist/lambda.zip
(cd verifier/dist && zip -q lambda.zip lambda.mjs)
aws lambda update-function-code --function-name "$FUNCTION" --zip-file fileb://verifier/dist/lambda.zip --query 'LastUpdateStatus' --output text
echo "Deployed. Check: curl \$(aws cloudformation describe-stacks --stack-name tezinvaders-verifier --query 'Stacks[0].Outputs[?OutputKey==\`FunctionUrl\`].OutputValue' --output text)key"
