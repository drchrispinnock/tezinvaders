import { describe, expect, it } from "vitest";
import { CHAINS, DEFAULT_NETWORK, NETWORKS, NETWORK_LIST, isNetworkName, networkFor, networkFromPath, pathFor } from "./config";

describe("networks", () => {
  it("maps every chain/layer pair onto a configured network and back", () => {
    for (const n of NETWORK_LIST) {
      expect(networkFor(n.chain, n.layer)).toBe(n.name);
      expect(isNetworkName(n.name)).toBe(true);
      expect(networkFromPath(n.path)).toBe(n.name);
      expect(networkFromPath(n.path + "/")).toBe(n.name);
      expect(pathFor(n.name)).toBe(n.path);
    }
    expect(networkFor("shadownet", "l2")).toBe("tezosx-shadownet");
    expect(isNetworkName("ghostnet")).toBe(false);
    expect(networkFromPath("/")).toBeUndefined();
    expect(networkFromPath("/nonsense")).toBeUndefined();
    expect(NETWORKS[DEFAULT_NETWORK]).toBeDefined();
    expect(CHAINS.find((c) => c.name === "shadownet")?.hasL2).toBe(true);
    expect(CHAINS.find((c) => c.name === "ushuaianet")?.hasL2).toBe(false);
  });

  it("names Octez Connect network types and has what the verifier and indexer need", () => {
    for (const n of NETWORK_LIST) {
      expect(n.name).toMatch(/^(tezosx-)?[a-z]+$/);
      if (n.connectType) expect(n.connectType).toBe("custom");
      expect(n.chainId).toMatch(/^Net[1-9A-HJ-NP-Za-km-z]{12}$/);
      expect(n.rpcUrl).toMatch(/^https:\/\//);
      expect(n.tzktApi).toMatch(/^https:\/\//);
      expect(n.path.startsWith("/")).toBe(true);
    }
  });
});
