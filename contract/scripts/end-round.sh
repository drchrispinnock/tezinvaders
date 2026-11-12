#!/usr/bin/env bash
# Call end_round if the current round's deadline has passed. Safe to run from cron or launchd;
# it does nothing while a round is still running. The contract also settles itself on the
# first ticket bought after the deadline, so this is only the backstop for quiet rounds.
# Calls through octez.js (contract/scripts/call.ts) rather than octez-client, so it also works on
# networks whose protocol the installed client does not know (Quantumnet), and does not wait for
# inclusion (the Tezos X node never reports it). Any funded key works as SIGNER once the
# deadline is past (the admin can end a round at any time).
# Usage: ENDPOINT=https://rpc.shadownet.teztnets.com CONTRACT=KT1… SIGNER=<alias> contract/scripts/end-round.sh
set -euo pipefail
ENDPOINT="${ENDPOINT:-https://rpc.shadownet.teztnets.com}"
CONTRACT="${CONTRACT:?set CONTRACT to the KT1 address}"
SIGNER="${SIGNER:?set SIGNER to an octez-client key alias}"

# round_ends straight from the RPC (field 9 of the storage comb), so no octez-client is needed.
round_ends=$(curl -sS -m 20 "$ENDPOINT/chains/main/blocks/head/context/contracts/$CONTRACT/storage" | node "$(dirname "$0")/round-ends.ts")
now=$(date -u +%s)
ends=$(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$round_ends" +%s 2>/dev/null || date -u -d "$round_ends" +%s)
if [ "$now" -lt "$ends" ]; then
  echo "Round still running until $round_ends; nothing to do."
  exit 0
fi
echo "Deadline $round_ends has passed; ending the round."
node "$(dirname "$0")/call.ts" --rpc "$ENDPOINT" --contract "$CONTRACT" --entrypoint end_round --admin "$SIGNER"
