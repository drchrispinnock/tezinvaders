import { INTRO_PARAGRAPHS, INTRO_PROMPT, INTRO_TITLE } from "./intro";
import { drawLogo, logoWidth } from "./logo";
import {
  BANK, BANK_COLOR, BANK_SHADE, BUNKER_BADGE_COLOR, BUNKER_COLOR, PX, ROW_KINDS, SHIP, SHIP_BADGE, SHIP_BADGE_COLOR, SHIP_COLOR,
  type Bitmap,
} from "./sprites";
import { BUNKER_SIZE, HEIGHT, PLAYER_Y, SHIP_SIZE, SHOT_RECT, WIDTH, type Sim } from "./sim";

const FONT = "'Press Start 2P', ui-monospace, monospace";
const BANK_Y = 44;
const LIFE_SCALE = 1.5;
const FADE_END = 0.3; // crawl lines vanish once they shrink to this scale

export class Renderer {
  /** On Tezos X (L2) the ꜩ marks get a small X beside them. */
  layer2 = false;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas not supported");
    this.ctx = ctx;
    this.fitBackingStore();
    window.addEventListener("resize", () => this.fitBackingStore());
  }

  /**
   * Size the backing store to the device's pixels so sprites and text stay sharp on
   * HiDPI screens. The game keeps drawing in the fixed 560x640 logical space; CSS owns
   * the displayed width, and height follows from the canvas's aspect ratio.
   */
  private fitBackingStore(): void {
    const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
    if (dpr === this.dpr && this.canvas.width === WIDTH * dpr) return;
    this.dpr = dpr;
    this.canvas.width = Math.round(WIDTH * dpr);
    this.canvas.height = Math.round(HEIGHT * dpr);
    this.canvas.style.width = `${WIDTH}px`;
  }

  draw(sim: Sim, hiScore: number, staked: boolean, muted = false): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (sim.phase === "intro") {
      this.drawIntro(sim);
      return;
    }
    this.drawHud(sim, hiScore, staked);
    if (sim.phase === "title") {
      this.drawTitle();
      return;
    }

    for (const inv of sim.invaders) {
      if (!inv.alive) continue;
      const r = sim.invaderRect(inv);
      this.blit(inv.kind.frames[sim.frame], r.x, r.y, inv.kind.color);
    }

    if (sim.bank) {
      this.blit(BANK, sim.bank.x, BANK_Y, BANK_COLOR, PX, BANK_SHADE);
    }

    for (const b of sim.bunkers) {
      for (let y = 0; y < BUNKER_SIZE.h; y++) {
        for (let x = 0; x < BUNKER_SIZE.w; x++) {
          const cell = b.cells[y * BUNKER_SIZE.w + x];
          if (!cell) continue;
          ctx.fillStyle = cell === 2 ? BUNKER_BADGE_COLOR : BUNKER_COLOR;
          ctx.fillRect(b.x + x * PX, b.y + y * PX, PX, PX);
        }
      }
    }

    if (sim.phase !== "respawn" || Math.floor(sim.tick / 6) % 2 === 0) {
      const p = sim.playerRect();
      this.drawShip(p.x, p.y, PX);
    }

    ctx.fillStyle = "#fff";
    if (sim.shot) ctx.fillRect(sim.shot.x, sim.shot.y, SHOT_RECT.w, SHOT_RECT.h);
    ctx.fillStyle = "#ff8c42";
    for (const b of sim.bombs) {
      // zig-zag bomb
      const z = Math.floor(sim.tick / 4) % 2 ? 2 : -2;
      ctx.fillRect(b.x + z, b.y, SHOT_RECT.w, 4);
      ctx.fillRect(b.x - z, b.y + 4, SHOT_RECT.w, 4);
    }

    ctx.fillStyle = "#3ddc84";
    ctx.fillRect(0, HEIGHT - 28, WIDTH, 2);
    if (muted) {
      ctx.fillStyle = "#7f88a8";
      ctx.font = `7px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("SOUND OFF · M", WIDTH / 2, HEIGHT - 10);
    }

    if (sim.phase === "gameover") this.overlay("GAME OVER", `SCORE ${sim.score}  ·  ENTER TO RETRY`);
    else if (sim.phase === "wave") this.overlay(`WAVE ${sim.wave} CLEARED`, "THE FIAT REGROUP…");
  }

  private drawHud(sim: Sim, hiScore: number, staked: boolean): void {
    const ctx = this.ctx;
    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = "#e6e9f5";
    ctx.textAlign = "left";
    ctx.fillText(`SCORE ${sim.score}`, 12, 22);
    ctx.textAlign = "center";
    ctx.fillText(`HI ${Math.max(hiScore, sim.score)}`, WIDTH / 2, 22);
    ctx.textAlign = "right";
    ctx.fillText(`WAVE ${sim.wave}`, WIDTH - 12, 22);

    ctx.textAlign = "left";
    ctx.fillText(`${sim.lives}`, 12, HEIGHT - 10);
    const lifeW = SHIP_SIZE.w * LIFE_SCALE;
    for (let i = 0; i < Math.max(0, sim.lives - 1); i++) {
      this.drawShip(30 + i * (lifeW + 8), HEIGHT - 24, LIFE_SCALE);
    }
    if (staked) {
      const markH = 13;
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffd34d";
      const xW = this.layer2 ? 9 : 0;
      ctx.fillText("STAKED", WIDTH - 12 - xW - logoWidth(markH) - 6, HEIGHT - 10);
      this.drawMark(WIDTH - 12 - xW - logoWidth(markH), HEIGHT - 10 - markH + 1, markH, "#ffd34d");
    }
  }

  /**
   * The introduction splash as an opening crawl: the mark, heading and copy from intro.ts
   * rise from the bottom, shrink towards a vanishing point at the top and fade out, in
   * yellow over a starfield. Driven by `sim.tick` so it is deterministic; loops when done.
   */
  private drawIntro(sim: Sim): void {
    const ctx = this.ctx;
    const yellow = "#ffd34d";
    this.drawStars(sim.tick);

    // Lay the crawl out on a flat plane first: each item has a y (0 = plane origin) and a drawer.
    const bodyFont = `14px ${FONT}`; // at the bottom edge the plane is drawn 1:1, so this is the entry size
    ctx.font = bodyFont;
    const lineH = 32;
    const items: { y: number; draw: () => void }[] = [];
    let y = 0;
    items.push({ y, draw: () => drawLogo(ctx, -logoWidth(80) / 2, -80, 80, yellow) });
    y += 52;
    items.push({ y, draw: () => { ctx.font = `30px ${FONT}`; ctx.fillText(INTRO_TITLE, 0, 0); } });
    y += lineH * 1.5;
    for (const paragraph of INTRO_PARAGRAPHS) {
      for (const line of this.wrap(paragraph, WIDTH - 40)) {
        const text = line;
        items.push({ y, draw: () => { ctx.font = bodyFont; ctx.fillText(text, 0, 0); } });
        y += lineH;
      }
      y += lineH;
    }
    const planeLength = y;

    // Scroll the plane past the viewer, then start again after a pause.
    const speed = 0.6; // flat pixels per tick: a new line enters roughly every 0.9 s
    const cycle = planeLength + HEIGHT * 2.7; // long enough for the last line to fade before the loop restarts
    const scroll = (sim.tick * speed) % cycle;

    const horizon = 60; // the vanishing point's screen y
    const depthK = 1.1; // smaller = steeper perspective
    ctx.fillStyle = yellow;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (const item of items) {
      const flatY = HEIGHT + item.y - scroll; // where the item would sit on an unprojected plane
      const u = (HEIGHT - flatY) / HEIGHT; // distance up the plane, 0 at the bottom edge
      if (u < -0.1) continue; // still below the screen
      const scale = depthK / (u + depthK);
      if (scale < FADE_END) continue; // past the vanishing point
      const screenY = horizon + (HEIGHT - horizon) * scale;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, (scale - FADE_END) / 0.2));
      ctx.translate(WIDTH / 2, screenY);
      ctx.scale(scale, scale);
      ctx.fillStyle = yellow;
      item.draw();
      ctx.restore();
    }

    // The prompt sits above the vanishing point, where the crawl has already faded out.
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillStyle = Math.floor(Date.now() / 500) % 2 ? yellow : "#7f88a8";
    ctx.fillText(INTRO_PROMPT, WIDTH / 2, 30);
  }

  /** A fixed, deterministic starfield with a slow twinkle. */
  private drawStars(tick: number): void {
    const ctx = this.ctx;
    let seed = 1234567;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 90; i++) {
      const x = rand() * WIDTH, y = rand() * HEIGHT, size = rand() < 0.2 ? 2 : 1;
      const phase = rand() * 200;
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin((tick + phase) / 60));
      ctx.fillStyle = `rgba(230,233,245,${twinkle.toFixed(2)})`;
      ctx.fillRect(Math.floor(x), Math.floor(y), size, size);
    }
  }

  /** Greedy word wrap using the current font. */
  private wrap(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && this.ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /** The ꜩ mark, with an X at its shoulder when playing on Tezos X. */
  private drawMark(x: number, y: number, h: number, color?: string): void {
    drawLogo(this.ctx, x, y, h, color);
    if (!this.layer2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${Math.round(h * 0.42)}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffd34d";
    ctx.fillText("X", x + logoWidth(h) + h * 0.06, y + h * 0.4);
    ctx.restore();
  }

  private drawTitle(): void {
    const ctx = this.ctx;
    const markH = 84;
    this.drawMark((WIDTH - logoWidth(markH)) / 2, 48, markH);

    ctx.textAlign = "center";
    ctx.fillStyle = SHIP_COLOR;
    ctx.font = `32px ${FONT}`;
    ctx.fillText("TEZINVADERS", WIDTH / 2, 178);
    ctx.fillStyle = "#e6e9f5";
    ctx.font = `10px ${FONT}`;
    ctx.fillText("THE FIAT ARE COMING", WIDTH / 2, 210);

    ctx.font = `10px ${FONT}`;
    ctx.fillText("* SCORE ADVANCE TABLE *", WIDTH / 2, 270);
    const kinds = [...new Set(ROW_KINDS)];
    kinds.forEach((kind, i) => {
      const y = 296 + i * 46;
      this.blit(kind.frames[0], WIDTH / 2 - 110, y, kind.color);
      ctx.fillStyle = "#e6e9f5";
      ctx.textAlign = "left";
      ctx.fillText(`${kind.name} = ${kind.points} POINTS`, WIDTH / 2 - 60, y + 22);
    });
    const y = 296 + kinds.length * 46;
    this.blit(BANK, WIDTH / 2 - 118, y - 4, BANK_COLOR, PX, BANK_SHADE);
    ctx.fillStyle = "#e6e9f5";
    ctx.textAlign = "left";
    ctx.fillText("= ? MYSTERY", WIDTH / 2 - 60, y + 22);

    ctx.textAlign = "center";
    ctx.fillStyle = Math.floor(Date.now() / 500) % 2 ? "#ffd34d" : "#7f88a8";
    ctx.fillText("PRESS ENTER TO START", WIDTH / 2, HEIGHT - 60);
  }

  private overlay(title: string, sub: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, PLAYER_Y - 220, WIDTH, 110);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd34d";
    ctx.font = `22px ${FONT}`;
    ctx.fillText(title, WIDTH / 2, PLAYER_Y - 170);
    ctx.fillStyle = "#e6e9f5";
    ctx.font = `9px ${FONT}`;
    ctx.fillText(sub, WIDTH / 2, PLAYER_Y - 135);
  }

  /** The cannon with the Tezos mark painted on its slab; `scale` is canvas pixels per sprite pixel. */
  private drawShip(x: number, y: number, scale: number): void {
    this.blit(SHIP, x, y, SHIP_COLOR, scale);
    const h = SHIP_BADGE.h * scale;
    drawLogo(this.ctx, Math.round(x) + SHIP_BADGE.cx * scale - logoWidth(h) / 2, Math.round(y) + SHIP_BADGE.y * scale, h, SHIP_BADGE_COLOR);
  }

  /** Draw a bitmap: '#' pixels in `color`, 'o' pixels in `altColor` (defaults to `color`). */
  private blit(bitmap: Bitmap, x: number, y: number, color: string, scale = PX, altColor = color): void {
    const ctx = this.ctx;
    const x0 = Math.round(x), y0 = Math.round(y);
    for (let row = 0; row < bitmap.length; row++) {
      const line = bitmap[row] ?? "";
      for (let col = 0; col < line.length; col++) {
        const c = line[col];
        if (c !== "#" && c !== "o") continue;
        ctx.fillStyle = c === "#" ? color : altColor;
        ctx.fillRect(x0 + col * scale, y0 + row * scale, scale, scale);
      }
    }
  }
}
