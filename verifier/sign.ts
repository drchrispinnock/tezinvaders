// Sign an arbitrary claim without replaying a game: for the contract tests (test-mockup.sh),
// which need attestations for made-up scores.
//   node verifier/sign.ts --key edsk… --chain NetX… --contract KT1… --player tz1… --score 500 --expires 4102444800 --round 1 --seed 7
// Prints the edsig. With --bytes it prints the packed bytes instead.

import { parseArgs } from "node:util";
import { attestationBytes, signClaim } from "./attest.ts";

const { values } = parseArgs({ options: {
  key: { type: "string" }, chain: { type: "string" }, contract: { type: "string" }, player: { type: "string" },
  score: { type: "string" }, expires: { type: "string" }, round: { type: "string", default: "1" }, seed: { type: "string", default: "0" }, bytes: { type: "boolean", default: false },
} });
const claim = { chainId: values.chain!, contract: values.contract!, player: values.player!, score: Number(values.score), expires: Number(values.expires), round: Number(values.round), seed: Number(values.seed) };
console.log(values.bytes ? attestationBytes(claim) : await signClaim(values.key!, claim));
