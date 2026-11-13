// The score verifier: replays a recorded game (src/game/sim.ts is deterministic given its seed
// and per-tick inputs), checks the claimed score, and signs an attestation the contract checks
// in submit_score with CHECK_SIGNATURE:
//
//   PACK (pair (pair chain_id self_address) (pair (pair player score) (pair expires (pair round seed))))
//
// expires is a short deadline (ATTESTATION_TTL_S from now); round pins the attestation to the
// round the player named (the contract packs its own, so a stale one fails); seed is the seed the
// game was replayed with, and the contract only accepts the seed it prescribes for that player and
// round or Advent day (src/chain/seed.ts), so a recording is worthless under any other seed. The contract's verifier key is the public half of
// VERIFIER_SECRET_KEY (verifier/keygen.ts makes a pair; the admin sets it with set_verifier).

// The octez.js packages are CommonJS to Node, so they are default-imported and destructured.
import michelCodec, { type MichelsonData, type MichelsonType } from "@tezos-x/octez.js-michel-codec";
import signer from "@tezos-x/octez.js-signer";
const { packDataBytes } = michelCodec;
const { InMemorySigner } = signer;
import { decodeLog, replay } from "../src/game/sim.ts";

export const ATTESTATION_TTL_S = 15 * 60;
/** Longest game the verifier will replay: 300,000 ticks is about 83 minutes at 60 Hz. */
export const MAX_TICKS = 300_000;

export interface Claim {
  chainId: string;
  contract: string;
  player: string;
  score: number;
  /** Unix seconds. */
  expires: number;
  /** The round the score is for (the contract packs its own round number). */
  round: number;
  /** The seed the game was replayed with; the contract requires its prescribed one. */
  seed: number;
}

export interface AttestRequest {
  chainId: string;
  contract: string;
  player: string;
  score: number;
  round: number;
  seed: number;
  /** encodeLog() text of the game's inputs. */
  log: string;
}

export interface Attestation {
  proof: string;
  expires: number;
  score: number;
  /** The verifier's public key, so a client can compare it with the contract's. */
  verifier: string;
}

export class ClaimError extends Error {}

/** What the verifier knows about a chain: the one contract it attests for, and where to check tickets. */
export interface KnownNetwork { chainId: string; contractAddress: string; tzktApi: string }

/**
 * Cheap eligibility checks before the (expensive) replay: the claim must name a configured contract
 * for its chain, and the player must hold a ticket there (a key in the scores big map, via TzKT).
 * Keeps anonymous callers from spending the verifier's compute. Returns the reason to refuse, or null.
 */
export async function checkEligibility(req: AttestRequest, networks: readonly KnownNetwork[], fetchFn: typeof fetch): Promise<string | null> {
  const net = networks.find((n) => n.chainId === req.chainId && n.contractAddress && n.contractAddress === req.contract);
  if (!net) return "unknown chain or contract";
  try {
    const res = await fetchFn(`${net.tzktApi}/v1/contracts/${net.contractAddress}/bigmaps/scores/keys/${req.player}?select=active`);
    if (res.status === 204 || res.status === 404) return "no ticket";
    if (!res.ok) return null;                       // indexer trouble must not block honest players
    const active = await res.json();
    return active === false ? "no ticket" : null;
  } catch { return null; }
}

const ATTESTATION_TYPE: MichelsonType = {
  prim: "pair",
  args: [
    { prim: "pair", args: [{ prim: "chain_id" }, { prim: "address" }] },
    { prim: "pair", args: [{ prim: "pair", args: [{ prim: "address" }, { prim: "nat" }] }, { prim: "pair", args: [{ prim: "timestamp" }, { prim: "pair", args: [{ prim: "nat" }, { prim: "nat" }] }] }] },
  ],
};

// tz5 is the post-quantum (ML-DSA) account kind, the norm on Quantumnet.
// Implicit accounts only, as the contract requires of ticket holders (a contract could refuse the payout).
const ADDRESS = /^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$/;
const CHAIN_ID = /^Net[1-9A-HJ-NP-Za-km-z]{12}$/;

/** The bytes the contract PACKs for this claim, as hex without 0x. */
export function attestationBytes(c: Claim): string {
  const data: MichelsonData = {
    prim: "Pair",
    args: [
      { prim: "Pair", args: [{ string: c.chainId }, { string: c.contract }] },
      { prim: "Pair", args: [{ prim: "Pair", args: [{ string: c.player }, { int: String(c.score) }] }, { prim: "Pair", args: [{ int: String(c.expires) }, { prim: "Pair", args: [{ int: String(c.round) }, { int: String(c.seed) }] }] }] },
    ],
  };
  return packDataBytes(data, ATTESTATION_TYPE).bytes;
}

/** Sign a claim with the verifier's edsk; returns the edsig the contract expects. */
export async function signClaim(secretKey: string, c: Claim): Promise<string> {
  const signer = new InMemorySigner(secretKey);
  return (await signer.sign(attestationBytes(c))).prefixSig;
}

export const verifierPublicKey = (secretKey: string): Promise<string> => new InMemorySigner(secretKey).publicKey();

/** Replays the game and returns the reason the claim is wrong, or null when it holds. */
export function checkClaim(req: AttestRequest): string | null {
  if (!CHAIN_ID.test(req.chainId)) return "bad chain id";
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(req.contract)) return "bad contract address";
  if (!ADDRESS.test(req.player)) return "bad player address";
  if (!Number.isInteger(req.score) || req.score < 0) return "bad score";
  if (!Number.isInteger(req.round) || req.round < 1) return "bad round";
  if (!Number.isInteger(req.seed) || req.seed < 0 || req.seed > 0xffffffff) return "bad seed";
  if (typeof req.log !== "string") return "bad input log";
  let log: number[];
  try { log = decodeLog(req.log, MAX_TICKS); } catch (e) { return (e as Error).message; }
  // Exactly one game: it must end on the last input, under the seed that is signed. replay() stops
  // stepping at game over, so a restart smuggled into the log can neither run nor change the seed.
  const { sim, consumed } = replay(req.seed, log);
  if (sim.phase !== "gameover") return "the game did not end";
  if (consumed !== log.length) return "input after the game ended";
  if (sim.seed !== req.seed) return "the game changed seed";
  if (sim.score !== req.score) return `the replay scored ${sim.score}, not ${req.score}`;
  return null;
}

/** Verify the request and sign it. Throws ClaimError when the claim does not hold. */
export async function attest(secretKey: string, req: AttestRequest, now = Date.now(), eligibility?: { networks: readonly KnownNetwork[]; fetchFn: typeof fetch }): Promise<Attestation> {
  // Cheap format checks first, then the eligibility lookups, then the replay.
  if (!CHAIN_ID.test(req.chainId) || !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(req.contract) || !ADDRESS.test(req.player)) throw new ClaimError("bad chain, contract or player");
  if (eligibility) {
    const refusal = await checkEligibility(req, eligibility.networks, eligibility.fetchFn);
    if (refusal) throw new ClaimError(refusal);
  }
  const reason = checkClaim(req);
  if (reason) throw new ClaimError(reason);
  const expires = Math.floor(now / 1000) + ATTESTATION_TTL_S;
  const claim: Claim = { chainId: req.chainId, contract: req.contract, player: req.player, score: req.score, expires, round: req.round, seed: req.seed };
  return { proof: await signClaim(secretKey, claim), expires, score: req.score, verifier: await verifierPublicKey(secretKey) };
}
