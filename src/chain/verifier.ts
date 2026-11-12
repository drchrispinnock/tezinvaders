// Client for the score verifier (verifier/): it replays the recorded game and signs an
// attestation that the contract's submit_score checks. One verifier serves every network; the
// attestation names the chain and contract.

import { config } from "./config";

export interface Attestation {
  proof: string;
  /** Unix seconds; the contract refuses the proof after this. */
  expires: number;
  score: number;
  verifier: string;
}

export interface GameRecord { seed: number; log: string }

/** `round` is the round the score is for; the contract packs its own round number, so a mismatch is refused. */
export async function requestAttestation(player: string, score: number, game: GameRecord, round: number, fetchFn: typeof fetch = fetch): Promise<Attestation> {
  if (!config.verifierUrl) throw new Error("no score verifier configured");
  const res = await fetchFn(`${config.verifierUrl}/attest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chainId: config.chainId, contract: config.contractAddress, player, score, round, seed: game.seed, log: game.log }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<Attestation> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `verifier answered ${res.status}`);
  if (typeof body.proof !== "string" || typeof body.expires !== "number") throw new Error("bad verifier answer");
  return body as Attestation;
}
