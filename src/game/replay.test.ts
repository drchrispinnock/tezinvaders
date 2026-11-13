import { describe, expect, it } from "vitest";
import { Sim, decodeInput, decodeLog, encodeInput, encodeLog, replay, type Input } from "./sim";

const IDLE: Input = { left: false, right: false, fire: false, start: false };

/** Plays a seeded game with a simple scripted pilot until it ends (or `max` ticks). */
function playGame(seed: number, max = 60_000): Sim {
  const sim = new Sim();
  sim.step({ ...IDLE, start: true }); // intro -> title
  sim.startGame(seed);
  for (let t = 0; t < max && sim.phase !== "gameover"; t++) {
    const phase = Math.floor(t / 90) % 4;
    sim.step({ left: phase === 1, right: phase === 3, fire: t % 7 === 0, start: false });
  }
  return sim;
}

describe("recording and replay", () => {
  it("input codes round-trip", () => {
    for (let c = 0; c < 16; c++) expect(encodeInput(decodeInput(c))).toBe(c);
  });

  it("log text round-trips and rejects garbage", () => {
    const log = [0, 0, 0, 4, 4, 5, 0, 12];
    expect(encodeLog(log)).toBe("0*3,4*2,5*1,0*1,12*1");
    expect(decodeLog(encodeLog(log))).toEqual(log);
    expect(decodeLog("")).toEqual([]);
    expect(() => decodeLog("0*3,x")).toThrow(/bad input log/);
    expect(() => decodeLog("16*1")).toThrow(/bad input log/);
    expect(() => decodeLog("0*5", 4)).toThrow(/too long/);
  });

  it("a game ends and replays to the same score from its seed and log", () => {
    const game = playGame(12345);
    expect(game.phase).toBe("gameover");
    expect(game.score).toBeGreaterThan(0);
    expect(game.log.length).toBeGreaterThan(100);
    const { sim: again, consumed } = replay(game.seed, decodeLog(encodeLog(game.log)));
    expect(again.phase).toBe("gameover");
    expect(again.score).toBe(game.score);
    expect(again.wave).toBe(game.wave);
    expect(consumed).toBe(game.log.length);
  });

  it("a different seed or a tampered log gives a different game", () => {
    const game = playGame(777);
    const other = replay(778, game.log).sim;
    const tampered = replay(777, game.log.slice(0, -200)).sim;
    expect(other.score === game.score && other.phase === game.phase && other.log.length === game.log.length).toBe(false);
    expect(tampered.phase).not.toBe("gameover");
  });

  it("replays one game only: a restart hidden after game over is never stepped", () => {
    const game = playGame(31337);
    const padded = [...game.log, 0, 0, 8, ...game.log]; // wait, press start, play again
    const { sim, consumed } = replay(game.seed, padded);
    expect(consumed).toBe(game.log.length);
    expect(sim.seed).toBe(game.seed);
    expect(sim.score).toBe(game.score);
  });

  it("stops recording at game over and starts afresh with the next game", () => {
    const game = playGame(99);
    const len = game.log.length;
    game.step(IDLE);
    expect(game.log.length).toBe(len);
    game.step({ ...IDLE, start: true });
    expect(game.log).toEqual([]);
    expect(game.seed).not.toBe(99);
  });
});
