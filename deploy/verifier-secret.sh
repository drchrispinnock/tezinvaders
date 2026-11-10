#!/usr/bin/env bash
# Create or update the Secrets Manager secret the verifier Lambda reads its keys from, built
# from the admin's .env (VERIFIER_SECRET_KEY and any VERIFIER_SECRET_KEY_<chainId>).
# Usage: [AWS_PROFILE=…] [AWS_REGION=us-east-1] [SECRET_NAME=tezinvaders/verifier] deploy/verifier-secret.sh
# Prints the secret's ARN: pass it to the stack as VerifierSecretArn.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SECRET_NAME="${SECRET_NAME:-tezinvaders/verifier}"
json=$(node -e '
const fs = require("fs");
const env = Object.fromEntries(fs.readFileSync(process.argv[1], "utf8").split("\n").filter((l) => /^[A-Za-z_0-9]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const byChain = {};
for (const [k, v] of Object.entries(env)) { const m = /^VERIFIER_SECRET_KEY_(Net[1-9A-HJ-NP-Za-km-z]{12})$/.exec(k); if (m && v) byChain[m[1]] = v; }
if (!env.VERIFIER_SECRET_KEY) { console.error("no VERIFIER_SECRET_KEY in .env"); process.exit(1); }
console.log(JSON.stringify({ default: env.VERIFIER_SECRET_KEY, byChain }));' "$HERE/../.env")
tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT; printf '%s' "$json" > "$tmp"
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" >/dev/null 2>&1; then
  aws secretsmanager put-secret-value --secret-id "$SECRET_NAME" --secret-string "file://$tmp" --query ARN --output text
else
  aws secretsmanager create-secret --name "$SECRET_NAME" --description "TezInvaders score verifier keys" --secret-string "file://$tmp" --query ARN --output text
fi
