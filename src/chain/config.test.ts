import { describe, expect, it } from "vitest";
import { NETWORKS, isNetworkName, networkFor } from "./config";

describe("networks", () => {
  it("maps every chain/layer pair onto a configured network and back", () => {
    for (const n of Object.values(NETWORKS)) {
      expect(networkFor(n.chain, n.layer)).toBe(n.name);
      expect(isNetworkName(n.name)).toBe(true);
    }
    expect(networkFor("shadownet", "l2")).toBe("tezosx-shadownet");
    expect(isNetworkName("ghostnet")).toBe(false);
  });
});
