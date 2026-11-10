#!/usr/bin/env bash
# Build the site and publish dist/ to the S3 bucket behind CloudFront, then invalidate.
# Usage: BUCKET=<bucket> [DISTRIBUTION_ID=<id>] [AWS_PROFILE=<profile>] deploy/aws-deploy.sh
# Hashed assets are cached for a year; index.html and the badge SVGs are revalidated on each visit.
# Each network lives at its own path (/shadownet, /shadownet/tezosx, …; src/chain/networks.json), so
# a copy of index.html is uploaded under each path (with and without a trailing slash): CloudFront's
# default root object only covers /, and this way deep links work with no distribution changes.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BUCKET="${BUCKET:?set BUCKET to the site bucket name}"
cd "$HERE/.."
npm run build
aws s3 sync dist/assets "s3://$BUCKET/assets" --delete --cache-control "public, max-age=31536000, immutable"
aws s3 sync dist "s3://$BUCKET" --delete --exclude "assets/*" --cache-control "public, max-age=0, must-revalidate"
for route in $(node -e 'for (const n of require("./src/chain/networks.json").networks) console.log(n.path)'); do
  # s3api, because `aws s3 cp` treats a key ending in "/" as a folder.
  for key in "${route#/}" "${route#/}/"; do
    aws s3api put-object --bucket "$BUCKET" --key "$key" --body dist/index.html --content-type "text/html; charset=utf-8" --cache-control "public, max-age=0, must-revalidate" --query ETag --output text >/dev/null
  done
done
if [ -n "${DISTRIBUTION_ID:-}" ]; then
  aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" --query 'Invalidation.Id' --output text
fi
echo "Deployed dist/ to s3://$BUCKET"
