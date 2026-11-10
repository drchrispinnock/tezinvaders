// A sample Advent door in the game's pixel style: one of the invaders in a Santa hat on a snowy
// night, with the day number. Placeholder art until the real 24 designs exist; the output is
// public/badges/advent/<NN>.svg, the files the token metadata will point at.
//
//   node contract/scripts/advent-image.ts <day 1-24> [--all]

import { mkdirSync, writeFileSync } from "node:fs";
import { BANK, BANK_COLOR, BANK_SHADE, KINDS, bitmapSize, type Bitmap } from "../../src/game/sprites.ts";

const SIZE = 64;
const BG = "#05070f", SNOW = "#e6e9f5", GOLD = "#ffd34d", RED = "#e8333f", DARK_RED = "#9c1f28";

const DIGITS: Record<string, Bitmap> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"], "1": [".#.", "##.", ".#.", ".#.", "###"], "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", "###", "..#", "###"], "4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"], "7": ["###", "..#", "..#", "..#", "..#"], "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
};
const HAT: Bitmap = [
  "......##..",
  "....####..",
  "...#####..",
  "..######..",
  ".#######..",
  "oooooooooo",
];

/** Horizontal runs of `ch` in `bitmap` as a path, offset by (ox, oy). */
function runs(bitmap: Bitmap, ch: string, ox: number, oy: number): string {
  let d = "";
  bitmap.forEach((line, y) => {
    for (let x = 0; x < line.length;) {
      if (line[x] !== ch) { x++; continue; }
      let end = x;
      while (line[end] === ch) end++;
      d += `M${x + ox} ${y + oy}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  });
  return d;
}
const layer = (bitmap: Bitmap, ch: string, ox: number, oy: number, color: string): string => {
  const d = runs(bitmap, ch, ox, oy);
  return d ? `<path fill="${color}" d="${d}"/>` : "";
};

/** A tiny deterministic generator so each day's snowfall differs but is stable. */
function prng(seed: number): () => number {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function adventSvg(day: number): string {
  const sprites = [KINDS.dollar, KINDS.euro, KINDS.pound, KINDS.yen] as const;
  const pick = (day - 1) % 5;
  const bitmap: Bitmap = pick === 4 ? BANK : sprites[pick]!.frames[0];
  const color = pick === 4 ? BANK_COLOR : sprites[pick]!.color;
  const shade = pick === 4 ? BANK_SHADE : color;
  const { w, h } = bitmapSize(bitmap);
  const ox = Math.floor((SIZE - w) / 2), oy = 24;
  const rnd = prng(day * 7919);
  let snow = "";
  for (let i = 0; i < 28; i++) {
    const x = Math.floor(rnd() * SIZE), y = Math.floor(rnd() * 48);
    snow += `M${x} ${y}h1v1h-1z`;
  }
  const label = String(day);
  const digitsW = label.length * 4 - 1;
  const digits = [...label].map((ch, i) => layer(DIGITS[ch]!, "#", SIZE - 6 - digitsW + i * 4, SIZE - 12, GOLD)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="512" height="512" shape-rendering="crispEdges">` +
    `<rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>` +
    `<path fill="${SNOW}" opacity="0.7" d="${snow}"/>` +
    `<rect x="0" y="${SIZE - 6}" width="${SIZE}" height="6" fill="${SNOW}"/>` +
    `<rect x="1" y="1" width="${SIZE - 2}" height="${SIZE - 2}" fill="none" stroke="${GOLD}" stroke-width="1"/>` +
    layer(bitmap, "#", ox, oy, color) + layer(bitmap, "o", ox, oy, shade) +
    layer(HAT, "#", ox + Math.floor((w - 10) / 2) + 2, oy - 6, RED) + layer(HAT, "o", ox + Math.floor((w - 10) / 2) + 2, oy - 6, SNOW) +
    `<rect x="${ox + Math.floor((w - 10) / 2) + 8}" y="${oy - 7}" width="2" height="2" fill="${SNOW}"/>` +
    `<rect x="${SIZE - 9 - digitsW}" y="${SIZE - 14}" width="${digitsW + 6}" height="9" fill="${DARK_RED}"/>` + digits +
    `</svg>`;
}

const [arg] = process.argv.slice(2);
const days = process.argv.includes("--all") ? Array.from({ length: 24 }, (_, i) => i + 1) : [Number(arg)];
mkdirSync("public/badges/advent", { recursive: true });
for (const day of days) {
  if (!(day >= 1 && day <= 24)) { console.error("day must be 1-24"); process.exit(2); }
  const file = `public/badges/advent/${String(day).padStart(2, "0")}.svg`;
  writeFileSync(file, adventSvg(day));
  console.log(file);
}
