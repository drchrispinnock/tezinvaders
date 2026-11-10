#!/usr/bin/env bash
# Backstop for the on-chain lazy settlement: once an hour, call end_round on every contract
# in src/chain/networks.json whose deadline has passed (contract/scripts/end-round.sh does the
# check). Installed on the admin's Mac by deploy/com.tezinvaders.end-rounds.plist; see README.
# Usage: SIGNER=<octez-client alias> deploy/end-rounds.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SIGNER="${SIGNER:?set SIGNER to an octez-client key alias}"
NETWORKS="${NETWORKS:-$HERE/../src/chain/networks.json}"
node -e 'for (const n of require(process.argv[1]).networks) if (n.contractAddress) console.log(n.name, n.rpcUrl, n.contractAddress)' "$NETWORKS" | while read -r net rpc kt; do
  echo "[$(date -u +%FT%TZ)] $net $kt"
  ENDPOINT="$rpc" CONTRACT="$kt" SIGNER="$SIGNER" "$HERE/../contract/scripts/end-round.sh" 2>&1 | grep -v '^Warning\|disclaimer\|^$\|Some commands\|^This is NOT'
done
