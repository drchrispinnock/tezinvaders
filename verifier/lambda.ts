// AWS Lambda handler (Function URL or API Gateway HTTP API, payload v2). Bundle with
// `npm run verifier:bundle`, upload verifier/dist/lambda.mjs, set VERIFIER_SECRET_KEY in the
// function's environment, and point VITE_VERIFIER_URL at the function URL.

import { CORS_HEADERS, handle, secretKeyFromEnv } from "./http.ts";

interface Event { requestContext: { http: { method: string; path: string } }; body?: string; isBase64Encoded?: boolean }

export async function handler(event: Event): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body) : "";
  const r = await handle(event.requestContext.http.method, event.requestContext.http.path, body, secretKeyFromEnv());
  return { statusCode: r.status, headers: CORS_HEADERS, body: r.body };
}
