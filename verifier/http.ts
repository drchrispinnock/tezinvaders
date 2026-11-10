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

export async function handle(method: string, path: string, body: string, secretKey: string): Promise<HttpResult> {
  if (method === "OPTIONS") return { status: 204, body: "" };
  if (method === "GET" && (path === "/" || path === "/key")) {
    return { status: 200, body: JSON.stringify({ verifier: await verifierPublicKey(secretKey) }) };
  }
  if (method !== "POST" || path !== "/attest") return { status: 404, body: JSON.stringify({ error: "not found" }) };
  if (body.length > MAX_BODY_BYTES) return { status: 413, body: JSON.stringify({ error: "request too large" }) };
  let req: AttestRequest;
  try { req = JSON.parse(body) as AttestRequest; } catch { return { status: 400, body: JSON.stringify({ error: "bad JSON" }) }; }
  try {
    return { status: 200, body: JSON.stringify(await attest(secretKey, req)) };
  } catch (e) {
    if (e instanceof ClaimError) return { status: 422, body: JSON.stringify({ error: e.message }) };
    console.error(e);
    return { status: 500, body: JSON.stringify({ error: "verifier error" }) };
  }
}

export function secretKeyFromEnv(): string {
  const key = process.env.VERIFIER_SECRET_KEY;
  if (!key || !/^edsk[1-9A-HJ-NP-Za-km-z]{50,98}$/.test(key)) throw new Error("set VERIFIER_SECRET_KEY to the verifier's edsk (node verifier/keygen.ts makes one)");
  return key;
}
