// The whole game state and its update rule, with no DOM or canvas dependency so
// it can be unit tested. `step()` advances exactly one 60 Hz tick. Anything the
// outside world needs to react to is pushed onto `events` for the caller to drain.

import {
  BANK, BANK_POINTS, BUNKER, INVADER_H, INVADER_W, PX, ROW_KINDS, SHIP, bitmapSize, type InvaderKind,
} from "./sprites.ts";

export const WIDTH = 560;
export const HEIGHT = 640;
export const COLS = 10;
export const ROWS = ROW_KINDS.length;

const COL_PITCH = 46;
const ROW_PITCH = 40;
const FORMATION_TOP = 96;
const FORMATION_STEP_X = 10;
const FORMATION_DROP = 18;
const MARGIN = 12;
const PLAYER_SPEED = 3.5;
const SHOT_SPEED = 9;
const BOMB_SPEED = 3.2;
const MAX_BOMBS = 3;
const BANK_SPEED = 1.6;
const BANK_Y = 44;
const RESPAWN_TICKS = 90;
const WAVE_CLEAR_TICKS = 120;
const ERASE_RADIUS = 3; // bunker cells; a diamond of this radius plus a ragged fringe
export const EXTRA_LIFE_EVERY = 5000;

export const PLAYER_Y = HEIGHT - 72;
export const SHIP_SIZE = bitmapSize(SHIP);
export const BANK_SIZE = bitmapSize(BANK);
export const BUNKER_SIZE = bitmapSize(BUNKER);

export type Phase = "intro" | "title" | "playing" | "respawn" | "wave" | "gameover";

export interface Input {
  left: boolean;
  right: boolean;
  fire: boolean;
  start: boolean;
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface Invader { col: number; row: number; kind: InvaderKind; alive: boolean }
export interface Shot { x: number; y: number; vy: number }
/** `cells` holds 0 (gone), 1 (barrier colour) or 2 (badge colour). */
export interface Bunker { x: number; y: number; cells: Uint8Array }
export interface Bank { x: number; dir: 1 | -1 }

export type GameEvent =
  | { type: "start" }
  | { type: "shoot" }
  | { type: "step" }
  | { type: "kill"; points: number; kind: InvaderKind }
  | { type: "bank"; points: number }
  | { type: "hit"; livesLeft: number }
  | { type: "wave"; wave: number }
  | { type: "life"; lives: number }
  | { type: "gameover"; score: number; wave: number };

export const SHOT_RECT = { w: 2, h: 10 };

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function createFormation(): Invader[] {
  const out: Invader[] = [];
  for (let row = 0; row < ROWS; row++) {
    const kind = ROW_KINDS[row];
    if (!kind) continue;
    for (let col = 0; col < COLS; col++) out.push({ col, row, kind, alive: true });
  }
  return out;
}

/** Ticks between formation steps: ~55 at a full formation, 1 when a single invader is left. Later waves are faster. */
export function stepInterval(alive: number, wave: number): number {
  const total = COLS * ROWS;
  const base = 1 + 54 * Math.pow(Math.max(0, alive - 1) / (total - 1), 1.4);
  const waveFactor = Math.max(0.45, 1 - (wave - 1) * 0.12);
  return Math.max(1, Math.round(base * waveFactor));
}

function createBunkers(): Bunker[] {
  const count = 4;
  const w = BUNKER_SIZE.w * PX;
  const gap = (WIDTH - count * w) / (count + 1);
  const bunkers: Bunker[] = [];
  for (let i = 0; i < count; i++) {
    const cells = new Uint8Array(BUNKER_SIZE.w * BUNKER_SIZE.h);
    BUNKER.forEach((line, y) => {
      for (let x = 0; x < line.length; x++) cells[y * BUNKER_SIZE.w + x] = line[x] === "#" ? 1 : line[x] === "o" ? 2 : 0;
    });
    bunkers.push({ x: Math.round(gap + i * (w + gap)), y: PLAYER_Y - 80, cells });
  }
  return bunkers;
}

export class Sim {
  phase: Phase = "intro";
  score = 0;
  lives = 3;
  wave = 1;
  tick = 0;
  playerX = WIDTH / 2;
  invaders: Invader[] = [];
  formX = 0;
  formY = 0;
  dir: 1 | -1 = 1;
  frame: 0 | 1 = 0;
  stepTimer = 0;
  shot: Shot | null = null;
  bombs: Shot[] = [];
  bunkers: Bunker[] = [];
  bank: Bank | null = null;
  bankTimer = 0;
  phaseTimer = 0;
  events: GameEvent[] = [];

  /** Score at which the next extra life is awarded (one every EXTRA_LIFE_EVERY points). */
  nextLife = EXTRA_LIFE_EVERY;
  /** Seed of the current game. The generator restarts from it in startGame, so a recorded game replays exactly. */
  seed = 0;
  /** The current game's inputs, one code per tick (encodeInput), from startGame until gameover. */
  log: number[] = [];
  private recording = false;
  private prng = 0;
  private readonly rng: () => number;

  /** Pass an rng to replace the seeded generator (tests do, to suppress bombs and the bank). */
  constructor(rng?: () => number) {
    this.rng = rng ?? (() => this.random());
  }

  /** mulberry32 over `prng`: fast, and identical on every platform. */
  private random(): number {
    this.prng = (this.prng + 0x6d2b79f5) | 0;
    let t = this.prng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  get aliveCount(): number {
    return this.invaders.reduce((n, i) => n + (i.alive ? 1 : 0), 0);
  }

  invaderRect(inv: Invader): Rect {
    return {
      x: this.formX + inv.col * COL_PITCH,
      y: this.formY + inv.row * ROW_PITCH,
      w: INVADER_W * PX,
      h: INVADER_H * PX,
    };
  }

  playerRect(): Rect {
    const w = SHIP_SIZE.w * PX;
    const h = SHIP_SIZE.h * PX;
    return { x: this.playerX - w / 2, y: PLAYER_Y - h / 2, w, h };
  }

  bankRect(): Rect | null {
    if (!this.bank) return null;
    return { x: this.bank.x, y: BANK_Y, w: BANK_SIZE.w * PX, h: BANK_SIZE.h * PX };
  }

  startGame(seed = randomSeed()): void {
    this.seed = seed;
    this.prng = seed | 0;
    this.log = [];
    this.recording = true;
    this.score = 0;
    this.nextLife = EXTRA_LIFE_EVERY;
    this.lives = 3;
    this.wave = 1;
    this.events.push({ type: "start" });
    this.startWave();
  }

  startWave(): void {
    this.invaders = createFormation();
    const formationWidth = (COLS - 1) * COL_PITCH + INVADER_W * PX;
    this.formX = Math.round((WIDTH - formationWidth) / 2);
    this.formY = FORMATION_TOP + Math.min(4, this.wave - 1) * (ROW_PITCH / 2);
    this.dir = 1;
    this.frame = 0;
    this.shot = null;
    this.bombs = [];
    this.bank = null;
    this.bankTimer = this.nextBankDelay();
    this.bunkers = createBunkers();
    this.playerX = WIDTH / 2;
    this.stepTimer = stepInterval(this.aliveCount, this.wave);
    this.phase = "playing";
  }

  step(input: Input): void {
    this.tick++;
    if (this.recording) this.log.push(encodeInput(input));
    switch (this.phase) {
      case "intro":
        if (input.start) this.phase = "title";
        return;
      case "title":
      case "gameover":
        if (input.start) this.startGame();
        return;
      case "respawn":
        if (--this.phaseTimer <= 0) {
          this.playerX = WIDTH / 2;
          this.bombs = [];
          this.phase = "playing";
        }
        return;
      case "wave":
        if (--this.phaseTimer <= 0) {
          this.wave++;
          this.events.push({ type: "wave", wave: this.wave });
          this.startWave();
        }
        return;
      case "playing":
        this.stepPlaying(input);
    }
  }

  private stepPlaying(input: Input): void {
    this.movePlayer(input);
    this.moveFormation();
    if (this.phase !== "playing") return;
    this.updateShot(input);
    this.updateBombs();
    if (this.phase !== "playing") return;
    this.updateBank();
    if (this.aliveCount === 0) {
      this.phase = "wave";
      this.phaseTimer = WAVE_CLEAR_TICKS;
    }
  }

  private movePlayer(input: Input): void {
    const half = (SHIP_SIZE.w * PX) / 2;
    if (input.left) this.playerX -= PLAYER_SPEED;
    if (input.right) this.playerX += PLAYER_SPEED;
    this.playerX = Math.max(MARGIN + half, Math.min(WIDTH - MARGIN - half, this.playerX));
  }

  private formationBounds(): Rect | null {
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const inv of this.invaders) {
      if (!inv.alive) continue;
      const r = this.invaderRect(inv);
      left = Math.min(left, r.x);
      right = Math.max(right, r.x + r.w);
      top = Math.min(top, r.y);
      bottom = Math.max(bottom, r.y + r.h);
    }
    return left === Infinity ? null : { x: left, y: top, w: right - left, h: bottom - top };
  }

  private moveFormation(): void {
    if (--this.stepTimer > 0) return;
    const b = this.formationBounds();
    if (!b) return;
    const atEdge = this.dir > 0 ? b.x + b.w + FORMATION_STEP_X > WIDTH - MARGIN : b.x - FORMATION_STEP_X < MARGIN;
    if (atEdge) {
      this.formY += FORMATION_DROP;
      this.dir = this.dir > 0 ? -1 : 1;
    } else {
      this.formX += FORMATION_STEP_X * this.dir;
    }
    this.frame = this.frame ? 0 : 1;
    this.stepTimer = stepInterval(this.aliveCount, this.wave);
    this.events.push({ type: "step" });

    const after = this.formationBounds();
    if (after && after.y + after.h >= PLAYER_Y - 10) this.endGame();
    for (const bunker of this.bunkers) this.crushBunker(bunker);
  }

  private updateShot(input: Input): void {
    if (!this.shot) {
      if (input.fire) {
        this.shot = { x: this.playerX - SHOT_RECT.w / 2, y: PLAYER_Y - 22, vy: -SHOT_SPEED };
        this.events.push({ type: "shoot" });
      }
      return;
    }
    const s = this.shot;
    s.y += s.vy;
    const r: Rect = { x: s.x, y: s.y, ...SHOT_RECT };
    if (s.y + SHOT_RECT.h < 0) { this.shot = null; return; }
    if (this.hitBunker(r)) { this.shot = null; return; }
    for (const inv of this.invaders) {
      if (inv.alive && rectsOverlap(r, this.invaderRect(inv))) {
        inv.alive = false;
        this.addScore(inv.kind.points);
        this.events.push({ type: "kill", points: inv.kind.points, kind: inv.kind });
        this.shot = null;
        // Speed up immediately, as the original did.
        this.stepTimer = Math.min(this.stepTimer, stepInterval(this.aliveCount, this.wave));
        return;
      }
    }
    const bankRect = this.bankRect();
    if (bankRect && rectsOverlap(r, bankRect)) {
      const points = BANK_POINTS[Math.floor(this.rng() * BANK_POINTS.length)] ?? 100;
      this.addScore(points);
      this.events.push({ type: "bank", points });
      this.bank = null;
      this.bankTimer = this.nextBankDelay();
      this.shot = null;
    }
  }

  private updateBombs(): void {
    const bombChance = 0.012 + (this.wave - 1) * 0.004;
    if (this.bombs.length < MAX_BOMBS && this.rng() < bombChance) this.dropBomb();
    const player = this.playerRect();
    this.bombs = this.bombs.filter((b) => {
      b.y += BOMB_SPEED;
      const r: Rect = { x: b.x, y: b.y, ...SHOT_RECT };
      if (b.y > HEIGHT) return false;
      if (this.hitBunker(r)) return false;
      if (rectsOverlap(r, player)) { this.loseLife(); return false; }
      return true;
    });
  }

  private dropBomb(): void {
    const columns = new Set<number>();
    for (const inv of this.invaders) if (inv.alive) columns.add(inv.col);
    if (columns.size === 0) return;
    const col = [...columns][Math.floor(this.rng() * columns.size)];
    let lowest: Invader | null = null;
    for (const inv of this.invaders) {
      if (inv.alive && inv.col === col && (!lowest || inv.row > lowest.row)) lowest = inv;
    }
    if (!lowest) return;
    const r = this.invaderRect(lowest);
    this.bombs.push({ x: r.x + r.w / 2 - SHOT_RECT.w / 2, y: r.y + r.h, vy: BOMB_SPEED });
  }

  private updateBank(): void {
    if (this.bank) {
      this.bank.x += BANK_SPEED * this.bank.dir;
      const w = BANK_SIZE.w * PX;
      if (this.bank.x > WIDTH + w || this.bank.x < -w * 2) {
        this.bank = null;
        this.bankTimer = this.nextBankDelay();
      }
      return;
    }
    if (--this.bankTimer <= 0 && this.aliveCount > 6) {
      const dir: 1 | -1 = this.rng() < 0.5 ? 1 : -1;
      this.bank = { x: dir > 0 ? -BANK_SIZE.w * PX : WIDTH, dir };
    }
  }

  private nextBankDelay(): number {
    return 900 + Math.floor(this.rng() * 900);
  }

  /** Add points, awarding an extra life each time the score crosses a multiple of EXTRA_LIFE_EVERY. */
  addScore(points: number): void {
    this.score += points;
    while (this.score >= this.nextLife) {
      this.lives++;
      this.nextLife += EXTRA_LIFE_EVERY;
      this.events.push({ type: "life", lives: this.lives });
    }
  }

  private loseLife(): void {
    this.lives--;
    this.shot = null;
    this.events.push({ type: "hit", livesLeft: this.lives });
    if (this.lives <= 0) {
      this.endGame();
    } else {
      this.phase = "respawn";
      this.phaseTimer = RESPAWN_TICKS;
    }
  }

  private endGame(): void {
    this.recording = false;
    this.phase = "gameover";
    this.events.push({ type: "gameover", score: this.score, wave: this.wave });
  }

  /** Erase a blob of bunker cells where a shot lands. Returns true if anything was hit. */
  private hitBunker(r: Rect): boolean {
    for (const bunker of this.bunkers) {
      const bw = BUNKER_SIZE.w * PX, bh = BUNKER_SIZE.h * PX;
      if (!rectsOverlap(r, { x: bunker.x, y: bunker.y, w: bw, h: bh })) continue;
      // Scan the shot's column of cells for the first solid one.
      const cx = Math.floor((r.x + r.w / 2 - bunker.x) / PX);
      const y0 = Math.max(0, Math.floor((r.y - bunker.y) / PX));
      const y1 = Math.min(BUNKER_SIZE.h - 1, Math.floor((r.y + r.h - bunker.y) / PX));
      for (let cy = y0; cy <= y1; cy++) {
        if (bunker.cells[cy * BUNKER_SIZE.w + cx]) {
          this.eraseBlob(bunker, cx, cy);
          return true;
        }
      }
    }
    return false;
  }

  private eraseBlob(bunker: Bunker, cx: number, cy: number): void {
    const r = ERASE_RADIUS;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d > r + 1 || (d === r + 1 && this.rng() < 0.5)) continue;
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < BUNKER_SIZE.w && y >= 0 && y < BUNKER_SIZE.h) bunker.cells[y * BUNKER_SIZE.w + x] = 0;
      }
    }
  }

  /** Invaders that walk into a bunker flatten it. */
  private crushBunker(bunker: Bunker): void {
    const bw = BUNKER_SIZE.w * PX, bh = BUNKER_SIZE.h * PX;
    const bRect = { x: bunker.x, y: bunker.y, w: bw, h: bh };
    for (const inv of this.invaders) {
      if (!inv.alive) continue;
      const r = this.invaderRect(inv);
      if (!rectsOverlap(r, bRect)) continue;
      const x0 = Math.max(0, Math.floor((r.x - bunker.x) / PX));
      const x1 = Math.min(BUNKER_SIZE.w - 1, Math.floor((r.x + r.w - bunker.x) / PX));
      const y0 = Math.max(0, Math.floor((r.y - bunker.y) / PX));
      const y1 = Math.min(BUNKER_SIZE.h - 1, Math.floor((r.y + r.h - bunker.y) / PX));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) bunker.cells[y * BUNKER_SIZE.w + x] = 0;
    }
  }
}

// ---- Recording and replay -------------------------------------------------------------------
//
// A game is fully determined by its seed and the input on each tick, so the verifier can replay
// a recorded game from scratch and check the claimed score (see verifier/attest.ts).

export const encodeInput = (i: Input): number => (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.fire ? 4 : 0) | (i.start ? 8 : 0);
export const decodeInput = (c: number): Input => ({ left: (c & 1) !== 0, right: (c & 2) !== 0, fire: (c & 4) !== 0, start: (c & 8) !== 0 });

/** A random 32-bit seed. */
export function randomSeed(): number {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return Math.floor(Math.random() * 4294967296);
}

/** Run-length text form of a log: "code*count" pairs, e.g. "0*120,4*3,5*40". */
export function encodeLog(log: readonly number[]): string {
  const runs: string[] = [];
  for (let i = 0; i < log.length;) {
    const code = log[i]!;
    let end = i;
    while (end < log.length && log[end] === code) end++;
    runs.push(`${code}*${end - i}`);
    i = end;
  }
  return runs.join(",");
}

/** Inverse of encodeLog. Throws on malformed text or a log longer than `maxTicks`. */
export function decodeLog(text: string, maxTicks = 1_000_000): number[] {
  const log: number[] = [];
  if (text === "") return log;
  for (const run of text.split(",")) {
    const m = /^(\d{1,2})\*(\d{1,7})$/.exec(run);
    const code = m ? Number(m[1]) : -1;
    const count = m ? Number(m[2]) : 0;
    if (!m || code > 15 || count === 0) throw new Error(`bad input log near "${run.slice(0, 20)}"`);
    if (log.length + count > maxTicks) throw new Error("input log too long");
    for (let i = 0; i < count; i++) log.push(code);
  }
  return log;
}

/** Replay a recorded game from its seed. The result's phase is "gameover" when the log ran to the end of a game. */
export function replay(seed: number, log: readonly number[]): Sim {
  const sim = new Sim();
  sim.startGame(seed);
  for (const code of log) sim.step(decodeInput(code));
  return sim;
}
