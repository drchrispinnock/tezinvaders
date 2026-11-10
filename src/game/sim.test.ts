import { describe, expect, it } from "vitest";
import { BUNKER_SIZE, COLS, HEIGHT, PLAYER_Y, ROWS, Sim, WIDTH, createFormation, rectsOverlap, stepInterval, type Input } from "./sim";
import { KINDS, PX } from "./sprites";

const IDLE: Input = { left: false, right: false, fire: false, start: false };
const never = () => 0.999; // rng that never drops bombs or spawns the bank

function playing(): Sim {
  const sim = new Sim(never);
  sim.step({ ...IDLE, start: true }); // intro -> title
  sim.step({ ...IDLE, start: true }); // title -> playing
  return sim;
}

describe("intro", () => {
  it("starts on the splash and needs one press to reach the title, another to play", () => {
    const sim = new Sim(never);
    expect(sim.phase).toBe("intro");
    sim.step(IDLE);
    expect(sim.phase).toBe("intro");
    sim.step({ ...IDLE, start: true });
    expect(sim.phase).toBe("title");
    expect(sim.events).toHaveLength(0);
    sim.step({ ...IDLE, start: true });
    expect(sim.phase).toBe("playing");
  });
});

describe("formation", () => {
  it("builds a full grid with the yen on top and dollars at the bottom", () => {
    const f = createFormation();
    expect(f).toHaveLength(COLS * ROWS);
    expect(f[0]?.kind).toBe(KINDS.yen);
    expect(f.at(-1)?.kind).toBe(KINDS.dollar);
  });

  it("speeds up as invaders die and on later waves", () => {
    const full = stepInterval(COLS * ROWS, 1);
    expect(full).toBeGreaterThan(stepInterval(10, 1));
    expect(stepInterval(1, 1)).toBe(1);
    expect(stepInterval(COLS * ROWS, 3)).toBeLessThan(full);
  });

  it("reverses and drops when it reaches the edge", () => {
    const sim = playing();
    const startY = sim.formY;
    let reversed = false;
    for (let i = 0; i < 60 * 60 && !reversed; i++) {
      sim.step(IDLE);
      if (sim.dir === -1) reversed = true;
    }
    expect(reversed).toBe(true);
    expect(sim.formY).toBeGreaterThan(startY);
  });
});

describe("shooting", () => {
  it("a shot that reaches an invader kills it and scores its points", () => {
    const sim = playing();
    const target = sim.invaders.find((i) => i.row === ROWS - 1 && i.col === 0)!;
    const r = sim.invaderRect(target);
    sim.playerX = r.x + r.w / 2;
    sim.stepTimer = 10_000; // freeze the formation
    sim.bunkers = []; // nothing between the ship and the target
    sim.step({ ...IDLE, fire: true });
    expect(sim.shot).not.toBeNull();
    for (let i = 0; i < 200 && target.alive; i++) sim.step(IDLE);
    expect(target.alive).toBe(false);
    expect(sim.score).toBe(KINDS.dollar.points);
    expect(sim.events.some((e) => e.type === "kill")).toBe(true);
  });

  it("only allows one shot in flight", () => {
    const sim = playing();
    sim.step({ ...IDLE, fire: true });
    const first = sim.shot;
    sim.step({ ...IDLE, fire: true });
    expect(sim.shot).toBe(first);
  });
});

describe("losing", () => {
  it("ends the game when the formation reaches the player", () => {
    const sim = playing();
    sim.formY = PLAYER_Y - 60;
    sim.stepTimer = 1;
    for (let i = 0; i < 200 && sim.phase === "playing"; i++) sim.step(IDLE);
    expect(sim.phase).toBe("gameover");
    expect(sim.events.at(-1)).toMatchObject({ type: "gameover", score: 0 });
  });

  it("a bomb hitting the ship costs a life, then a game at zero lives", () => {
    const sim = playing();
    sim.lives = 1;
    sim.bombs.push({ x: sim.playerX, y: PLAYER_Y - 5, vy: 3 });
    sim.step(IDLE);
    expect(sim.lives).toBe(0);
    expect(sim.phase).toBe("gameover");
  });
});

describe("geometry", () => {
  it("rectsOverlap detects touching edges as non-overlapping", () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 })).toBe(true);
  });

  it("keeps the player inside the canvas", () => {
    const sim = playing();
    for (let i = 0; i < 1000; i++) sim.step({ ...IDLE, right: true });
    expect(sim.playerRect().x + sim.playerRect().w).toBeLessThanOrEqual(WIDTH);
    expect(sim.playerRect().y).toBeLessThan(HEIGHT);
  });
});

describe("barriers", () => {
  it("carry a ꜩ badge that erodes like the rest of the barrier", () => {
    const sim = playing();
    const bunker = sim.bunkers[0]!;
    const badgeCells = [...bunker.cells].filter((c) => c === 2).length;
    expect(badgeCells).toBeGreaterThan(10);
    // Fire straight up through the barrier's centre column until the badge takes damage.
    sim.stepTimer = 10_000;
    sim.playerX = bunker.x + (BUNKER_SIZE.w * PX) / 2;
    for (let i = 0; i < 2000 && [...bunker.cells].filter((c) => c === 2).length === badgeCells; i++) {
      sim.step({ ...IDLE, fire: true });
    }
    expect([...bunker.cells].filter((c) => c === 2).length).toBeLessThan(badgeCells);
  });
});

describe("extra lives", () => {
  it("awards one life each time the score crosses a multiple of 5000", () => {
    const sim = playing();
    sim.events.length = 0;
    sim.addScore(4999);
    expect(sim.lives).toBe(3);
    expect(sim.events.find((e) => e.type === "life")).toBeUndefined();
    sim.addScore(1);
    expect(sim.lives).toBe(4);
    expect(sim.events.filter((e) => e.type === "life")).toEqual([{ type: "life", lives: 4 }]);
    sim.addScore(10_300); // 15300: crosses 10000 and 15000 at once
    expect(sim.lives).toBe(6);
    expect(sim.events.filter((e) => e.type === "life")).toHaveLength(3);
    sim.startGame(); // a new game starts from 3 lives with the counter reset
    expect(sim.lives).toBe(3);
    expect(sim.nextLife).toBe(5000);
  });
});
