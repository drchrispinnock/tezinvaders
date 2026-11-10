// Prints the initial storage literal for contract/tezinvaders.tz, including the TZIP-16
// contract metadata and the TZIP-21 token metadata for the five badges, whose images are the
// hosted SVGs (see export-badges.ts). Runs on plain Node (22.18+ strips the types itself):
//
//   node contract/scripts/storage.ts --admin tz1… [--fee 1000000] [--round-length 604800] [--round-ends <unix seconds>] [--image-base <https url/>]
//
// With --token-info <id> it instead prints just that badge's token_info literal, the argument
// for the admin's set_token_metadata entrypoint (`Pair <id> <literal>`).
//
// --round-ends defaults to now + round length; the mockup test pins it explicitly because the
// mockup chain's clock is stuck at the epoch.

import { parseArgs } from "node:util";
import { BADGES, BADGE_IMAGE_BASE, badgeDescription, badgeImageUrl, type Badge } from "../../src/chain/badges.ts";

const { values } = parseArgs({
  options: {
    admin: { type: "string" },
    fee: { type: "string", default: "1000000" },
    "round-length": { type: "string", default: String(24 * 3600) },
    "round-ends": { type: "string" },
    "image-base": { type: "string", default: BADGE_IMAGE_BASE },
    "token-info": { type: "string" },
  },
});

const hex = (s: string): string => "0x" + Buffer.from(s, "utf8").toString("hex");
/** A Michelson `map string bytes` literal; Michelson requires the keys in order. */
const bytesMap = (entries: [string, string][]): string =>
  `{ ${[...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `Elt "${k}" ${hex(v)}`).join("; ")} }`;

const imageBase = values["image-base"]!;
const tokenInfo = (b: Badge): string => {
  const uri = badgeImageUrl(b, imageBase);
  return bytesMap([
    ["name", b.name],
    ["symbol", b.symbol],
    ["decimals", "0"],
    ["description", badgeDescription(b)],
    ["artifactUri", uri],
    ["displayUri", uri],
    ["thumbnailUri", uri],
    ["formats", JSON.stringify([{ uri, mimeType: "image/svg+xml" }])],
  ]);
};

if (values["token-info"] !== undefined) {
  const badge = BADGES.find((b) => String(b.id) === values["token-info"]);
  if (!badge) { console.error(`no badge with id ${values["token-info"]}`); process.exit(2); }
  console.log(tokenInfo(badge));
  process.exit(0);
}

if (!values.admin) {
  console.error("usage: node contract/scripts/storage.ts --admin <tz1…> [--fee <mutez>] [--round-length <seconds>] [--round-ends <unix seconds>]");
  process.exit(2);
}

const length = Number(values["round-length"]);
const ends = values["round-ends"] !== undefined ? Number(values["round-ends"]) : Math.floor(Date.now() / 1000) + length;
if (!Number.isInteger(length) || length <= 0 || !Number.isInteger(ends)) {
  console.error("round length must be a positive whole number of seconds");
  process.exit(2);
}

const tokens = BADGES.map((b) => `Elt ${b.id} (Pair ${b.id} ${tokenInfo(b)})`).join("; ");

const content = JSON.stringify({
  name: "TezInvaders",
  description: "Prize pool, high score table and achievement badges for the TezInvaders game.",
  version: "1.0.0",
  interfaces: ["TZIP-012", "TZIP-016", "TZIP-021"],
});
const metadata = bytesMap([["", "tezos-storage:content"], ["content", content]]);

console.log(`Pair "${values.admin}" ${values.fee} 1 0 ${ends} ${length} {} {} {} {} {} { ${tokens} } ${metadata}`);
