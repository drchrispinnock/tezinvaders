import { afterEach, describe, expect, it, vi } from "vitest";
import { aliasOf, clearAliasCache, mergeLeader, resolveAliases } from "./tzkt";

const A = "tz1N29q5T3jJ2i1JEWHax7q1NRkDMADj6fof", B = "tz1gUCWWwmwEpc7eVd4NHy3UhL28K4j9L6jy", C = "tz1hr6Dvx4i686RFishFTWPeby949bjrV9KF";
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body }) as unknown as Response;

describe("resolveAliases", () => {
  afterEach(clearAliasCache);

  it("names the addresses TzKT knows and remembers the rest as unnamed", async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request) => reply([{ address: A, alias: "Ms BLS" }, { address: B, alias: null }, { address: "tz1nope", alias: "<b>x</b>" }]));
    expect(await resolveAliases([A, B, C, A], fetchFn)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain(`address.in=${A},${B},${C}`);
    expect(aliasOf(A)).toBe("Ms BLS");
    expect(aliasOf(B)).toBeUndefined();
    expect(aliasOf(C)).toBeUndefined();
    expect(aliasOf("tz1nope")).toBeUndefined(); // malformed addresses from the indexer are ignored
    // Everything is cached now: no second request.
    expect(await resolveAliases([A, C], fetchFn)).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("leaves addresses unresolved when TzKT fails, so they are retried later", async () => {
    const failing = vi.fn(async (_url: string | URL | Request) => { throw new Error("offline"); });
    expect(await resolveAliases([A], failing)).toBe(false);
    expect(aliasOf(A)).toBeUndefined();
    const working = vi.fn(async (_url: string | URL | Request) => reply([{ address: A, alias: "boot1" }]));
    expect(await resolveAliases([A], working)).toBe(true);
    expect(aliasOf(A)).toBe("boot1");
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
