// HTTP handling shared by the plain Node server and the Lambda handler: one endpoint,
// POST /attest with an AttestRequest JSON body, answering an Attestation or { error }.

import { ClaimError, attest, verifierPublicKey, type AttestRequest } from "./attest.ts";

export const MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface HttpResult { status: number; body: string }

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

/**
 * Signing keys: VERIFIER_SECRET_KEY by default, and VERIFIER_SECRET_KEY_<chainId> for a chain that needs
 * its own (Quantumnet rejects ed25519 keys in contracts, so its contract holds an ML-DSA-44 mdpk).
 */
export interface VerifierKeys { default: string; byChain: Record<string, string> }

export const keyFor = (keys: VerifierKeys, chainId: string): string => keys.byChain[chainId] ?? keys.default;

export async function handle(method: string, path: string, body: string, keys: VerifierKeys): Promise<HttpResult> {
  if (method === "OPTIONS") return { status: 204, body: "" };
  if (method === "GET" && (path === "/" || path === "/key")) {
    const verifiers: Record<string, string> = { default: await verifierPublicKey(keys.default) };
    for (const [chain, key] of Object.entries(keys.byChain)) verifiers[chain] = await verifierPublicKey(key);
    return { status: 200, body: JSON.stringify({ verifier: verifiers.default, verifiers }) };
  }
  if (method !== "POST" || path !== "/attest") return { status: 404, body: JSON.stringify({ error: "not found" }) };
  if (body.length > MAX_BODY_BYTES) return { status: 413, body: JSON.stringify({ error: "request too large" }) };
  let req: AttestRequest;
  try { req = JSON.parse(body) as AttestRequest; } catch { return { status: 400, body: JSON.stringify({ error: "bad JSON" }) }; }
  try {
    return { status: 200, body: JSON.stringify(await attest(keyFor(keys, req.chainId), req)) };
  } catch (e) {
    if (e instanceof ClaimError) return { status: 422, body: JSON.stringify({ error: e.message }) };
    console.error(e);
    return { status: 500, body: JSON.stringify({ error: "verifier error" }) };
  }
}

const SECRET_KEY = /^(edsk|mdsk)[1-9A-HJ-NP-Za-km-z]{50,6000}$/;

/** Keys from a JSON document `{ "default": "edsk…", "byChain": { "NetX…": "mdsk…" } }` (the Secrets Manager secret). */
export function keysFromJson(text: string): VerifierKeys {
  const doc = JSON.parse(text) as Partial<VerifierKeys>;
  if (typeof doc.default !== "string" || !SECRET_KEY.test(doc.default)) throw new Error("the secret needs a default edsk");
  const byChain: Record<string, string> = {};
  for (const [chain, key] of Object.entries(doc.byChain ?? {})) {
    if (/^Net[1-9A-HJ-NP-Za-km-z]{12}$/.test(chain) && typeof key === "string" && SECRET_KEY.test(key)) byChain[chain] = key;
  }
  return { default: doc.default, byChain };
}

export function keysFromEnv(env: NodeJS.ProcessEnv = process.env): VerifierKeys {
  const key = env.VERIFIER_SECRET_KEY;
  if (!key || !SECRET_KEY.test(key)) throw new Error("set VERIFIER_SECRET_KEY to the verifier secret key, edsk… (node verifier/keygen.ts makes one)");
  const byChain: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    const m = /^VERIFIER_SECRET_KEY_(Net[1-9A-HJ-NP-Za-km-z]{12})$/.exec(name);
    if (m && value && SECRET_KEY.test(value)) byChain[m[1]!] = value;
  }
  return { default: key, byChain };
}
