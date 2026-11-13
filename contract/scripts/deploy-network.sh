#!/usr/bin/env bash
# Originate the contract on one network from src/chain/networks.json and write the KT1 back.
# Goes through contract/scripts/originate.ts (octez.js), so it works on networks whose protocol the
# installed octez-client does not know (Quantumnet runs Alpha); octez-client only supplies the key.
#   contract/scripts/deploy-network.sh <name>        e.g. ushuaianet, tezosx-shadownet
# Env: ADMIN (octez-client alias, default tezinvaders-admin), VERIFIER (edpk; default from .env's
# VERIFIER_PUBLIC_KEY), FEE_MUTEZ, ROUND_LENGTH as for deploy.sh. Refuses to run while the admin
# has no tez on that network (fund it from the network's faucet first). Afterwards redeploy the
# site (npm run deploy:aws) so the new address ships.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../.."
NETWORKS="$ROOT/src/chain/networks.json"
NAME="${1:?usage: deploy-network.sh <network name from networks.json>}"
ADMIN="${ADMIN:-tezinvaders-admin}"

entry() { node -e 'const n = require(process.argv[1]).networks.find((x) => x.name === process.argv[2]); if (!n) { console.error("no network " + process.argv[2]); process.exit(2); } console.log(n[process.argv[3]] ?? "")' "$NETWORKS" "$NAME" "$1"; }
RPC=$(entry rpcUrl); LAYER=$(entry layer); TZKT=$(entry tzktApi); FAUCET=$(entry faucet); EXISTING=$(entry contractAddress)

CHAIN_ID=$(entry chainId)
# The chain's own verifier key when .env has one (Quantumnet: ML-DSA), else the shared key.
if [ -z "${VERIFIER:-}" ] && [ -f "$ROOT/.env" ]; then VERIFIER=$( (grep "^VERIFIER_PUBLIC_KEY_${CHAIN_ID}=" "$ROOT/.env"; grep "^VERIFIER_PUBLIC_KEY=" "$ROOT/.env") | head -1 | cut -d= -f2- || true); fi
VERIFIER="${VERIFIER:?set VERIFIER to the verifier public key, edpk… (or VERIFIER_PUBLIC_KEY in .env)}"

admin_addr=$(octez-client -E "$RPC" show address "$ADMIN" 2>/dev/null | awk '/Hash/{print $2}')
balance=$(curl -sS -m 15 "$RPC/chains/main/blocks/head/context/contracts/$admin_addr/balance" | tr -d '"')
echo "$NAME: rpc $RPC, admin $admin_addr has $((balance / 1000000)).$(printf '%06d' $((balance % 1000000))) tez"
if [ "${balance:-0}" -lt 5000000 ]; then
  echo "The admin needs at least 5 tez on $NAME to originate.${FAUCET:+ Faucet: $FAUCET}" >&2
  exit 1
fi
[ -n "$EXISTING" ] && echo "note: $NAME already has $EXISTING; the new contract replaces it in networks.json"

wait=""; [ "$LAYER" = l2 ] && wait="--no-wait"   # the Tezos X node never reports confirmations (plain string: macOS bash 3.2 chokes on empty arrays)
# shellcheck disable=SC2086
out=$(node "$HERE/originate.ts" --rpc "$RPC" --admin "$ADMIN" --verifier "$VERIFIER" --fee "${FEE_MUTEZ:-1000000}" --round-length "${ROUND_LENGTH:-86400}" $wait 2>&1) || { echo "$out" | grep -v "^\s*at " | tail -15; echo "origination failed" >&2; exit 1; }
hash=$(echo "$out" | sed -n "s/.*Operation hash is '\([^']*\)'.*/\1/p")
kt=$(echo "$out" | sed -n "s/.*New contract \(KT1[1-9A-HJ-NP-Za-km-z]*\) originated.*/\1/p")
if [ -z "$kt" ]; then echo "$out" | tail -15; echo "origination failed" >&2; exit 1; fi
echo "injected $hash"
node -e '
const fs = require("fs"); const [file, name, kt] = process.argv.slice(1);
const text = fs.readFileSync(file, "utf8");
const re = new RegExp(`("name": "${name}"[\\s\\S]*?"contractAddress": ")[^"]*(")`);
if (!re.test(text)) { console.error("could not find the entry to update"); process.exit(1); }
fs.writeFileSync(file, text.replace(re, `$1${kt}$2`));' "$NETWORKS" "$NAME" "$kt"
echo "$NAME contract: $kt (written to src/chain/networks.json). Now: git commit, then npm run deploy:aws."
