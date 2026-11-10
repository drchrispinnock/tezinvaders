#!/usr/bin/env bash
# End-to-end test of contract/tezinvaders.tz against a local octez-client mockup chain.
# Needs octez-client and node (for the storage generator); no network.
# Usage: contract/scripts/test-mockup.sh [--keep]
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CONTRACT="$HERE/../tezinvaders.tz"
BASE_DIR="$HERE/../.mockup"
PROTOCOL="${PROTOCOL:-}"   # empty = octez-client's default (Alpha); set to pin a named protocol hash

rm -rf "$BASE_DIR"
proto_args=()
[ -n "$PROTOCOL" ] && proto_args=(--protocol "$PROTOCOL")
octez-client --mode mockup --base-dir "$BASE_DIR" "${proto_args[@]}" create mockup >/dev/null 2>&1

tc() { octez-client --mode mockup --base-dir "$BASE_DIR" "$@" 2>&1 | grep -v '^Warning:\|disclaimer\|^$\|Some commands\|^This is NOT' || true; }
pass=0; fail=0
ok()   { pass=$((pass+1)); echo "  ok   $1"; }
bad()  { fail=$((fail+1)); echo "  FAIL $1"; echo "$2" | sed 's/^/       /'; }
expect_ok()   { out="$(tc "${@:2}")"; echo "$out" | grep -q 'successfully\|Well typed' && ok "$1" || bad "$1" "$out"; }
expect_fail() { out="$(tc "${@:3}")"; echo "$out" | grep -q "$2" && ok "$1 (rejected: $2)" || bad "$1" "$out"; }
storage()     { tc get contract storage for "${1:-tezinvaders}" | tr -s ' \n' ' '; }
balance()     { tc get balance for "$1" | awk '{print $1}'; }
# Big map ids are the last five numbers of the storage: best, ledger, operators, token_metadata, metadata.
bigmap_id()   { storage "${2:-tezinvaders}" | awk -v n="$1" '{print $(NF-5+n)}'; }
# Balance of ($1 token $2) in the ledger; prints 0 when the key is absent.
ledger()      { local h; h=$(tc hash data "Pair \"$1\" $2" of type 'pair address nat' | awk '/^Script-expression-ID-Hash/{print $2}');
                tc get element "$h" of big map "$(bigmap_id 2 "${3:-tezinvaders}")" | grep -o '^[0-9][0-9]*' || echo 0; }
expect_bal()  { b=$(ledger "$2" "$3"); [ "$b" = "$4" ] && ok "$1 (balance $b)" || bad "$1" "expected $4, got '$b'"; }

ADMIN=bootstrap1; P1=bootstrap2; P2=bootstrap3; P3=bootstrap4
admin_addr=$(tc show address $ADMIN | awk '/Hash/{print $2}')
p1_addr=$(tc show address $P1 | awk '/Hash/{print $2}')
p2_addr=$(tc show address $P2 | awk '/Hash/{print $2}')
p3_addr=$(tc show address $P3 | awk '/Hash/{print $2}')
FAR=4102444800   # 2100-01-01: the mockup clock sits at the epoch, so this round never ends by itself
WEEK=604800

echo "typecheck"
expect_ok "contract typechecks" typecheck script "$CONTRACT"

echo "originate (fee 1 tez, round 1, deadline far away)"
init=$(node "$HERE/storage.ts" --admin "$admin_addr" --fee 1000000 --round-length $WEEK --round-ends $FAR)
expect_ok "origination" originate contract tezinvaders transferring 0 from $ADMIN \
  running "$CONTRACT" --init "$init" --burn-cap 20 --force

echo "play"
expect_fail "wrong fee" BAD_FEE transfer 0.5 from $P1 to tezinvaders --entrypoint play --burn-cap 1
expect_ok   "P1 buys ticket" transfer 1 from $P1 to tezinvaders --entrypoint play --burn-cap 1
expect_ok   "P2 buys ticket" transfer 1 from $P2 to tezinvaders --entrypoint play --burn-cap 1
s=$(storage); echo "$s" | grep -q '2000000' && ok "pool is 2 tez" || bad "pool is 2 tez" "$s"

echo "submit_score"
expect_fail "no ticket"    NO_TICKET       transfer 0 from $P3 to tezinvaders --entrypoint submit_score --arg 999 --burn-cap 1
expect_fail "tez attached" NO_TEZ_ACCEPTED transfer 1 from $P1 to tezinvaders --entrypoint submit_score --arg 10 --burn-cap 1
expect_ok   "P1 scores 500"  transfer 0 from $P1 to tezinvaders --entrypoint submit_score --arg 500 --burn-cap 1
expect_ok   "P2 scores 1200" transfer 0 from $P2 to tezinvaders --entrypoint submit_score --arg 1200 --burn-cap 1
expect_ok   "P1 scores 300 (ignored, lower)" transfer 0 from $P1 to tezinvaders --entrypoint submit_score --arg 300 --burn-cap 1
s=$(storage); echo "$s" | grep -q "\"$p1_addr\" 500" && ok "P1 best stays 500" || bad "P1 best stays 500" "$s"

echo "badges"
expect_bal "P1 (500) has no dollar badge" "$p1_addr" 0 0
expect_bal "P2 (1200) earned the dollar badge" "$p2_addr" 0 1
expect_bal "P2 has no euro badge yet" "$p2_addr" 1 0
expect_ok  "P2 scores 5000" transfer 0 from $P2 to tezinvaders --entrypoint submit_score --arg 5000 --burn-cap 1
expect_bal "P2 still has one dollar badge" "$p2_addr" 0 1
expect_bal "P2 earned the euro badge"  "$p2_addr" 1 1
expect_bal "P2 earned the pound badge" "$p2_addr" 2 1
expect_bal "P2 has no yen badge"       "$p2_addr" 3 0
expect_ok  "P1 scores 12000" transfer 0 from $P1 to tezinvaders --entrypoint submit_score --arg 12000 --burn-cap 1
expect_bal "P1 earned the mothership"  "$p1_addr" 4 1
expect_bal "P1 earned the dollar badge too" "$p1_addr" 0 1

echo "FA2 transfer"
tx() { echo "{ Pair \"$1\" { Pair \"$2\" (Pair $3 $4) } }"; }
expect_ok   "P2 gives the dollar badge to P3" transfer 0 from $P2 to tezinvaders --entrypoint transfer --arg "$(tx "$p2_addr" "$p3_addr" 0 1)" --burn-cap 1
expect_bal  "P2 no longer holds it" "$p2_addr" 0 0
expect_bal  "P3 holds it"          "$p3_addr" 0 1
expect_fail "P2 cannot give it twice"  FA2_INSUFFICIENT_BALANCE transfer 0 from $P2 to tezinvaders --entrypoint transfer --arg "$(tx "$p2_addr" "$p3_addr" 0 1)" --burn-cap 1
expect_fail "P1 cannot move P3's badge" FA2_NOT_OPERATOR transfer 0 from $P1 to tezinvaders --entrypoint transfer --arg "$(tx "$p3_addr" "$p1_addr" 0 1)" --burn-cap 1
expect_fail "unknown token"            FA2_TOKEN_UNDEFINED transfer 0 from $P1 to tezinvaders --entrypoint transfer --arg "$(tx "$p1_addr" "$p3_addr" 9 1)" --burn-cap 1
expect_ok   "P1 moving nothing is fine" transfer 0 from $P1 to tezinvaders --entrypoint transfer --arg "$(tx "$p1_addr" "$p3_addr" 1 0)" --burn-cap 1
expect_fail "P1 cannot make itself P3's operator" FA2_NOT_OWNER transfer 0 from $P1 to tezinvaders --entrypoint update_operators --arg "{ Left (Pair \"$p3_addr\" (Pair \"$p1_addr\" 0)) }" --burn-cap 1
expect_ok   "P3 makes P1 an operator" transfer 0 from $P3 to tezinvaders --entrypoint update_operators --arg "{ Left (Pair \"$p3_addr\" (Pair \"$p1_addr\" 0)) }" --burn-cap 1
expect_ok   "P1 moves P3's badge to P2" transfer 0 from $P1 to tezinvaders --entrypoint transfer --arg "$(tx "$p3_addr" "$p2_addr" 0 1)" --burn-cap 1
expect_bal  "P2 holds it again" "$p2_addr" 0 1
expect_ok   "P3 removes the operator" transfer 0 from $P3 to tezinvaders --entrypoint update_operators --arg "{ Right (Pair \"$p3_addr\" (Pair \"$p1_addr\" 0)) }" --burn-cap 1
expect_fail "P1 is no longer an operator" FA2_NOT_OPERATOR transfer 0 from $P1 to tezinvaders --entrypoint transfer --arg "$(tx "$p3_addr" "$p2_addr" 0 1)" --burn-cap 1

echo "end_round"
expect_fail "non-admin cannot end a running round" ROUND_RUNNING transfer 0 from $P1 to tezinvaders --entrypoint end_round --burn-cap 1
expect_fail "non-admin cannot set fee"   NOT_ADMIN transfer 0 from $P1 to tezinvaders --entrypoint set_entry_fee --arg 5 --burn-cap 1
before=$(balance $P1)
expect_ok "admin ends round" transfer 0 from $ADMIN to tezinvaders --entrypoint end_round --burn-cap 1
after=$(balance $P1)
awk -v a="$after" -v b="$before" 'BEGIN{exit !(a-b > 1.99 && a-b < 2.01)}' \
  && ok "P1 received the 2 tez pool ($before -> $after)" || bad "P1 payout" "before=$before after=$after"
s=$(storage)
echo "$s" | grep -q "Elt 1 (Pair \"$p1_addr\" 12000)" && ok "champions[1] = P1 / 12000" || bad "champions" "$s"
echo "$s" | grep -q "Pair \"$admin_addr\" 1000000 2 0 \"[0-9T:Z-]*\" $WEEK {}" && ok "round 2, pool 0, leaderboard cleared, new deadline" || bad "reset" "$s"

echo "round 2: badges are once per player"
expect_ok  "P2 buys a ticket again" transfer 1 from $P2 to tezinvaders --entrypoint play --burn-cap 1
expect_ok  "P2 scores 1500 (below its all-time 5000)" transfer 0 from $P2 to tezinvaders --entrypoint submit_score --arg 1500 --burn-cap 1
expect_bal "P2 still holds one dollar badge" "$p2_addr" 0 1
expect_ok  "P2 scores 8000 (new all-time best)" transfer 0 from $P2 to tezinvaders --entrypoint submit_score --arg 8000 --burn-cap 1
expect_bal "P2 earned the yen badge" "$p2_addr" 3 1
expect_bal "P2 did not get a second euro badge" "$p2_addr" 1 1

echo "round housekeeping"
expect_ok   "admin sets fee to 0.25 tez" transfer 0 from $ADMIN to tezinvaders --entrypoint set_entry_fee --arg 250000 --burn-cap 1
expect_fail "non-admin cannot set round length" NOT_ADMIN transfer 0 from $P1 to tezinvaders --entrypoint set_round_length --arg 3600 --burn-cap 1
expect_fail "round length must be positive" BAD_LENGTH transfer 0 from $ADMIN to tezinvaders --entrypoint set_round_length --arg 0 --burn-cap 1
expect_ok   "admin sets round length to 1 hour" transfer 0 from $ADMIN to tezinvaders --entrypoint set_round_length --arg 3600 --burn-cap 1
s=$(storage); echo "$s" | grep -q "250000 2 1000000 \"1970-01-01T01:00:01Z\" 3600" && ok "deadline moved to now + 1h, pool kept" || bad "set_round_length" "$s"
expect_ok   "admin can still end the round early" transfer 0 from $ADMIN to tezinvaders --entrypoint end_round --burn-cap 1
s=$(storage); echo "$s" | grep -q "250000 3 0" && ok "round 3 with new fee" || bad "round 3" "$s"

echo "set_token_metadata"
info=$(node "$HERE/storage.ts" --token-info 0 --image-base https://example.org/badges/)
expect_fail "non-admin cannot change token metadata" NOT_ADMIN transfer 0 from $P1 to tezinvaders --entrypoint set_token_metadata --arg "Pair 0 $info" --burn-cap 1
expect_ok   "admin repoints badge 0" transfer 0 from $ADMIN to tezinvaders --entrypoint set_token_metadata --arg "Pair 0 $info" --burn-cap 1
h=$(tc hash data 0 of type nat | awk '/^Script-expression-ID-Hash/{print $2}')
tm=$(tc get element "$h" of big map "$(bigmap_id 4)" | tr -d ' \n')
echo "$tm" | grep -q "$(printf 'https://example.org/badges/dollar.svg' | xxd -p | tr -d '\n')" && ok "token 0 metadata now names example.org" || bad "token metadata" "$tm"
expect_ok   "P2 can still transfer badge 0" transfer 0 from $P2 to tezinvaders --entrypoint transfer --arg "$(tx "$p2_addr" "$p3_addr" 0 1)" --burn-cap 1

echo "a round whose deadline has passed"
init=$(node "$HERE/storage.ts" --admin "$admin_addr" --fee 1000000 --round-length $WEEK --round-ends 0)
expect_ok   "origination" originate contract closed transferring 0 from $ADMIN running "$CONTRACT" --init "$init" --burn-cap 20 --force
expect_fail "no scores after the deadline" ROUND_OVER transfer 0 from $P1 to closed --entrypoint submit_score --arg 10 --burn-cap 1
expect_ok   "anyone can end it" transfer 0 from $P3 to closed --entrypoint end_round --burn-cap 1
s=$(storage closed); echo "$s" | grep -q " 2 0 \"1970-01-08T00:00:01Z\" $WEEK " && ok "round 2 runs for a week from now" || bad "closed reset" "$s"
expect_ok   "tickets sell again" transfer 1 from $P1 to closed --entrypoint play --burn-cap 1

echo "lazy settlement: a ticket bought after the deadline pays out the old round"
# Round 1 already over at origination, with P2 on the board and 1 tez in the pool (funded by the origination).
init=$(node "$HERE/storage.ts" --admin "$admin_addr" --fee 1000000 --round-length $WEEK --round-ends 0 | sed "s/ 1 0 0 $WEEK {} {} / 1 1000000 0 $WEEK { Elt \"$p2_addr\" 700 } {} /")
expect_ok   "origination with a finished round" originate contract stale transferring 1 from $ADMIN running "$CONTRACT" --init "$init" --burn-cap 20 --force
expect_fail "nobody can score into it" ROUND_OVER transfer 0 from $P2 to stale --entrypoint submit_score --arg 900 --burn-cap 1
before=$(balance $P2)
expect_ok   "P1 buys a ticket" transfer 1 from $P1 to stale --entrypoint play --burn-cap 1
after=$(balance $P2)
awk -v a="$after" -v b="$before" 'BEGIN{exit !(a-b > 0.99 && a-b < 1.01)}' \
  && ok "P2 was paid the 1 tez pool by P1's ticket ($before -> $after)" || bad "lazy payout" "before=$before after=$after"
s=$(storage stale)
echo "$s" | grep -q "Elt 1 (Pair \"$p2_addr\" 700)" && ok "champions[1] = P2 / 700" || bad "stale champions" "$s"
echo "$s" | grep -q " 2 1000000 \"1970-01-08T00:00:01Z\" $WEEK { Elt \"$p1_addr\" 0 } " && ok "round 2 holds P1's ticket and fee, deadline a week out" || bad "stale reset" "$s"
expect_ok   "P1 scores in the new round" transfer 0 from $P1 to stale --entrypoint submit_score --arg 10 --burn-cap 1
expect_fail "the new round cannot be ended early by a player" ROUND_RUNNING transfer 0 from $P3 to stale --entrypoint end_round --burn-cap 1

echo
echo "$pass passed, $fail failed"
[ "${1:-}" = "--keep" ] || rm -rf "$BASE_DIR"
[ "$fail" -eq 0 ]
