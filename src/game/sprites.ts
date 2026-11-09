// Pixel art for everything on the canvas. '#' is a lit pixel, '.' is empty.
// Invader glyphs are 16x16 currency symbols. Both animation frames are the same
// glyph (no "walking" legs); the formation's step motion carries the animation.
// The Tezos mark itself is vector (see logo.ts); only the barrier badge is pixel art.

export type Bitmap = readonly string[];

export const PX = 2; // logical canvas pixels per sprite pixel

export interface InvaderKind {
  readonly symbol: string;
  readonly name: string;
  readonly points: number;
  readonly color: string;
  readonly frames: readonly [Bitmap, Bitmap];
}

function frames(glyph: Bitmap): [Bitmap, Bitmap] {
  return [glyph, glyph];
}

const DOLLAR: Bitmap = [
  ".......##.......",
  ".......##.......",
  "....########....",
  "...##..##..##...",
  "..##...##...##..",
  "..##...##.......",
  "...##..##.......",
  "....#######.....",
  ".......##.###...",
  ".......##...##..",
  ".......##...##..",
  "..##...##...##..",
  "...##..##..##...",
  "....########....",
  ".......##.......",
  ".......##.......",
];

const EURO: Bitmap = [
  ".......######...",
  ".....###....###.",
  "....##........##",
  "...##.........##",
  "...##...........",
  "...##...........",
  "#########.......",
  "#########.......",
  "...##...........",
  "#########.......",
  "#########.......",
  "...##...........",
  "...##...........",
  "....##........##",
  ".....###....###.",
  ".......######...",
];

const POUND: Bitmap = [
  "......#######...",
  ".....##.....##..",
  "....##.......##.",
  "....##.......##.",
  "....##..........",
  "....##..........",
  "..########......",
  "..########......",
  "....##..........",
  "....##..........",
  "....##..........",
  "....##..........",
  "...##...........",
  "..##.........##.",
  ".##############.",
  ".##############.",
];

const YEN: Bitmap = [
  "##............##",
  ".##..........##.",
  "..##........##..",
  "...##......##...",
  "....##....##....",
  ".....##..##.....",
  "..############..",
  "..############..",
  ".......##.......",
  "..############..",
  "..############..",
  ".......##.......",
  ".......##.......",
  ".......##.......",
  ".......##.......",
  ".......##.......",
];

export const KINDS = {
  dollar: { symbol: "$", name: "DOLLAR", points: 10, color: "#3ddc84", frames: frames(DOLLAR) },
  euro: { symbol: "€", name: "EURO", points: 20, color: "#ffd34d", frames: frames(EURO) },
  pound: { symbol: "£", name: "POUND", points: 20, color: "#ff8c42", frames: frames(POUND) },
  yen: { symbol: "¥", name: "YEN", points: 30, color: "#ff4d6d", frames: frames(YEN) },
} as const satisfies Record<string, InvaderKind>;

/** Top row first. */
export const ROW_KINDS: readonly InvaderKind[] = [KINDS.yen, KINDS.pound, KINDS.euro, KINDS.dollar, KINDS.dollar];

export const INVADER_W = 16;
export const INVADER_H = 16;

/** The player's cannon: the original laser base. The renderer paints the Tezos mark onto the slab. */
export const SHIP: Bitmap = [
  "..........##..........",
  ".........####.........",
  ".........####.........",
  ".........####.........",
  ".........####.........",
  "..##################..",
  ".####################.",
  "######################",
  "######################",
  "######################",
  "######################",
  "######################",
  "######################",
  "######################",
  "######################",
];
export const SHIP_COLOR = "#2c7df7";
export const SHIP_BADGE_COLOR = "#ffffff";
/** Where the ꜩ sits on the slab, in sprite pixels: the badge is `h` tall and centred on `cx`. */
export const SHIP_BADGE = { cx: 11, y: 6.5, h: 8 };

/**
 * The mystery saucer drifting across the top. Squint and it is a certain other chain's
 * diamond, flown wide and low; the right half takes the shade colour.
 */
export const BANK: Bitmap = [
  "...........#o...........",
  "..........##oo..........",
  ".........###ooo.........",
  "........####oooo........",
  "......######oooooo......",
  "....########oooooooo....",
  "..##########oooooooooo..",
  "############oooooooooooo",
  "..########....oooooooo..",
  "....####........oooo....",
  "........................",
  "..##########oooooooooo..",
  "....########oooooooo....",
  "......######oooooo......",
  ".........###ooo.........",
  "...........#o...........",
];
export const BANK_COLOR = "#ff4d6d";
export const BANK_SHADE = "#c43b56";
export const BANK_POINTS = [50, 100, 150, 300] as const;

/** The classic barrier silhouette: an arched top, a solid body and a notch cut out of the bottom. */
function barrierBase(w: number, h: number): Bitmap {
  const ramp = 6, notchRows = 6;
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    const inset = Math.max(0, ramp - y);
    const notchFromBottom = y - (h - notchRows); // 0 on the first notched row
    const notchHalf = notchFromBottom < 0 ? 0 : 4 + Math.min(2, notchFromBottom);
    let line = "";
    for (let x = 0; x < w; x++) {
      const inRamp = x < inset || x >= w - inset;
      const inNotch = notchHalf > 0 && Math.abs(x - (w - 1) / 2) <= notchHalf;
      line += inRamp || inNotch ? "." : "#";
    }
    rows.push(line);
  }
  return rows;
}

/** An 11x15 ꜩ in the shape of the Tezos mark, stamped into the solid part of each barrier. */
const TEZ_BADGE: Bitmap = [
  "..##.......",
  "..##.......",
  "###########",
  "###########",
  "..##.....#.",
  "..##....#..",
  "..##...#...",
  "..##..###..",
  "..##....##.",
  "..###....##",
  "...##....##",
  ".........##",
  "....#...##.",
  "....##.##..",
  ".....###...",
];

/** Overlay `badge` onto `base` at (x, y): lit badge pixels over lit base pixels become 'o'. */
export function stamp(base: Bitmap, badge: Bitmap, x: number, y: number): Bitmap {
  return base.map((line, row) => {
    const b = badge[row - y];
    if (!b) return line;
    return [...line].map((c, col) => (c === "#" && b[col - x] === "#" ? "o" : c)).join("");
  });
}

export const BUNKER: Bitmap = stamp(barrierBase(33, 24), TEZ_BADGE, 11, 3);
export const BUNKER_COLOR = "#41d16a";
export const BUNKER_BADGE_COLOR = SHIP_BADGE_COLOR;

export function bitmapSize(b: Bitmap): { w: number; h: number } {
  return { w: b[0]?.length ?? 0, h: b.length };
}
