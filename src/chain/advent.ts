// The Advent calendar: 25 doors, 1 to 25 December. A ticket holder whose attested score that day
// is over ADVENT_THRESHOLD claims the door's FA2 token (ids ADVENT_FIRST_TOKEN + day), once per
// door. The contract keeps the start timestamp and first token id (set_advent), so the calendar
// can run again another year with fresh ids. Door images live under public/badges/advent/NN.svg
// (contract/scripts/advent-image.ts generates placeholders).

import { BADGE_IMAGE_BASE } from "./badges.ts";

export const ADVENT_DAYS = 25;
export const ADVENT_THRESHOLD = 500;
/** Token ids 100–124 for the first calendar; badges use 0–4. */
export const ADVENT_FIRST_TOKEN = 100;
/** 1 December 2026, 00:00 UTC. */
export const ADVENT_START = Date.UTC(2026, 11, 1);

export const adventImageUrl = (day: number, base = BADGE_IMAGE_BASE): string => `${base}advent/${String(day + 1).padStart(2, "0")}.svg`;
export const adventName = (day: number): string => `TezInvaders Advent · ${day + 1} December`;
export const adventDescription = (day: number): string =>
  `Door ${day + 1} of the TezInvaders Advent calendar: scored over ${ADVENT_THRESHOLD} points on ${day + 1} December.`;

/** The door open at `now` (0-based day), or null outside the calendar; `start` in ms. */
export function adventDay(now: number, start = ADVENT_START): number | null {
  const day = Math.floor((now - start) / 86_400_000);
  return day >= 0 && day < ADVENT_DAYS ? day : null;
}
