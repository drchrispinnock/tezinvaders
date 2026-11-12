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
# Bash pattern matches rather than `grep -q`: with pipefail, grep closing early on a big output makes echo fail.
expect_ok()   { out="$(tc "${@:2}")"; if [[ "$out" == *successfully* || "$out" == *"Well typed"* ]]; then ok "$1"; else bad "$1" "$out"; fi; }
expect_fail() { out="$(tc "${@:3}")"; if [[ "$out" == *"$2"* ]]; then ok "$1 (rejected: $2)"; else bad "$1" "$out"; fi; }
storage()     { tc get contract storage for "${1:-tezinvaders}" | tr -s ' \n' ' '; }
balance()     { tc get balance for "$1" | awk '{print $1}'; }
# Big map ids are the last seven numbers of the storage: scores, best, games, ledger, operators, token_metadata, metadata.
# The scores id follows the leader (None / Some …); the champions map in between may span several words.
bigmap_id()   { if [ "$1" = 1 ]; then storage "${2:-tezinvaders}" | sed -E 's/\(Some \(Pair "[^"]*" [0-9]+\)\)/None/' | awk '{for(i=1;i<=NF;i++) if($i=="None"){print $(i+1); exit}}';
                else storage "${2:-tezinvaders}" | awk -v n="$1" '{print $(NF-7+n)}'; fi; }
# This round's score of $1; empty when they hold no ticket.
score_of()    { local h; h=$(tc hash data "\"$1\"" of type address | awk '/^Script-expression-ID-Hash/{print $2}');
                tc get element "$h" of big map "$(bigmap_id 1 "${2:-tezinvaders}")" | grep -o '^[0-9][0-9]*'; }
kt()          { tc show known contract "${1:-tezinvaders}"; }
# The verifier's attestation for (player address, score, expires, seed) on a contract, for the round the contract is
# in (ROUND_OFFSET shifts it, to test a stale proof), made by the real signing code.
round_of()    { storage "${1:-tezinvaders}" | awk '{print $4}'; }
SEED=0; ROUND_OFFSET=0
proof()       { node "$HERE/../../verifier/sign.ts" --key "$VERIFIER_SECRET_KEY" --chain "$CHAIN" --contract "$(kt "${4:-tezinvaders}")" --player "$1" --score "$2" --expires "${3:-$FAR}" --round "$(( $(round_of "${4:-tezinvaders}") + ROUND_OFFSET ))" --seed "${5:-$SEED}"; }
# submit_ok / submit_fail "desc" [ERR] <alias> <address> <score> [contract] [expires]: a properly attested submit_score.
submit_ok()   { SEED=$((SEED+1)); expect_ok "$1" transfer 0 from "$2" to "${5:-tezinvaders}" --entrypoint submit_score --arg "Pair (Pair $4 ${6:-$FAR}) (Pair $SEED \"$(proof "$3" "$4" "${6:-$FAR}" "${5:-tezinvaders}")\")" --burn-cap 1; }
claim_ok()    { SEED=$((SEED+1)); expect_ok "$1" transfer 0 from "$2" to "${5:-tezinvaders}" --entrypoint claim_advent --arg "Pair (Pair $4 $FAR) (Pair $SEED \"$(proof "$3" "$4" "$FAR" "${5:-tezinvaders}")\")" --burn-cap 1; }
claim_fail()  { SEED=$((SEED+1)); expect_fail "$1" "$2" transfer 0 from "$3" to "${6:-tezinvaders}" --entrypoint claim_advent --arg "Pair (Pair $5 $FAR) (Pair $SEED \"$(proof "$4" "$5" "$FAR" "${6:-tezinvaders}")\")" --burn-cap 1; }
submit_fail() { SEED=$((SEED+1)); expect_fail "$1" "$2" transfer 0 from "$3" to "${6:-tezinvaders}" --entrypoint submit_score --arg "Pair (Pair $5 ${7:-$FAR}) (Pair $SEED \"$(proof "$4" "$5" "${7:-$FAR}" "${6:-tezinvaders}")\")" --burn-cap 1; }
# Balance of ($1 token $2) in the ledger; prints 0 when the key is absent.
ledger()      { local h; h=$(tc hash data "Pair \"$1\" $2" of type 'pair address nat' | awk '/^Script-expression-ID-Hash/{print $2}');
                tc get element "$h" of big map "$(bigmap_id 4 "${3:-tezinvaders}")" | grep -o '^[0-9][0-9]*' || echo 0; }
expect_bal()  { b=$(ledger "$2" "$3"); [ "$b" = "$4" ] && ok "$1 (balance $b)" || bad "$1" "expected $4, got '$b'"; }

ADMIN=bootstrap1; P1=bootstrap2; P2=bootstrap3; P3=bootstrap4
admin_addr=$(tc show address $ADMIN | awk '/Hash/{print $2}')
p1_addr=$(tc show address $P1 | awk '/Hash/{print $2}')
p2_addr=$(tc show address $P2 | awk '/Hash/{print $2}')
p3_addr=$(tc show address $P3 | awk '/Hash/{print $2}')
FAR=4102444800   # 2100-01-01: the mockup clock sits at the epoch, so this round never ends by itself
WEEK=604800
CHAIN=$(tc rpc get /chains/main/chain_id | tr -d '"')
eval "$(node "$HERE/../../verifier/keygen.ts" --env)"   # VERIFIER_SECRET_KEY, VERIFIER_PUBLIC_KEY
VPK=$VERIFIER_PUBLIC_KEY

echo "typecheck"
expect_ok "contract typechecks" typecheck script "$CONTRACT"

echo "originate (fee 1 tez, round 1, deadline far away)"
init=$(node "$HERE/storage.ts" --admin "$admin_addr" --verifier "$VPK" --fee 1000000 --round-length $WEEK --round-ends $FAR --advent-start 0 --advent-token 100)
expect_ok "origination" originate contract tezinvaders transferring 0 from $ADMIN \
  running "$CONTRACT" --init "$init" --burn-cap 20 --force

echo "play"
expect_fail "wrong fee" BAD_FEE transfer 0.5 from $P1 to tezinvaders --entrypoint play --burn-cap 1
expect_ok   "P1 buys ticket" transfer 1 from $P1 to tezinvaders --entrypoint play --burn-cap 1
expect_ok   "P2 buys ticket" transfer 1 from $P2 to tezinvaders --entrypoint play --burn-cap 1
s=$(storage); echo "$s" | grep -q '2000000' && ok "pool is 2 tez" || bad "pool is 2 tez" "$s"
expect_ok   "proxy contract originates" originate contract proxy transferring 0 from $ADMIN running "$HERE/proxy.tz" --init "\"$(kt)\"" --burn-cap 1 --force
expect_fail "a contract cannot buy a ticket" IMPLICIT_ONLY transfer 1 from $P3 to proxy --burn-cap 1

echo "submit_score"
submit_fail "no ticket"    NO_TICKET       $P3 "$p3_addr" 999
expect_fail "tez attached" NO_TEZ_ACCEPTED transfer 1 from $P1 to tezinvaders --entrypoint submit_score --arg "Pair (Pair 10 $FAR) (Pair 900 \"$(proof "$p1_addr" 10 $FAR tezinvaders 900)\")" --burn-cap 1
expect_fail "made-up score, proof for another" BAD_PROOF transfer 0 from $P1 to tezinvaders --entrypoint submit_score --arg "Pair (Pair 99999 $FAR) (Pair 901 \"$(proof "$p1_addr" 500 $FAR tezinvaders 901)\")" --burn-cap 1
expect_fail "someone else's proof" BAD_PROOF transfer 0 from $P1 to tezinvaders --entrypoint submit_score --arg "Pair (Pair 500 $FAR) (Pair 902 \"$(proof "$p2_addr" 500 $FAR tezinvaders 902)\")" --burn-cap 1
submit_fail "expired proof" PROOF_EXPIRED $P1 "$p1_addr" 500 tezinvaders 0
submit_ok   "P1 scores 500"  $P1 "$p1_addr" 500
s=$(storage); echo "$s" | grep -q "(Some (Pair \"$p1_addr\" 500))" && ok "P1 leads" || bad "leader" "$s"
expect_fail "the same game cannot be attested twice" GAME_USED transfer 0 from $P1 to tezinvaders --entrypoint submit_score --arg "Pair (Pair 500 $FAR) (Pair $SEED \"$(proof "$p1_addr" 500 $FAR tezinvaders $SEED)\")" --burn-cap 1
ROUND_OFFSET=1; submit_fail "a proof for another round is refused" BAD_PROOF $P1 "$p1_addr" 600; ROUND_OFFSET=0
submit_ok   "P2 scores 1200" $P2 "$p2_addr" 1200
submit_ok   "P1 scores 300 (ignored, lower)" $P1 "$p1_addr" 300
[ "$(score_of "$p1_addr")" = 500 ] && ok "P1's score stays 500" || bad "score_of P1" "$(score_of "$p1_addr")"

echo "badges"
expect_bal "P1 (500) has no dollar badge" "$p1_addr" 0 0
submit_ok  "P1 ties at 1200" $P1 "$p1_addr" 1200
s=$(storage); echo "$s" | grep -q "(Some (Pair \"$p2_addr\" 1200))" && ok "P2 keeps the lead on a tie" || bad "tie" "$s"
expect_bal "P2 (1200) earned the dollar badge" "$p2_addr" 0 1
expect_bal "P2 has no euro badge yet" "$p2_addr" 1 0
submit_ok  "P2 scores 5000" $P2 "$p2_addr" 5000
expect_bal "P2 still has one dollar badge" "$p2_addr" 0 1
expect_bal "P2 earned the euro badge"  "$p2_addr" 1 1
expect_bal "P2 earned the pound badge" "$p2_addr" 2 1
expect_bal "P2 has no yen badge"       "$p2_addr" 3 0
submit_ok  "P1 scores 12000" $P1 "$p1_addr" 12000
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

echo "advent calendar (start at the epoch: the mockup clock makes today door 1)"
claim_fail "no ticket, no door" NO_TICKET $P3 "$p3_addr" 600
claim_fail "500 is not over 500" ADVENT_SCORE $P1 "$p1_addr" 500
claim_ok   "P1 opens door 1 with 600" $P1 "$p1_addr" 600
expect_bal "P1 holds door 1 (token 100)" "$p1_addr" 100 1
claim_fail "P1 cannot open door 1 twice" ADVENT_CLAIMED $P1 "$p1_addr" 700
claim_ok   "P2 opens door 1 too" $P2 "$p2_addr" 650
expect_bal "P2 holds door 1" "$p2_addr" 100 1
expect_fail "non-admin cannot move the calendar" NOT_ADMIN transfer 0 from $P1 to tezinvaders --entrypoint set_advent --arg "Pair 0 100" --burn-cap 1
expect_ok   "admin moves the calendar so today is door 25" transfer 0 from $ADMIN to tezinvaders --entrypoint set_advent --arg "Pair $((1 - 24 * 86400)) 100" --burn-cap 1
claim_ok   "P1 opens door 25" $P1 "$p1_addr" 900
expect_bal "P1 holds door 25 (token 124)" "$p1_addr" 124 1
expect_ok   "admin moves the calendar so it ended yesterday" transfer 0 from $ADMIN to tezinvaders --entrypoint set_advent --arg "Pair $((1 - 25 * 86400)) 100" --burn-cap 1
claim_fail "no door after the 25th" ADVENT_CLOSED $P1 "$p1_addr" 900
expect_ok   "admin moves the calendar into the future" transfer 0 from $ADMIN to tezinvaders --entrypoint set_advent --arg "Pair 86400 100" --burn-cap 1
claim_fail "no door before 1 December" ADVENT_CLOSED $P1 "$p1_addr" 900
expect_ok   "P1 gives door 1 to P3" transfer 0 from $P1 to tezinvaders --entrypoint transfer --arg "$(tx "$p1_addr" "$p3_addr" 100 1)" --burn-cap 1
expect_bal "P3 holds door 1" "$p3_addr" 100 1

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
echo "$s" | grep -q "Pair \"$admin_addr\" 1000000 2 0 \"[0-9T:Z-]*\" $WEEK (Pair \"[0-9T:Z-]*\" 100) \"$VPK\" None [0-9]* { Elt 1" && ok "round 2, pool 0, leaderboard cleared, new deadline" || bad "reset" "$s"

echo "round 2: badges are once per player"
expect_ok  "P2 buys a ticket again" transfer 1 from $P2 to tezinvaders --entrypoint play --burn-cap 1
submit_ok  "P2 scores 1500 (below its all-time 5000)" $P2 "$p2_addr" 1500
expect_bal "P2 still holds one dollar badge" "$p2_addr" 0 1
submit_ok  "P2 scores 8000 (new all-time best)" $P2 "$p2_addr" 8000
expect_bal "P2 earned the yen badge" "$p2_addr" 3 1
expect_bal "P2 did not get a second euro badge" "$p2_addr" 1 1

echo "round housekeeping"
expect_ok   "admin sets fee to 0.25 tez" transfer 0 from $ADMIN to tezinvaders --entrypoint set_entry_fee --arg 250000 --burn-cap 1
expect_fail "non-admin cannot set round length" NOT_ADMIN transfer 0 from $P1 to tezinvaders --entrypoint set_round_length --arg 3600 --burn-cap 1
expect_fail "round length must be positive" BAD_LENGTH transfer 0 from $ADMIN to tezinvaders --entrypoint set_round_length --arg 0 --burn-cap 1
expect_ok   "admin sets round length to 1 hour" transfer 0 from $ADMIN to tezinvaders --entrypoint set_round_length --arg 3600 --burn-cap 1
s=$(storage); echo "$s" | grep -q "250000 2 1000000 \"1970-01-01T01:00:01Z\" 3600" && ok "deadline moved to now + 1h, pool kept" || bad "set_round_length" "$s"
expect_fail "non-admin cannot rotate the verifier" NOT_ADMIN transfer 0 from $P1 to tezinvaders --entrypoint set_verifier --arg "\"$VPK\"" --burn-cap 1
OLD_SK=$VERIFIER_SECRET_KEY; OLD_PK=$VPK
eval "$(node "$HERE/../../verifier/keygen.ts" --env)"; VPK=$VERIFIER_PUBLIC_KEY; NEW_SK=$VERIFIER_SECRET_KEY
expect_fail "old key's proof is refused before rotation" BAD_PROOF transfer 0 from $P2 to tezinvaders --entrypoint submit_score --arg "Pair (Pair 8100 $FAR) (Pair 904 \"$(proof "$p2_addr" 8100 $FAR tezinvaders 904)\")" --burn-cap 1
expect_ok   "admin rotates the verifier" transfer 0 from $ADMIN to tezinvaders --entrypoint set_verifier --arg "\"$VPK\"" --burn-cap 1
submit_ok   "new key's proof works" $P2 "$p2_addr" 8100
VERIFIER_SECRET_KEY=$OLD_SK
expect_fail "old key's proof no longer works" BAD_PROOF transfer 0 from $P2 to tezinvaders --entrypoint submit_score --arg "Pair (Pair 8200 $FAR) (Pair 905 \"$(proof "$p2_addr" 8200 $FAR tezinvaders 905)\")" --burn-cap 1
VERIFIER_SECRET_KEY=$NEW_SK
expect_ok   "admin can still end the round early" transfer 0 from $ADMIN to tezinvaders --entrypoint end_round --burn-cap 1
s=$(storage); echo "$s" | grep -q "250000 3 0" && ok "round 3 with new fee" || bad "round 3" "$s"

echo "set_token_metadata"
info=$(node "$HERE/storage.ts" --token-info 0 --image-base https://example.org/badges/)
expect_fail "non-admin cannot change token metadata" NOT_ADMIN transfer 0 from $P1 to tezinvaders --entrypoint set_token_metadata --arg "Pair 0 $info" --burn-cap 1
expect_ok   "admin repoints badge 0" transfer 0 from $ADMIN to tezinvaders --entrypoint set_token_metadata --arg "Pair 0 $info" --burn-cap 1
h=$(tc hash data 0 of type nat | awk '/^Script-expression-ID-Hash/{print $2}')
tm=$(tc get element "$h" of big map "$(bigmap_id 6)" | tr -d ' \n')
echo "$tm" | grep -q "$(printf 'https://example.org/badges/dollar.svg' | xxd -p | tr -d '\n')" && ok "token 0 metadata now names example.org" || bad "token metadata" "$tm"
expect_ok   "P2 can still transfer badge 0" transfer 0 from $P2 to tezinvaders --entrypoint transfer --arg "$(tx "$p2_addr" "$p3_addr" 0 1)" --burn-cap 1

echo "a round whose deadline has passed"
init=$(node "$HERE/storage.ts" --admin "$admin_addr" --fee 1000000 --verifier "$VPK" --round-length $WEEK --round-ends 0 --advent-start 0 --advent-token 100)
expect_ok   "origination" originate contract closed transferring 0 from $ADMIN running "$CONTRACT" --init "$init" --burn-cap 20 --force
submit_fail "no scores after the deadline" ROUND_OVER $P1 "$p1_addr" 10 closed
expect_ok   "anyone can end it" transfer 0 from $P3 to closed --entrypoint end_round --burn-cap 1
s=$(storage closed); echo "$s" | grep -q " 2 0 \"1970-01-08T00:00:01Z\" $WEEK " && ok "round 2 runs for a week from now" || bad "closed reset" "$s"
expect_ok   "tickets sell again" transfer 1 from $P1 to closed --entrypoint play --burn-cap 1

echo "lazy settlement: a ticket bought after the deadline pays out the old round"
# Round 1 already over at origination, with P2 on the board and 1 tez in the pool (funded by the origination).
init=$(node "$HERE/storage.ts" --admin "$admin_addr" --fee 1000000 --verifier "$VPK" --round-length $WEEK --round-ends 0 --advent-start 0 --advent-token 100 | sed "s/ 1 0 0 $WEEK (Pair 0 100) \"$VPK\" None {} {} / 1 1000000 0 $WEEK (Pair 0 100) \"$VPK\" (Some (Pair \"$p2_addr\" 700)) { Elt \"$p2_addr\" 700 } {} /")
expect_ok   "origination with a finished round" originate contract stale transferring 1 from $ADMIN running "$CONTRACT" --init "$init" --burn-cap 20 --force
submit_fail "nobody can score into it" ROUND_OVER $P2 "$p2_addr" 900 stale
before=$(balance $P2)
expect_ok   "P1 buys a ticket" transfer 1 from $P1 to stale --entrypoint play --burn-cap 1
after=$(balance $P2)
awk -v a="$after" -v b="$before" 'BEGIN{exit !(a-b > 0.99 && a-b < 1.01)}' \
  && ok "P2 was paid the 1 tez pool by P1's ticket ($before -> $after)" || bad "lazy payout" "before=$before after=$after"
s=$(storage stale)
echo "$s" | grep -q "Elt 1 (Pair \"$p2_addr\" 700)" && ok "champions[1] = P2 / 700" || bad "stale champions" "$s"
echo "$s" | grep -q " 2 1000000 \"1970-01-08T00:00:01Z\" $WEEK (Pair \"1970-01-01T00:00:00Z\" 100) \"$VPK\" (Some (Pair \"$p1_addr\" 0)) " && [ "$(score_of "$p1_addr" stale)" = 0 ] && ok "round 2 holds P1's ticket and fee, P1 leads at 0, deadline a week out" || bad "stale reset" "$s"
submit_ok   "P1 scores in the new round" $P1 "$p1_addr" 10 stale
expect_fail "a proof for another contract" BAD_PROOF transfer 0 from $P1 to stale --entrypoint submit_score --arg "Pair (Pair 20 $FAR) (Pair 903 \"$(proof "$p1_addr" 20 $FAR tezinvaders 903)\")" --burn-cap 1
expect_fail "the new round cannot be ended early by a player" ROUND_RUNNING transfer 0 from $P3 to stale --entrypoint end_round --burn-cap 1

echo
echo "$pass passed, $fail failed"
[ "${1:-}" = "--keep" ] || rm -rf "$BASE_DIR"
[ "$fail" -eq 0 ]
