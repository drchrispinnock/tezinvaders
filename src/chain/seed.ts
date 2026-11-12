// The seed the chain prescribes for a game, so a recording cannot be re-attested under another
// seed or banked for a later round. It mirrors the contract's seed_for:
//   NAT (first 4 bytes of BLAKE2B (PACK (Pair (Pair contract player) (Pair n tag))))
// with tag 0 for a round (n = round number) and tag 1 for an Advent day (n = 0-based day).
// Works in the browser and in Node (the michel-codec package is CommonJS to Node).

import { blake2b } from "@noble/hashes/blake2.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import * as michelCodec from "@tezos-x/octez.js-michel-codec";

const codec = (michelCodec as unknown as { default?: typeof michelCodec }).default ?? michelCodec;

export const SEED_TAG_ROUND = 0;
export const SEED_TAG_DAY = 1;

export function seedFor(contract: string, player: string, n: number, tag: number): number {
  const packed = codec.packDataBytes(
    { prim: "Pair", args: [{ prim: "Pair", args: [{ string: contract }, { string: player }] }, { prim: "Pair", args: [{ int: String(n) }, { int: String(tag) }] }] },
    { prim: "pair", args: [{ prim: "pair", args: [{ prim: "address" }, { prim: "address" }] }, { prim: "pair", args: [{ prim: "nat" }, { prim: "nat" }] }] },
  ).bytes;
  const hash = blake2b(hexToBytes(packed), { dkLen: 32 });
  return ((hash[0]! << 24) >>> 0) + (hash[1]! << 16) + (hash[2]! << 8) + hash[3]!;
}
