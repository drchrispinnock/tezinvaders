import { describe, expect, it } from "vitest";
import { decodeLeader } from "./contract";

const score = { toNumber: () => 42, toString: () => "42" } as unknown as import("bignumber.js").default;

describe("decodeLeader", () => {
  it("handles None, a wrapped Some and a bare record", () => {
    expect(decodeLeader(null)).toBeNull();
    expect(decodeLeader(undefined)).toBeNull();
    expect(decodeLeader({ Some: { player: "tz1a", score } })).toEqual({ address: "tz1a", score: 42 });
    expect(decodeLeader({ player: "tz1b", score })).toEqual({ address: "tz1b", score: 42 });
  });
});
