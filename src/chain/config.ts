// Which Tezos network the app talks to. The URL decides: `/shadownet` is Shadownet L1,
// `/shadownet/tezosx` is Tezos X on Shadownet (the Etherlink rollup's Michelson interface,
// same contract and keys), `/mainnet` and `/mainnet/tezosx` likewise, and `/` sends the
// visitor to the default. The table lives in networks.json (one entry per chain × layer,
// all public information: chain id, RPC, contract, indexer, explorer) so adding a testnet is
// one JSON entry plus an origination; `.env` may override a contract address for local work.

import table from "./networks.json";

export type Chain = string;
export type Layer = "l1" | "l2";
/** Also the Octez Connect NetworkType value (`shadownet`, `tezosx-shadownet`, …). */
export type NetworkName = string;

export interface Network {
  readonly name: NetworkName;
  readonly chain: Chain;
  readonly layer: Layer;
  readonly label: string;
  /** Where the site serves this network, e.g. `/shadownet/tezosx`. */
  readonly path: string;
  /** The chain id the verifier binds attestations to (NetX…). */
  readonly chainId: string;
  readonly rpcUrl: string;
  readonly contractAddress: string;
  /** TzKT API root (account aliases, the scores big map). */
  readonly tzktApi: string;
  /** TzKT block explorer root; accounts at `<root>/<address>`. */
  readonly explorer: string;
  readonly faucet?: string;
}

const env = import.meta.env;

/** Every configured network, in the order of networks.json. */
export const NETWORK_LIST: readonly Network[] = (table.networks as Network[]).map((n) => ({
  ...n,
  contractAddress: env[`VITE_CONTRACT_ADDRESS_${n.name.toUpperCase().replace("-", "_")}`] || n.contractAddress,
}));
export const NETWORKS: Readonly<Record<NetworkName, Network>> = Object.fromEntries(NETWORK_LIST.map((n) => [n.name, n]));
export const DEFAULT_NETWORK: NetworkName = table.default;
/** Whether the panel offers the L1 / L2 toggle at all (networks.json `layerSwitch`); chains without an L2 entry never show it. */
export const LAYER_SWITCH: boolean = table.layerSwitch !== false;

/** The chains with their labels, L1 first in the table; and whether each has an L2. */
export const CHAINS: readonly { name: Chain; label: string; hasL2: boolean }[] = NETWORK_LIST
  .filter((n) => n.layer === "l1")
  .map((n) => ({ name: n.chain, label: n.label, hasL2: NETWORK_LIST.some((m) => m.chain === n.chain && m.layer === "l2") }));
export const LAYERS: readonly { name: Layer; label: string; title: string }[] = [
  { name: "l1", label: "L1", title: "Tezos layer 1" },
  { name: "l2", label: "L2", title: "Tezos X (Etherlink)" },
];

export const isNetworkName = (x: unknown): x is NetworkName => typeof x === "string" && x in NETWORKS;
export const isLayer = (x: unknown): x is Layer => x === "l1" || x === "l2";

/** The network for a chain/layer pair, or undefined when that combination is not configured. */
export const networkFor = (chain: Chain, layer: Layer): NetworkName | undefined =>
  NETWORK_LIST.find((n) => n.chain === chain && n.layer === layer)?.name;

/** The network a path names (`/shadownet`, `/shadownet/tezosx/`, …), or undefined. */
export function networkFromPath(pathname: string): NetworkName | undefined {
  const path = "/" + pathname.split("/").filter(Boolean).join("/");
  return NETWORK_LIST.find((n) => n.path === path)?.name;
}

export const pathFor = (name: NetworkName): string => NETWORKS[name]?.path ?? NETWORKS[DEFAULT_NETWORK]!.path;

/** The network this page is for, from its URL; the default when the URL names none (main.ts then redirects). */
export function currentNetwork(): NetworkName {
  try { return networkFromPath(location.pathname) ?? DEFAULT_NETWORK; } catch { return DEFAULT_NETWORK; }
}

/** The active network's settings, resolved at access time. */
export const config = {
  get network(): NetworkName { return currentNetwork(); },
  get chain(): Chain { return NETWORKS[currentNetwork()]!.chain; },
  get layer(): Layer { return NETWORKS[currentNetwork()]!.layer; },
  get label(): string { return NETWORKS[currentNetwork()]!.label; },
  get path(): string { return NETWORKS[currentNetwork()]!.path; },
  get rpcUrl(): string { return NETWORKS[currentNetwork()]!.rpcUrl; },
  get contractAddress(): string { return NETWORKS[currentNetwork()]!.contractAddress; },
  get chainId(): string { return NETWORKS[currentNetwork()]!.chainId; },
  get tzktApi(): string { return NETWORKS[currentNetwork()]!.tzktApi; },
  get explorer(): string { return NETWORKS[currentNetwork()]!.explorer; },
  get faucet(): string | undefined { return NETWORKS[currentNetwork()]!.faucet; },
  /** The score verifier (verifier/server.ts or lambda.ts), one for every network; empty when none is configured. */
  get verifierUrl(): string { return (env.VITE_VERIFIER_URL ?? "").replace(/\/$/, ""); },
};

export const hasContract = (): boolean => /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(config.contractAddress);

export const shortAddress = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const formatTez = (mutez: number): string => `${(mutez / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} ꜩ`;
