// The 25 Advent doors as SVGs in the game's pixel style, written to public/badges/advent/NN.svg
// (the files the token metadata points at):
//   1-5   the game's invaders and the mothership, in Santa hats
//   6-15  other currencies of the world
//   16-20 Ms BLS, Captain Stake, the Glorious Testnet Dictator, The Rollup Dude, Farrah Faucet: their
//         TzKT avatars (contract/assets/characters) in Santa hats
//   21-23 the Signet ring, the Etherlink mark, the Tezos ꜩ
//   24-25 Christmas pudding, Christmas tree
//
//   node contract/scripts/advent-image.ts <day 1-25> [--all]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { LOGO_PATH } from "../../src/game/logo.ts";
import { BANK, BANK_COLOR, BANK_SHADE, KINDS, bitmapSize, type Bitmap } from "../../src/game/sprites.ts";

const SIZE = 64;
const BG = "#05070f", SNOW = "#e6e9f5", GOLD = "#ffd34d", RED = "#e8333f", DARK_RED = "#9c1f28";
const SKIN = "#f5c9a0", GREEN = "#2fbf5a", DARK_GREEN = "#1d8a3f", BROWN = "#7a4a1f", TEZ = "#2c7df7";

type Palette = Record<string, string>;
interface Design { bitmap?: Bitmap; palette?: Palette; hat?: boolean; svg?: string }

const DIGITS: Record<string, Bitmap> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"], "1": [".#.", "##.", ".#.", ".#.", "###"], "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", "###", "..#", "###"], "4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"], "7": ["###", "..#", "..#", "..#", "..#"], "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
};
const HAT: Bitmap = ["......##..", "....####..", "...#####..", "..######..", ".#######..", "oooooooooo"];

// ---- Currencies (16x16 glyphs) --------------------------------------------------------------
const RUPEE: Bitmap = [
  "................", "...##########...", "...##########...", ".......###......", "...##########...", "...##########...",
  ".......###......", "......###.......", ".....###........", "....###.........", "...###..........", "..###...........",
  "................", "................", "................", "................"];
const WON: Bitmap = [
  "................", "..##........##..", "..##........##..", "..##...##...##..", ".##############.", ".##############.",
  "...##.#..#.##...", "...##.#..#.##...", ".##############.", ".##############.", "....##....##....", "....##....##....",
  ".....##..##.....", "......####......", "................", "................"];
const RUBLE: Bitmap = [
  "................", "....########....", "....##.....##...", "....##......##..", "....##......##..", "....##.....##...",
  "..############..", "..############..", "....##..........", "..########......", "..########......", "....##..........",
  "....##..........", "....##..........", "................", "................"];
const LIRA: Bitmap = [
  "................", "......##........", "......##........", "......##..##....", "......##.##.....", "......####......",
  "...##.##........", "..##..##........", "......##........", "......##........", "......##......##", "......##.....##.",
  "......##....##..", ".......######...", "................", "................"];
const SHEKEL: Bitmap = [
  "................", ".######...####..", ".##..##......##.", ".##..##......##.", ".##..##......##.", ".##..##......##.",
  ".##..##......##.", ".##..##......##.", ".##..........##.", ".##..##......##.", ".##..##......##.", ".##..##......##.",
  ".##...####...##.", "................", "................", "................"];
const BAHT: Bitmap = [
  "................", ".......##.......", "....#######.....", "....##..##.##...", "....##..##..##..", "....##..##..##..",
  "....##..##.##...", "....#######.....", "....##..##.##...", "....##..##..##..", "....##..##..##..", "....##..##.##...",
  "....#######.....", ".......##.......", "................", "................"];
const NAIRA: Bitmap = [
  "................", "..##........##..", "..###.......##..", "..####......##..", ".##############.", ".##############.",
  "..##..##....##..", "..##...##...##..", ".##############.", ".##############.", "..##.....##.##..", "..##......####..",
  "..##.......###..", "..##........##..", "................", "................"];
const PESO: Bitmap = [
  "................", "..########......", "..##.....##.....", ".#############..", ".#############..", "..##.....##.....",
  ".#############..", ".#############..", "..########......", "..##............", "..##............", "..##............",
  "..##............", "..##............", "................", "................"];
const HRYVNIA: Bitmap = [
  "................", ".....######.....", "....##....##....", "....##..........", ".....####.......", "..############..",
  "..############..", "........####....", "..############..", "..############..", "..........##....", "....##....##....",
  ".....######.....", "................", "................", "................"];
const DONG: Bitmap = [
  "................", "..........##....", "........######..", "..........##....", "..........##....", ".....#######....",
  "....##....##....", "....##....##....", "....##....##....", ".....#######....", "................", "..############..",
  "..############..", "................", "................", "................"];

// ---- Characters (16x16; # hair/outfit, o skin, + detail, * accent) ----------------------------
const MS_BLS: Bitmap = [
  "....########....", "..############..", ".##############.", "###oooooooooo###", "###oooooooooo###", "##oo+oooooo+oo##",
  "##oooooooooooo##", "##ooooo++ooooo##", "##oooooooooooo##", "###oo++++++oo###", "###oooooooooo###", ".###oooooooo###.",
  "..##.oooooo.##..", ".....oooooo.....", "....*oooooo*....", "...**oooooo**..."];
const CAPTAIN_STAKE: Bitmap = [
  "......####......", ".....oooooo.....", "....oooooooo....", "....########....", "....#+####+#....", "....oooooooo....",
  ".....oo++oo.....", "......oooo......", "...##*####*##...", "..###*#++#*###..", ".####*#++#*####.", ".####*####*####.",
  ".####*####*####.", "..##..####..##..", "......####......", "......#..#......"];
const DICTATOR: Bitmap = [
  "....########....", "...##########...", "..####*####*##..", "..############..", ".##############.", "....oooooooooo..",
  "...oooooooooooo.", "...o##########o.", "...oo##oooo##oo.", "...oooooooooooo.", "...oo+++++++oo..", "...ooooooooooo..",
  "....oooo+ooooo..", ".....oooooooo...", "....##*####*##..", "...###*####*###."];
const ROLLUP_DUDE: Bitmap = [
  "....########....", "...##########...", "...##*######*#..", "...oooooooooo...", "..oooooooooooo..", "..o##########o..",
  "..o##oo##oo##o..", "..oooooooooooo..", "..ooo++++++ooo..", "...oooooooooo...", "....oooooooo....", "...##++++++##...",
  "..##++++++++##..", ".#+..******..+#.", ".#+..******..+#.", "................"];
const FARRAH: Bitmap = [
  "..####....####..", ".######..######.", ".######oo######.", ".#####oooo#####.", ".####oooooo####.", ".####o+oo+o####.",
  ".####oooooo####.", ".####ooo+oo####.", ".#####oooo#####.", ".######oo######.", ".###...##...###.", ".##....++....##.",
  ".......++..*****", "......++++.....*", "...............*", "..............*."];

// ---- Festive --------------------------------------------------------------------------------
const PUDDING: Bitmap = [
  ".......*........", "......+*+.......", ".....++.++......", "...oooooooooo...", "..oooooooooooo..", ".oooooooooooooo.",
  ".oo#oooo#ooooo#.", ".##o####o#####o.", ".####o#########.", ".##############.", ".##############.", ".##############.",
  "..############..", "...##########...", "....########....", "................"];
const TREE: Bitmap = [
  ".......*........", "......***.......", ".......#........", "......###.......", ".....##+##......", "....#######.....",
  "...##+####+#....", "......#####.....", ".....##+####....", "....#######+#...", "...###########..", "..#+#########+#.",
  ".###############", ".......oo.......", ".......oo.......", "......oooo......"];

const glyph = (bitmap: Bitmap, color: string): Design => ({ bitmap, palette: { "#": color }, hat: true });
const person = (bitmap: Bitmap, hair: string, detail: string, accent: string): Design =>
  ({ bitmap, palette: { "#": hair, o: SKIN, "+": detail, "*": accent }, hat: true });

const png64 = (file: string): string => readFileSync(new URL(`../assets/${file}`, import.meta.url)).toString("base64");
const SIGNET_PNG = png64("signet-128.png");
/** A character's TzKT avatar (contract/assets/characters, fetched from services.tzkt.io/v1/avatars) with a Santa hat. */
const portrait = (file: string): Design => ({
  svg: `<image href="data:image/png;base64,${png64(`characters/${file}`)}" x="10" y="12" width="44" height="44"/>` +
    `<g transform="translate(20 2) scale(2)">${layer(HAT, "#", 0, 0, RED)}${layer(HAT, "o", 0, 0, SNOW)}</g>`,
});
const ETHERLINK = readFileSync(new URL("../assets/etherlink.svg", import.meta.url), "utf8")
  .replace(/<\?xml[^>]*>/, "").replace(/<svg[^>]*>/, "").replace("</svg>", "")
  .replace(/<defs>[\s\S]*?<\/defs>/, "").replace(/class="cls-1"/g, 'fill="#262626"').replace(/class="cls-2"/g, 'fill="#38ff9c"');

const DESIGNS: Record<number, Design> = {
  1: { bitmap: KINDS.dollar.frames[0], palette: { "#": KINDS.dollar.color }, hat: true },
  2: { bitmap: KINDS.euro.frames[0], palette: { "#": KINDS.euro.color }, hat: true },
  3: { bitmap: KINDS.pound.frames[0], palette: { "#": KINDS.pound.color }, hat: true },
  4: { bitmap: KINDS.yen.frames[0], palette: { "#": KINDS.yen.color }, hat: true },
  5: { bitmap: BANK, palette: { "#": BANK_COLOR, o: BANK_SHADE }, hat: true },
  6: glyph(RUPEE, "#ff8c42"), 7: glyph(WON, "#5ad1ff"), 8: glyph(RUBLE, "#ff4d6d"), 9: glyph(LIRA, "#ff6b6b"), 10: glyph(SHEKEL, "#4db8ff"),
  11: glyph(BAHT, "#c77dff"), 12: glyph(NAIRA, "#3ddc84"), 13: glyph(PESO, "#ffd34d"), 14: glyph(HRYVNIA, "#ffe66d"), 15: glyph(DONG, "#ff9f1c"),
  16: portrait("ms-bls.png"),
  17: portrait("captain-stake.png"),
  18: portrait("glorius-testnet-dictator.png"),
  19: portrait("the-rollup-dude.png"),
  20: portrait("farrah-faucet.png"),
  21: { svg: `<image href="data:image/png;base64,${SIGNET_PNG}" x="8" y="6" width="48" height="48" image-rendering="auto"/>` },
  22: { svg: `<svg x="10" y="8" width="44" height="44" viewBox="0 0 1080 1080">${ETHERLINK}</svg>` },
  23: { svg: `<svg x="17" y="8" width="30" height="42" viewBox="0 0 47 64"><path fill="${TEZ}" d="${LOGO_PATH}"/></svg>` },
  24: { bitmap: PUDDING, palette: { "#": BROWN, o: SNOW, "+": DARK_GREEN, "*": RED } },
  25: { bitmap: TREE, palette: { "#": GREEN, o: BROWN, "+": RED, "*": GOLD } },
};

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
function layer(bitmap: Bitmap, ch: string, ox: number, oy: number, color: string): string {
  const d = runs(bitmap, ch, ox, oy);
  return d ? `<path fill="${color}" d="${d}"/>` : "";
}

/** A tiny deterministic generator so each day's snowfall differs but is stable. */
function prng(seed: number): () => number {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function adventSvg(day: number): string {
  const design = DESIGNS[day];
  if (!design) throw new Error(`no design for door ${day}`);
  const rnd = prng(day * 7919);
  let snow = "";
  for (let i = 0; i < 28; i++) snow += `M${Math.floor(rnd() * SIZE)} ${Math.floor(rnd() * 48)}h1v1h-1z`;
  let art = design.svg ?? "";
  if (design.bitmap) {
    const { w, h } = bitmapSize(design.bitmap);
    const scale = w <= 16 ? 2 : 1;                       // 16x16 glyphs are shown at 2x; wider sprites at 1x
    const ox = Math.floor((SIZE - w * scale) / 2), oy = design.hat ? 24 : 14;
    const layers = Object.entries(design.palette ?? {}).map(([ch, color]) => layer(design.bitmap!, ch, 0, 0, color)).join("");
    art += `<g transform="translate(${ox} ${oy}) scale(${scale})">${layers}</g>`;
    if (design.hat) {
      const hx = ox + Math.floor((w * scale - 10) / 2) + 2, hy = oy - 6;
      art += layer(HAT, "#", hx, hy, RED) + layer(HAT, "o", hx, hy, SNOW) + `<rect x="${hx + 6}" y="${hy - 1}" width="2" height="2" fill="${SNOW}"/>`;
    }
  }
  const label = String(day);
  const digitsW = label.length * 4 - 1;
  const digits = [...label].map((ch, i) => layer(DIGITS[ch]!, "#", SIZE - 6 - digitsW + i * 4, SIZE - 12, GOLD)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="512" height="512" shape-rendering="crispEdges">` +
    `<rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>` +
    `<path fill="${SNOW}" opacity="0.7" d="${snow}"/>` +
    `<rect x="0" y="${SIZE - 6}" width="${SIZE}" height="6" fill="${SNOW}"/>` +
    `<rect x="1" y="1" width="${SIZE - 2}" height="${SIZE - 2}" fill="none" stroke="${GOLD}" stroke-width="1"/>` +
    art +
    `<rect x="${SIZE - 9 - digitsW}" y="${SIZE - 14}" width="${digitsW + 6}" height="9" fill="${DARK_RED}"/>` + digits +
    `</svg>`;
}

const [arg] = process.argv.slice(2);
const days = process.argv.includes("--all") ? Array.from({ length: 25 }, (_, i) => i + 1) : [Number(arg)];
mkdirSync("public/badges/advent", { recursive: true });
for (const day of days) {
  if (!(day >= 1 && day <= 25)) { console.error("day must be 1-25"); process.exit(2); }
  const file = `public/badges/advent/${String(day).padStart(2, "0")}.svg`;
  writeFileSync(file, adventSvg(day));
  console.log(file);
}
