// Prints the chain-prescribed seed (src/chain/seed.ts) for the mockup tests and for checking a contract.
//   node contract/scripts/seed.ts --contract KT1… --player tz1… --value <round or day> --tag <0 round | 1 day>
import { parseArgs } from "node:util";
import { seedFor } from "../../src/chain/seed.ts";
const { values } = parseArgs({ options: { contract: { type: "string" }, player: { type: "string" }, value: { type: "string" }, tag: { type: "string", default: "0" } } });
const n = Number(values.value), tag = Number(values.tag);
if (!values.contract || !values.player || !Number.isInteger(n) || n < 0 || (tag !== 0 && tag !== 1)) {
  console.error("usage: seed.ts --contract KT1… --player tz1… --value <non-negative integer> [--tag 0|1]"); process.exit(2);
}
console.log(seedFor(values.contract, values.player, n, tag));
