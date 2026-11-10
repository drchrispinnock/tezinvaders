// AWS Lambda handler (Function URL or API Gateway HTTP API, payload v2). Bundle with
// `npm run verifier:bundle`, upload verifier/dist/lambda.mjs (deploy/verifier-deploy.sh).
//
// Keys come from the Secrets Manager secret named by VERIFIER_SECRET_ARN (JSON, see
// keysFromJson; deploy/verifier-secret.sh writes it from .env), because the Quantumnet key is
// ML-DSA and larger than a Lambda environment allows. Without that variable the handler falls
// back to VERIFIER_SECRET_KEY in the environment, which is enough for ed25519-only setups.

import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { handle, keysFromEnv, keysFromJson, type VerifierKeys } from "./http.ts";

interface Event { requestContext: { http: { method: string; path: string } }; body?: string; isBase64Encoded?: boolean }

let keys: Promise<VerifierKeys> | undefined;

async function loadKeys(): Promise<VerifierKeys> {
  const arn = process.env.VERIFIER_SECRET_ARN;
  if (!arn) return keysFromEnv();
  const out = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: arn }));
  if (!out.SecretString) throw new Error("the verifier secret has no string value");
  return keysFromJson(out.SecretString);
}

export async function handler(event: Event): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  keys ??= loadKeys().catch((e: unknown) => { keys = undefined; throw e; });
  const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body) : "";
  const { method, path } = event.requestContext.http;
  const r = await handle(method, path, body, await keys);
  // The function URL adds the CORS headers itself; sending them here too would duplicate them,
  // which browsers reject. Log outcomes (never bodies: they hold the game) for diagnosis.
  if (r.status !== 200 && r.status !== 204) console.log(`${method} ${path} -> ${r.status} ${r.body.slice(0, 200)}`);
  else if (method === "POST") console.log(`${method} ${path} -> ${r.status}`);
  return { statusCode: r.status, headers: { "Content-Type": "application/json" }, body: r.body };
}
