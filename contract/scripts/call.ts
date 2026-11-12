// Call an entrypoint of the contract through octez.js, signing with the admin's unencrypted key
// from octez-client's wallet file (which never leaves this process). Used where octez-client
// cannot: networks on a protocol the installed client does not know (Quantumnet), and from the
// cron backstop. Prints the operation hash.
//
//   node contract/scripts/call.ts --rpc <url> --contract KT1… --entrypoint end_round [--arg '<michelson>'] [--admin alias] [--wait]

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import octez from "@tezos-x/octez.js";
import signer from "@tezos-x/octez.js-signer";
const { TezosToolkit, UnitValue } = octez;
const { InMemorySigner } = signer;

const { values } = parseArgs({ options: {
  rpc: { type: "string" }, contract: { type: "string" }, entrypoint: { type: "string" }, arg: { type: "string", default: "Unit" },
  admin: { type: "string", default: "tezinvaders-admin" }, wait: { type: "boolean", default: false },
} });
if (!values.rpc || !values.contract || !values.entrypoint) { console.error("usage: call.ts --rpc <url> --contract KT1… --entrypoint <name> [--arg <michelson>]"); process.exit(2); }

const keys = JSON.parse(readFileSync(`${homedir()}/.tezos-client/secret_keys`, "utf8")) as { name: string; value: string }[];
const entry = keys.find((k) => k.name === values.admin);
if (!entry?.value.startsWith("unencrypted:")) { console.error(`octez-client has no unencrypted key for alias ${values.admin}`); process.exit(2); }

const tezos = new TezosToolkit(values.rpc);
tezos.setSignerProvider(new InMemorySigner(entry.value.slice("unencrypted:".length)));
const contract = await tezos.contract.at(values.contract);
const method = contract.methodsObject[values.entrypoint];
if (!method) { console.error(`no entrypoint ${values.entrypoint}`); process.exit(2); }
// Unit entrypoints take UnitValue; others take a Michelson literal, parenthesised for michel-codec.
const op = values.arg === "Unit"
  ? await method(UnitValue).send()
  : await tezos.contract.transfer({ to: values.contract, amount: 0, parameter: { entrypoint: values.entrypoint, value: new (await import("@tezos-x/octez.js-michel-codec")).default.Parser().parseMichelineExpression(`(${values.arg})`) as never } });
console.log(`Operation hash is '${op.hash}'`);
if (values.wait) await op.confirmation(1);
