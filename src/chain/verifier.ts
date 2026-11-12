// Client for the score verifier (verifier/): it replays the recorded game and signs an
// attestation that the contract's submit_score and claim_advent check. One verifier serves every
// network; the attestation names the chain, the contract, the round and the game's seed.

import { config } from "./config";

export interface Attestation {
  proof: string;
  /** Unix seconds; the contract refuses the proof after this. */
  expires: number;
  score: number;
  verifier: string;
}

export interface GameRecord { seed: number; log: string }

/** A refusal or failure of the verifier, with a message that is safe to show (see verifierReason). */
export class VerifierError extends Error {}

/** The verifier's refusal as a fixed label: its reasons are a small closed set, and nothing it says is shown verbatim. */
export function verifierReason(error: string | undefined, status: number): string {
  const e = error ?? "";
  if (/replay scored/.test(e)) return "the verifier replayed the game and got a different score";
  if (/did not end/.test(e)) return "the verifier could not replay the game to its end";
  if (/bad (chain|contract|player|score|round|seed)/.test(e)) return "the verifier rejected the request";
  if (/input log/.test(e)) return "the verifier could not read the game recording";
  if (status === 413) return "the game recording is too large";
  return `the verifier answered ${status}`;
}

/** `round` is the round the score is for; the contract packs its own round number, so a mismatch is refused. */
export async function requestAttestation(player: string, score: number, game: GameRecord, round: number, fetchFn: typeof fetch = fetch): Promise<Attestation> {
  if (!config.verifierUrl) throw new Error("no score verifier configured");
  const res = await fetchFn(`${config.verifierUrl}/attest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chainId: config.chainId, contract: config.contractAddress, player, score, round, seed: game.seed, log: game.log }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<Attestation> & { error?: string };
  if (!res.ok) throw new VerifierError(verifierReason(body.error, res.status));
  if (typeof body.proof !== "string" || typeof body.expires !== "number") throw new Error("bad verifier answer");
  return body as Attestation;
}
