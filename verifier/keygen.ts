// Make a verifier key pair: prints the edsk (keep it secret, give it to the verifier as
// VERIFIER_SECRET_KEY) and the edpk (the contract's verifier key, for storage.ts --verifier and
// set_verifier). With --env the output is two shell assignments.

import { createHash, randomBytes } from "node:crypto";
import signer from "@tezos-x/octez.js-signer";
const { InMemorySigner } = signer;

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const EDSK_SEED_PREFIX = Buffer.from([13, 15, 58, 7]);

/** Base58Check: prefix ++ payload ++ first 4 bytes of sha256(sha256(prefix ++ payload)). */
function b58check(prefix: Buffer, payload: Buffer): string {
  const body = Buffer.concat([prefix, payload]);
  const check = createHash("sha256").update(createHash("sha256").update(body).digest()).digest().subarray(0, 4);
  let n = BigInt("0x" + Buffer.concat([body, check]).toString("hex"));
  let out = "";
  while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  return out;
}

const secretKey = b58check(EDSK_SEED_PREFIX, randomBytes(32));
const publicKey = await new InMemorySigner(secretKey).publicKey();
if (process.argv.includes("--env")) console.log(`VERIFIER_SECRET_KEY=${secretKey}\nVERIFIER_PUBLIC_KEY=${publicKey}`);
else console.log(`secret key (edsk): ${secretKey}\npublic key (edpk): ${publicKey}`);
