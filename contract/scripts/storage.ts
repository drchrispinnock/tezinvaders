// Prints the initial storage literal for contract/tezinvaders.tz, including the TZIP-16
// contract metadata and the TZIP-21 token metadata for the five badges, whose images are the
// hosted SVGs (see export-badges.ts). Runs on plain Node (22.18+ strips the types itself):
//
//   node contract/scripts/storage.ts --admin tz1… --verifier edpk… [--fee 1000000] [--round-length 86400] [--round-ends <unix seconds>]
//        [--advent-start <unix seconds, default 2026-12-01>] [--advent-token <first id, default 100>] [--image-base <https url/>]
//
// With --token-info <id> it instead prints just that badge's token_info literal, the argument
// for the admin's set_token_metadata entrypoint (`Pair <id> <literal>`).
//
// --round-ends defaults to now + round length; the mockup test pins it explicitly because the
// mockup chain's clock is stuck at the epoch.

import { parseArgs } from "node:util";
import { BADGES, BADGE_IMAGE_BASE, badgeDescription, badgeImageUrl, type Badge } from "../../src/chain/badges.ts";
import { ADVENT_DAYS, ADVENT_FIRST_TOKEN, ADVENT_START, adventDescription, adventImageUrl, adventName } from "../../src/chain/advent.ts";

const { values } = parseArgs({
  options: {
    admin: { type: "string" },
    verifier: { type: "string" },
    fee: { type: "string", default: "1000000" },
    "round-length": { type: "string", default: String(24 * 3600) },
    "round-ends": { type: "string" },
    "image-base": { type: "string", default: BADGE_IMAGE_BASE },
    "token-info": { type: "string" },
    "advent-start": { type: "string", default: String(ADVENT_START / 1000) },
    "advent-token": { type: "string", default: String(ADVENT_FIRST_TOKEN) },
  },
});

const hex = (s: string): string => "0x" + Buffer.from(s, "utf8").toString("hex");
/** A Michelson `map string bytes` literal; Michelson requires the keys in order. */
const bytesMap = (entries: [string, string][]): string =>
  `{ ${[...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `Elt "${k}" ${hex(v)}`).join("; ")} }`;

const imageBase = values["image-base"]!;
const info = (name: string, symbol: string, description: string, uri: string): string => bytesMap([
  ["name", name],
  ["symbol", symbol],
  ["decimals", "0"],
  ["description", description],
  ["artifactUri", uri],
  ["displayUri", uri],
  ["thumbnailUri", uri],
  ["formats", JSON.stringify([{ uri, mimeType: "image/svg+xml" }])],
]);
const tokenInfo = (b: Badge): string => info(b.name, b.symbol, badgeDescription(b), badgeImageUrl(b, imageBase));
const adventInfo = (day: number): string => info(adventName(day), `TZIADV${String(day + 1).padStart(2, "0")}`, adventDescription(day), adventImageUrl(day, imageBase));

if (values["token-info"] !== undefined) {
  const id = Number(values["token-info"]);
  const badge = BADGES.find((b) => b.id === id);
  const adventToken = Number(values["advent-token"]);
  if (badge) console.log(tokenInfo(badge));
  else if (id >= adventToken && id < adventToken + ADVENT_DAYS) console.log(adventInfo(id - adventToken));
  else { console.error(`no token with id ${id}`); process.exit(2); }
  process.exit(0);
}

if (!values.admin || !values.verifier) {
  console.error("usage: node contract/scripts/storage.ts --admin <tz1…> --verifier <edpk…> [--fee <mutez>] [--round-length <seconds>] [--round-ends <unix seconds>]");
  process.exit(2);
}

const length = Number(values["round-length"]);
const ends = values["round-ends"] !== undefined ? Number(values["round-ends"]) : Math.floor(Date.now() / 1000) + length;
if (!Number.isInteger(length) || length <= 0 || !Number.isInteger(ends)) {
  console.error("round length must be a positive whole number of seconds");
  process.exit(2);
}

const adventStart = Number(values["advent-start"]), adventToken = Number(values["advent-token"]);
if (!Number.isInteger(adventStart) || !Number.isInteger(adventToken) || adventToken < BADGES.length) {
  console.error("advent start must be unix seconds and the first advent token id must be above the badge ids");
  process.exit(2);
}
const tokens = [
  ...BADGES.map((b) => `Elt ${b.id} (Pair ${b.id} ${tokenInfo(b)})`),
  ...Array.from({ length: ADVENT_DAYS }, (_, day) => `Elt ${adventToken + day} (Pair ${adventToken + day} ${adventInfo(day)})`),
].join("; ");

const content = JSON.stringify({
  name: "TezInvaders",
  description: "Prize pool, high score table and achievement badges for the TezInvaders game.",
  version: "1.0.0",
  interfaces: ["TZIP-012", "TZIP-016", "TZIP-021"],
});
const metadata = bytesMap([["", "tezos-storage:content"], ["content", content]]);

// admin fee round pool round_ends round_length advent verifier leader scores champions best advent_days ledger operators token_metadata metadata
console.log(`Pair "${values.admin}" ${values.fee} 1 0 ${ends} ${length} (Pair ${adventStart} ${adventToken}) "${values.verifier}" None {} {} {} {} {} {} { ${tokens} } ${metadata}`);
