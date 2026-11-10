import { describe, expect, it } from "vitest";
import { ADVENT_DAYS, ADVENT_START, adventDay, adventImageUrl, adventName } from "./advent";

describe("advent calendar", () => {
  it("maps the clock onto doors 0-24 and nothing outside December 1-25", () => {
    expect(adventDay(ADVENT_START - 1)).toBeNull();
    expect(adventDay(ADVENT_START)).toBe(0);
    expect(adventDay(ADVENT_START + 86_400_000 * 24 + 1)).toBe(24);
    expect(adventDay(ADVENT_START + 86_400_000 * 25)).toBeNull();
    expect(new Date(ADVENT_START).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(ADVENT_DAYS).toBe(25);
  });

  it("names doors and images by calendar day", () => {
    expect(adventName(0)).toBe("TezInvaders Advent · 1 December");
    expect(adventImageUrl(24, "https://x/")).toBe("https://x/advent/25.svg");
  });
});
