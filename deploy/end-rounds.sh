#!/usr/bin/env bash
# Backstop for the on-chain lazy settlement: once an hour, call end_round on every contract
# named in .env.production whose deadline has passed (contract/scripts/end-round.sh does the
# check). Installed on the admin's Mac by deploy/com.tezinvaders.end-rounds.plist; see README.
# Usage: SIGNER=<octez-client alias> deploy/end-rounds.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SIGNER="${SIGNER:?set SIGNER to an octez-client key alias}"
ENV_FILE="${ENV_FILE:-$HERE/../.env.production}"
for net in SHADOWNET MAINNET TEZOSX_SHADOWNET TEZOSX_MAINNET; do
  rpc=$(grep "^VITE_RPC_URL_${net}=" "$ENV_FILE" | cut -d= -f2-)
  kt=$(grep "^VITE_CONTRACT_ADDRESS_${net}=" "$ENV_FILE" | cut -d= -f2-)
  [ -n "$rpc" ] && [ -n "$kt" ] || continue
  echo "[$(date -u +%FT%TZ)] $net $kt"
  ENDPOINT="$rpc" CONTRACT="$kt" SIGNER="$SIGNER" "$HERE/../contract/scripts/end-round.sh" 2>&1 | grep -v '^Warning\|disclaimer\|^$\|Some commands\|^This is NOT'
done
