// Originate contract/tezinvaders.tz through octez.js rather than octez-client, so it works on
// networks whose protocol the installed client does not know (Quantumnet runs Alpha). Signs
// with the admin's unencrypted key from octez-client's own wallet file; the key never leaves
// this process. Prints the operation hash and the KT1.
//
//   node contract/scripts/originate.ts --rpc <url> --verifier edpk… [--admin tezinvaders-admin]
//        [--fee 1000000] [--round-length 86400] [--no-wait]

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import octez from "@tezos-x/octez.js";
import signer from "@tezos-x/octez.js-signer";
const { TezosToolkit } = octez;
const { InMemorySigner } = signer;

const { values } = parseArgs({ options: {
  rpc: { type: "string" }, verifier: { type: "string" }, admin: { type: "string", default: "tezinvaders-admin" },
  fee: { type: "string", default: "1000000" }, "round-length": { type: "string", default: "86400" },
  "no-wait": { type: "boolean", default: false },
} });
if (!values.rpc || !values.verifier) { console.error("usage: originate.ts --rpc <url> --verifier edpk… [--admin alias]"); process.exit(2); }

const here = new URL(".", import.meta.url).pathname;
const keys = JSON.parse(readFileSync(`${homedir()}/.tezos-client/secret_keys`, "utf8")) as { name: string; value: string }[];
const entry = keys.find((k) => k.name === values.admin);
if (!entry?.value.startsWith("unencrypted:")) { console.error(`octez-client has no unencrypted key for alias ${values.admin}`); process.exit(2); }

const tezos = new TezosToolkit(values.rpc);
tezos.setSignerProvider(new InMemorySigner(entry.value.slice("unencrypted:".length)));
const admin = await tezos.signer.publicKeyHash();
const init = execFileSync("node", [`${here}storage.ts`, "--admin", admin, "--verifier", values.verifier, "--fee", values.fee!, "--round-length", values["round-length"]!]).toString().trim();
const code = readFileSync(`${here}../tezinvaders.tz`, "utf8");

console.error(`originating on ${values.rpc} as ${admin}`);
// michel-codec only parses a top-level application when it is parenthesised.
const op = await tezos.contract.originate({ code, init: `(${init})` });
console.log(`Operation hash is '${op.hash}'`);
if (!values["no-wait"]) await op.confirmation(1);
console.log(`New contract ${op.contractAddress} originated`);
