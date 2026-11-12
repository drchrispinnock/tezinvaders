import { describe, expect, it } from "vitest";
import { SEED_TAG_DAY, SEED_TAG_ROUND, seedFor } from "./seed";

describe("seedFor", () => {
  it("is a stable 32-bit value that changes with every input", () => {
    const kt = "KT1Ef9JmLVJNxbm8rezpAJ8cxX78V3yLFMSs", tz = "tz1hr6Dvx4i686RFishFTWPeby949bjrV9KF";
    const s = seedFor(kt, tz, 1, SEED_TAG_ROUND);
    expect(Number.isInteger(s) && s >= 0 && s <= 0xffffffff).toBe(true);
    expect(seedFor(kt, tz, 1, SEED_TAG_ROUND)).toBe(s);
    expect(seedFor(kt, tz, 2, SEED_TAG_ROUND)).not.toBe(s);
    expect(seedFor(kt, tz, 1, SEED_TAG_DAY)).not.toBe(s);
    expect(seedFor(kt, "tz1N29q5T3jJ2i1JEWHax7q1NRkDMADj6fof", 1, SEED_TAG_ROUND)).not.toBe(s);
  });
});
