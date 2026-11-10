// Plain Node HTTP server for the verifier. Node 22.18+ runs it directly:
//   VERIFIER_SECRET_KEY=edsk… [PORT=8787] node verifier/server.ts
// Put it behind HTTPS (a reverse proxy or a Lambda, see verifier/lambda.ts) and point the site's
// VITE_VERIFIER_URL at it.

import { createServer } from "node:http";
import { CORS_HEADERS, MAX_BODY_BYTES, handle, secretKeyFromEnv } from "./http.ts";

const secretKey = secretKeyFromEnv();
const port = Number(process.env.PORT ?? 8787);

createServer((req, res) => {
  let body = "";
  let tooLarge = false;
  req.on("data", (chunk: Buffer) => {
    if (body.length + chunk.length > MAX_BODY_BYTES) { tooLarge = true; req.destroy(); return; }
    body += chunk.toString("utf8");
  });
  req.on("end", () => {
    void handle(req.method ?? "GET", new URL(req.url ?? "/", "http://x").pathname, tooLarge ? "x".repeat(MAX_BODY_BYTES + 1) : body, secretKey)
      .then((r) => { res.writeHead(r.status, CORS_HEADERS); res.end(r.body); });
  });
}).listen(port, () => console.log(`verifier listening on http://localhost:${port}`));
