// The badge collection: five FA2 tokens the contract mints when a player's all-time best
// score first reaches each threshold. Ids and thresholds mirror the list PUSHed in
// contract/tezinvaders.tz. The pictures are the game's own sprites rendered to SVG. Explorers
// and wallets (TzKT, Signet) only load token images from ipfs:// or public https URLs, not
// inline data: URIs, so the token metadata points at hosted copies (BADGE_IMAGE_BASE; the
// files are written by contract/scripts/export-badges.ts). The panel draws the same SVGs
// from here as data URIs, with no network round trip.
//
// Imports carry the .ts extension so Node can run the generator on this file directly.

import { BANK, BANK_COLOR, BANK_SHADE, KINDS, bitmapSize, type Bitmap } from "../game/sprites.ts";

/** Where the hosted badge SVGs live: `${BADGE_IMAGE_BASE}${slug}.svg`. A GitHub Pages site of just those files. */
export const BADGE_IMAGE_BASE = "https://drchrispinnock.github.io/tezinvaders-badges/";

export interface Badge {
  readonly id: number;
  /** File name of the hosted image, without extension. */
  readonly slug: string;
  readonly name: string;
  readonly symbol: string;
  readonly threshold: number;
  readonly bitmap: Bitmap;
  readonly color: string;
  /** Colour of the bitmap's 'o' pixels, when it has any. */
  readonly shade: string;
}

export const BADGES: readonly Badge[] = [
  { id: 0, slug: "dollar", name: "Dollar Invader", symbol: "TZIUSD", threshold: 1000, bitmap: KINDS.dollar.frames[0], color: KINDS.dollar.color, shade: KINDS.dollar.color },
  { id: 1, slug: "euro", name: "Euro Invader", symbol: "TZIEUR", threshold: 3000, bitmap: KINDS.euro.frames[0], color: KINDS.euro.color, shade: KINDS.euro.color },
  { id: 2, slug: "pound", name: "Pound Invader", symbol: "TZIGBP", threshold: 5000, bitmap: KINDS.pound.frames[0], color: KINDS.pound.color, shade: KINDS.pound.color },
  { id: 3, slug: "yen", name: "Yen Invader", symbol: "TZIJPY", threshold: 8000, bitmap: KINDS.yen.frames[0], color: KINDS.yen.color, shade: KINDS.yen.color },
  { id: 4, slug: "mothership", name: "Mothership", symbol: "TZISHIP", threshold: 12000, bitmap: BANK, color: BANK_COLOR, shade: BANK_SHADE },
];

export const badgeDescription = (b: Badge): string =>
  `Awarded for scoring ${b.threshold.toLocaleString("en-US")} points in TezInvaders.`;

/** Horizontal runs of `ch` as SVG path commands, offset by (ox, oy). */
function runs(bitmap: Bitmap, ch: string, ox: number, oy: number): string {
  let d = "";
  bitmap.forEach((line, y) => {
    let x = 0;
    while (x < line.length) {
      if (line[x] !== ch) { x++; continue; }
      let end = x;
      while (line[end] === ch) end++;
      d += `M${x + ox} ${y + oy}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  });
  return d;
}

/** The badge as a square SVG: the sprite on a dark field with a 4px margin. */
export function badgeSvg(b: Badge): string {
  const { w, h } = bitmapSize(b.bitmap);
  const box = Math.max(w, h) + 8;
  const ox = Math.floor((box - w) / 2);
  const oy = Math.floor((box - h) / 2);
  const layers = [["#", b.color], ["o", b.shade]] as const;
  const paths = layers.map(([ch, color]) => {
    const d = runs(b.bitmap, ch, ox, oy);
    return d ? `<path fill="${color}" d="${d}"/>` : "";
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" shape-rendering="crispEdges">` +
    `<rect width="${box}" height="${box}" fill="#05070f"/>${paths}</svg>`;
}

export const badgeDataUri = (b: Badge): string => `data:image/svg+xml;base64,${btoa(badgeSvg(b))}`;

export const badgeImageUrl = (b: Badge, base = BADGE_IMAGE_BASE): string => `${base}${b.slug}.svg`;

/** The highest badge reached by `score`, if any. */
export function badgeFor(score: number): Badge | undefined {
  return [...BADGES].reverse().find((b) => score >= b.threshold);
}
