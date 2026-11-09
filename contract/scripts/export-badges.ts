// Writes the five badge SVGs to a directory (default public/badges/, which Vite serves at
// /badges/<slug>.svg and the Pages deploy publishes at BADGE_IMAGE_BASE, where the token
// metadata points). Re-run it whenever the sprites change, then redeploy the site.
//
//   node contract/scripts/export-badges.ts [out-dir]

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BADGES, badgeSvg } from "../../src/chain/badges.ts";

const out = resolve(process.argv[2] ?? join(import.meta.dirname, "../../public/badges"));
mkdirSync(out, { recursive: true });
for (const b of BADGES) {
  writeFileSync(join(out, `${b.slug}.svg`), badgeSvg(b) + "\n");
  console.log(`${b.slug}.svg  ${b.name} (${b.threshold} pts)`);
}
