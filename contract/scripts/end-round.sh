#!/usr/bin/env bash
# Call end_round if the current round's deadline has passed. Safe to run from cron or launchd;
# it does nothing while a round is still running. The contract also settles itself on the
# first ticket bought after the deadline, so this is only the backstop for quiet rounds.
# Injects without waiting for inclusion (-w none): the Tezos X node never reports it. Any funded key works as SIGNER once the
# deadline is past (the admin can end a round at any time).
# Usage: ENDPOINT=https://rpc.shadownet.teztnets.com CONTRACT=KT1… SIGNER=<alias> contract/scripts/end-round.sh
set -euo pipefail
ENDPOINT="${ENDPOINT:-https://rpc.shadownet.teztnets.com}"
CONTRACT="${CONTRACT:?set CONTRACT to the KT1 address}"
SIGNER="${SIGNER:?set SIGNER to an octez-client key alias}"

storage=$(octez-client -E "$ENDPOINT" get contract storage for "$CONTRACT" 2>/dev/null | tr -s ' \n' ' ')
# Storage: Pair "admin" fee round pool "round_ends" length ...
round_ends=$(echo "$storage" | awk '{gsub(/"/, "", $6); print $6}')
now=$(date -u +%s)
ends=$(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$round_ends" +%s 2>/dev/null || date -u -d "$round_ends" +%s)
if [ "$now" -lt "$ends" ]; then
  echo "Round still running until $round_ends; nothing to do."
  exit 0
fi
echo "Deadline $round_ends has passed; ending the round."
octez-client -E "$ENDPOINT" -w none transfer 0 from "$SIGNER" to "$CONTRACT" --entrypoint end_round --burn-cap 1
