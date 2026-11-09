#!/usr/bin/env bash
# Originate contract/tezinvaders.tz with octez-client and print the KT1 address.
# Usage: ENDPOINT=https://rpc.shadownet.teztnets.com ADMIN=<alias> FEE_MUTEZ=1000000 ROUND_LENGTH=604800 contract/scripts/deploy.sh
# Defaults to Shadownet and one-week rounds; pass ENDPOINT=https://rpc.tzkt.io/mainnet for Mainnet.
# Needs node for the storage generator (the token metadata carries the badge SVGs on chain, so
# origination burns a few tez of storage; BURN_CAP defaults to 25).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ENDPOINT="${ENDPOINT:-https://rpc.shadownet.teztnets.com}"
ADMIN="${ADMIN:?set ADMIN to an octez-client key alias that will own the contract}"
FEE_MUTEZ="${FEE_MUTEZ:-1000000}"
ROUND_LENGTH="${ROUND_LENGTH:-604800}"
BURN_CAP="${BURN_CAP:-25}"
NAME="${NAME:-tezinvaders}"

admin_addr=$(octez-client -E "$ENDPOINT" show address "$ADMIN" 2>/dev/null | awk '/Hash/{print $2}')
init=$(node "$HERE/storage.ts" --admin "$admin_addr" --fee "$FEE_MUTEZ" --round-length "$ROUND_LENGTH")
echo "Originating $NAME on $ENDPOINT, admin=$admin_addr fee=${FEE_MUTEZ}mutez round=${ROUND_LENGTH}s (storage literal: ${#init} chars)"
octez-client -E "$ENDPOINT" originate contract "$NAME" transferring 0 from "$ADMIN" \
  running "$HERE/../tezinvaders.tz" \
  --init "$init" --burn-cap "$BURN_CAP" --force
echo
echo "Put the KT1 address above into .env as VITE_CONTRACT_ADDRESS_SHADOWNET (or _MAINNET if you deployed there)."
