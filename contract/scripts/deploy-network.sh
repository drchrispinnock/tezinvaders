#!/usr/bin/env bash
# Originate the contract on one network from src/chain/networks.json and write the KT1 back:
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

if [ -z "${VERIFIER:-}" ] && [ -f "$ROOT/.env" ]; then VERIFIER=$(grep '^VERIFIER_PUBLIC_KEY=' "$ROOT/.env" | cut -d= -f2- || true); fi
VERIFIER="${VERIFIER:?set VERIFIER to the verifier public key, edpk… (or VERIFIER_PUBLIC_KEY in .env)}"

admin_addr=$(octez-client -E "$RPC" show address "$ADMIN" 2>/dev/null | awk '/Hash/{print $2}')
balance=$(curl -sS -m 15 "$RPC/chains/main/blocks/head/context/contracts/$admin_addr/balance" | tr -d '"')
echo "$NAME: rpc $RPC, admin $admin_addr has $((balance / 1000000)).$(printf '%06d' $((balance % 1000000))) tez"
if [ "${balance:-0}" -lt 5000000 ]; then
  echo "The admin needs at least 5 tez on $NAME to originate.${FAUCET:+ Faucet: $FAUCET}" >&2
  exit 1
fi
[ -n "$EXISTING" ] && echo "note: $NAME already has $EXISTING; the new contract replaces it in networks.json"

wait=1; [ "$LAYER" = l2 ] && wait=none   # the Tezos X node never reports confirmations
out=$(ENDPOINT="$RPC" ADMIN="$ADMIN" VERIFIER="$VERIFIER" NAME="tezinvaders-$NAME" WAIT=$wait "$HERE/deploy.sh" 2>&1 | grep -v '^Warning\|disclaimer\|Some commands\|^This is NOT')
hash=$(echo "$out" | sed -n "s/.*Operation hash is '\([^']*\)'.*/\1/p")
if [ -z "$hash" ]; then echo "$out" | tail -20; echo "origination failed" >&2; exit 1; fi
echo "injected $hash; waiting for $TZKT to index it"
kt=""
for _ in $(seq 1 40); do
  sleep 6
  kt=$(curl -sS -m 15 "$TZKT/v1/operations/originations?sender=$admin_addr&sort.desc=id&limit=3" | node -e 'let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => { const op = JSON.parse(s).find((o) => o.hash === process.argv[1] && o.status === "applied"); if (op) console.log(op.originatedContract.address); })' "$hash")
  [ -n "$kt" ] && break
done
if [ -z "$kt" ]; then echo "not indexed yet; find the KT1 for $hash on the explorer and put it into networks.json" >&2; exit 1; fi
node -e '
const fs = require("fs"); const [file, name, kt] = process.argv.slice(1);
const text = fs.readFileSync(file, "utf8");
const re = new RegExp(`("name": "${name}"[\\s\\S]*?"contractAddress": ")[^"]*(")`);
if (!re.test(text)) { console.error("could not find the entry to update"); process.exit(1); }
fs.writeFileSync(file, text.replace(re, `$1${kt}$2`));' "$NETWORKS" "$NAME" "$kt"
echo "$NAME contract: $kt (written to src/chain/networks.json). Now: git commit, then npm run deploy:aws."
