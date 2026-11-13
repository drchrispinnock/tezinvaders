import utils from "@tezos-x/octez.js-utils";
const { verifySignature } = utils;
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Sim, encodeLog, type Input } from "../src/game/sim";
import { ATTESTATION_TTL_S, attest, attestationBytes, checkClaim, signClaim, verifierPublicKey, type AttestRequest } from "./attest";
import { keyFor, keysFromEnv, keysFromJson } from "./http";

// A throwaway key made with verifier/keygen.ts.
const SK = "edsk3QoqBuvdamxouPhin7swCvkQNgq4jP5KZPbwWNnwdZpSpJiEbq";
const CHAIN = "NetXynUjJNZm7wi";
const KT = "KT1Ef9JmLVJNxbm8rezpAJ8cxX78V3yLFMSs";
const TZ = "tz1hr6Dvx4i686RFishFTWPeby949bjrV9KF";

function game(seed: number): { seed: number; log: string; score: number } {
  const sim = new Sim();
  sim.startGame(seed);
  for (let t = 0; t < 60_000 && sim.phase !== "gameover"; t++) {
    const phase = Math.floor(t / 90) % 4;
    sim.step({ left: phase === 1, right: phase === 3, fire: t % 7 === 0, start: false } satisfies Input);
  }
  return { seed, log: encodeLog(sim.log), score: sim.score };
}

describe("attestation", () => {
  it("packs the claim exactly as octez-client does", () => {
    // octez-client hash data 'Pair (Pair "NetXynUjJNZm7wi" "KT1Ef9…") (Pair (Pair "tz1hr6…" 1234) 1700000000)'
    //   of type 'pair (pair chain_id address) (pair (pair address nat) timestamp)'
    //   of type 'pair (pair chain_id address) (pair (pair address nat) (pair timestamp (pair nat nat)))', round 7 seed 4242
    expect(attestationBytes({ chainId: CHAIN, contract: KT, player: TZ, score: 1234, expires: 1700000000, round: 7, seed: 4242 })).toBe(
      "05070707070a00000004f3d485540a000000160142a4913cfbba67a4c6241096e53dd490bb58f8d800070707070a000000160000f39ab4de0f08de1fb69d51626677fefc6cd45c6400921307070080c49fd50c07070007009242");
  });

  it("signs with the verifier key so the public half verifies it", async () => {
    const claim = { chainId: CHAIN, contract: KT, player: TZ, score: 1234, expires: 1700000000, round: 1, seed: 1 };
    const sig = await signClaim(SK, claim);
    expect(sig.startsWith("edsig")).toBe(true);
    expect(verifySignature(attestationBytes(claim), await verifierPublicKey(SK), sig)).toBe(true);
    expect(verifySignature(attestationBytes({ ...claim, score: 1235 }), await verifierPublicKey(SK), sig)).toBe(false);
  });

  it("attests a real game and refuses a doctored one", async () => {
    const g = game(4242);
    const req: AttestRequest = { chainId: CHAIN, contract: KT, player: TZ, score: g.score, round: 3, seed: g.seed, log: g.log };
    expect(checkClaim(req)).toBeNull();
    const a = await attest(SK, req, 1_700_000_000_000);
    expect(a.expires).toBe(1_700_000_000 + ATTESTATION_TTL_S);
    expect(verifySignature(attestationBytes({ chainId: CHAIN, contract: KT, player: TZ, score: g.score, expires: a.expires, round: 3, seed: g.seed }), a.verifier, a.proof)).toBe(true);
    expect(verifySignature(attestationBytes({ chainId: CHAIN, contract: KT, player: TZ, score: g.score, expires: a.expires, round: 4, seed: g.seed }), a.verifier, a.proof)).toBe(false);
    expect(checkClaim({ ...req, round: 0 })).toBe("bad round");
    expect(checkClaim({ ...req, player: "KT1Ef9JmLVJNxbm8rezpAJ8cxX78V3yLFMSs" })).toBe("bad player address");
    expect(checkClaim({ ...req, score: g.score + 10 })).toMatch(/replay scored/);
    expect(checkClaim({ ...req, seed: g.seed + 1 })).not.toBeNull();
    expect(checkClaim({ ...req, log: g.log.replace(/,[^,]*$/, "") })).toMatch(/did not end|replay scored/);
    expect(checkClaim({ ...req, player: "tz1nope" })).toBe("bad player address");
    await expect(attest(SK, { ...req, score: 1 })).rejects.toThrow(/replay scored/);
  });
});

describe("post-quantum verifier key", () => {
  it("signs and verifies with an ML-DSA-44 key, as the Quantumnet contract requires", async () => {
    const pq = JSON.parse(readFileSync(new URL("./fixtures/mldsa-test-key.json", import.meta.url), "utf8")) as { secretKey: string; publicKey: string };
    const claim = { chainId: "NetXhb8apwTcVhJ", contract: KT, player: TZ, score: 777, expires: 1700000000, round: 2, seed: 9 };
    const sig = await signClaim(pq.secretKey, claim);
    expect(sig.startsWith("mdsig")).toBe(true);
    expect(await verifierPublicKey(pq.secretKey)).toBe(pq.publicKey);
    expect(verifySignature(attestationBytes(claim), pq.publicKey, sig)).toBe(true);
    expect(verifySignature(attestationBytes({ ...claim, score: 778 }), pq.publicKey, sig)).toBe(false);
  });

  it("picks the chain's own key when one is configured", () => {
    const keys = keysFromEnv({ VERIFIER_SECRET_KEY: SK, VERIFIER_SECRET_KEY_NetXhb8apwTcVhJ: SK, VERIFIER_SECRET_KEY_bogus: SK });
    expect(Object.keys(keys.byChain)).toEqual(["NetXhb8apwTcVhJ"]);
    expect(keyFor(keys, "NetXhb8apwTcVhJ")).toBe(SK);
    expect(keyFor(keys, "NetXsqzbfFenSTS")).toBe(SK);
    expect(() => keysFromEnv({})).toThrow(/VERIFIER_SECRET_KEY/);
  });
});

describe("keysFromJson", () => {
  it("reads the Secrets Manager document and ignores malformed entries", () => {
    const keys = keysFromJson(JSON.stringify({ default: SK, byChain: { NetXhb8apwTcVhJ: SK, nope: SK, NetXsqzbfFenSTS: "garbage" } }));
    expect(keys.default).toBe(SK);
    expect(Object.keys(keys.byChain)).toEqual(["NetXhb8apwTcVhJ"]);
    expect(() => keysFromJson("{}")).toThrow(/default edsk/);
  });
});

describe("post-quantum players", () => {
  it("accepts a tz5 player and packs it as octez-client does", () => {
    const tz5 = "tz5jcuNPWgD8b7sLNnYJnSQCy3uE5bbdGhWc";
    const g = game(99);
    expect(checkClaim({ chainId: "NetXhb8apwTcVhJ", contract: KT, player: tz5, score: g.score, round: 1, seed: g.seed, log: g.log })).toBeNull();
    // octez-client hash data … of type 'pair (pair chain_id address) (pair (pair address nat) timestamp)'
    expect(attestationBytes({ chainId: "NetXhb8apwTcVhJ", contract: "KT1SoXm3n9eds9eQXRFkTUTY8cq3UvkriYmo", player: tz5, score: 60, expires: 1700000000, round: 1, seed: 0 }).length).toBeGreaterThan(100);
  });
});

describe("one game per recording", () => {
  it("refuses a recording that restarts after game over, however many times it is asked", async () => {
    // A losing game, then a start press and a second game: before the fix the second game ran under a
    // random seed, so repeated requests eventually matched a lucky score.
    const g = game(4242);
    const log = `${g.log},0*20000,8*1,${g.log}`;
    const req: AttestRequest = { chainId: CHAIN, contract: KT, player: TZ, score: g.score, round: 1, seed: g.seed, log };
    for (let i = 0; i < 5; i++) expect(checkClaim(req)).toBe("input after the game ended");
    expect(checkClaim({ ...req, log: `${g.log},0*3` })).toBe("input after the game ended");
    expect(checkClaim({ ...req, log: g.log })).toBeNull();
  });
});

describe("eligibility before replay", () => {
  const nets = [{ chainId: CHAIN, contractAddress: KT, tzktApi: "https://tzkt.test" }];
  const fake = (status: number, body: unknown = null) => (async () => ({ status, ok: status < 300, json: async () => body })) as unknown as typeof fetch;
  it("refuses unknown contracts and ticketless players without replaying, and lets ticket holders through", async () => {
    const g = game(11);
    const req: AttestRequest = { chainId: CHAIN, contract: KT, player: TZ, score: g.score, round: 1, seed: g.seed, log: g.log };
    await expect(attest(SK, { ...req, contract: "KT1SoXm3n9eds9eQXRFkTUTY8cq3UvkriYmo" }, Date.now(), { networks: nets, fetchFn: fake(200, true) })).rejects.toThrow("unknown chain or contract");
    await expect(attest(SK, req, Date.now(), { networks: nets, fetchFn: fake(204) })).rejects.toThrow("no ticket");
    await expect(attest(SK, req, Date.now(), { networks: nets, fetchFn: fake(200, false) })).rejects.toThrow("no ticket");
    expect((await attest(SK, req, Date.now(), { networks: nets, fetchFn: fake(200, true) })).proof.startsWith("edsig")).toBe(true);
    // an indexer outage does not lock honest players out
    expect((await attest(SK, req, Date.now(), { networks: nets, fetchFn: fake(503) })).score).toBe(g.score);
  });
});
