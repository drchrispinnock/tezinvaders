#!/usr/bin/env bash
# Build the site and publish dist/ to the S3 bucket behind CloudFront, then invalidate.
# Usage: BUCKET=<bucket> [DISTRIBUTION_ID=<id>] [AWS_PROFILE=<profile>] deploy/aws-deploy.sh
# Hashed assets are cached for a year; index.html and the badge SVGs are revalidated on each visit.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BUCKET="${BUCKET:?set BUCKET to the site bucket name}"
cd "$HERE/.."
npm run build
aws s3 sync dist/assets "s3://$BUCKET/assets" --delete --cache-control "public, max-age=31536000, immutable"
aws s3 sync dist "s3://$BUCKET" --delete --exclude "assets/*" --cache-control "public, max-age=0, must-revalidate"
if [ -n "${DISTRIBUTION_ID:-}" ]; then
  aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" --query 'Invalidation.Id' --output text
fi
echo "Deployed dist/ to s3://$BUCKET"
