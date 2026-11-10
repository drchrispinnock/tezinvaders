import { afterEach, describe, expect, it, vi } from "vitest";
import { aliasOf, clearAliasCache, mergeLeader, resolveAliases } from "./tzkt";

const reply = (body: unknown, ok = true) => ({ ok, json: async () => body }) as unknown as Response;

describe("resolveAliases", () => {
  afterEach(clearAliasCache);

  it("names the addresses TzKT knows and remembers the rest as unnamed", async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request) => reply([{ address: "tz1a", alias: "Ms BLS" }, { address: "tz1b", alias: null }]));
    expect(await resolveAliases(["tz1a", "tz1b", "tz1c", "tz1a"], fetchFn)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain("address.in=tz1a,tz1b,tz1c");
    expect(aliasOf("tz1a")).toBe("Ms BLS");
    expect(aliasOf("tz1b")).toBeUndefined();
    expect(aliasOf("tz1c")).toBeUndefined();
    // Everything is cached now: no second request.
    expect(await resolveAliases(["tz1a", "tz1c"], fetchFn)).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("leaves addresses unresolved when TzKT fails, so they are retried later", async () => {
    const failing = vi.fn(async (_url: string | URL | Request) => { throw new Error("offline"); });
    expect(await resolveAliases(["tz1a"], failing)).toBe(false);
    expect(aliasOf("tz1a")).toBeUndefined();
    const working = vi.fn(async (_url: string | URL | Request) => reply([{ address: "tz1a", alias: "boot1" }]));
    expect(await resolveAliases(["tz1a"], working)).toBe(true);
    expect(aliasOf("tz1a")).toBe("boot1");
  });
});

describe("mergeLeader", () => {
  it("replaces a stale indexer row with the chain's leader instead of duplicating it", () => {
    const rows = [{ address: "tz1a", score: 500 }, { address: "tz5b", score: 0 }];
    expect(mergeLeader(rows, { address: "tz5b", score: 280 })).toEqual([{ address: "tz1a", score: 500 }, { address: "tz5b", score: 280 }]);
    expect(mergeLeader(rows, { address: "tz1c", score: 900 })[0]).toEqual({ address: "tz1c", score: 900 });
    expect(mergeLeader(rows, { address: "tz1a", score: 100 })).toEqual(rows);
    expect(mergeLeader(rows, null, 1)).toEqual([{ address: "tz1a", score: 500 }]);
  });
});
