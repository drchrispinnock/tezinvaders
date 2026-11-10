// Which Tezos network the app talks to: a chain (Shadownet, the test network, or Mainnet)
// on a layer (L1, or L2: Tezos X, the Etherlink rollup's Michelson interface, which takes the
// same contracts and the same tz1/2/3 keys). Shadownet L1 is the default; the panel has a
// toggle for each axis and the choice is kept in localStorage. Every combination has its own
// RPC and contract address, overridable from `.env`.

export type Chain = "shadownet" | "mainnet";
export type Layer = "l1" | "l2";
export type NetworkName = "shadownet" | "mainnet" | "tezosx-shadownet" | "tezosx-mainnet";

export interface Network {
  readonly name: NetworkName;
  readonly chain: Chain;
  readonly layer: Layer;
  readonly label: string;
  readonly rpcUrl: string;
  readonly contractAddress: string;
  /** The chain id the verifier binds attestations to (NetX…). */
  readonly chainId: string;
  /** TzKT API root for account aliases on the leaderboards (Etherlink TzKT covers the Michelson side too). */
  readonly tzktApi: string;
  /** TzKT block explorer root (accounts at `<root>/<address>`). */
  readonly explorer: string;
}

const env = import.meta.env;

export const NETWORKS: Readonly<Record<NetworkName, Network>> = {
  shadownet: {
    name: "shadownet", chain: "shadownet", layer: "l1",
    label: "Shadownet",
    rpcUrl: env.VITE_RPC_URL_SHADOWNET ?? "https://rpc.shadownet.teztnets.com",
    contractAddress: env.VITE_CONTRACT_ADDRESS_SHADOWNET ?? "",
    chainId: "NetXsqzbfFenSTS",
    tzktApi: "https://api.shadownet.tzkt.io",
    explorer: "https://shadownet.tzkt.io",
  },
  mainnet: {
    name: "mainnet", chain: "mainnet", layer: "l1",
    label: "Mainnet",
    rpcUrl: env.VITE_RPC_URL_MAINNET ?? "https://rpc.tzkt.io/mainnet",
    contractAddress: env.VITE_CONTRACT_ADDRESS_MAINNET ?? "",
    chainId: "NetXdQprcVkpaWU",
    tzktApi: "https://api.tzkt.io",
    explorer: "https://tzkt.io",
  },
  "tezosx-shadownet": {
    name: "tezosx-shadownet", chain: "shadownet", layer: "l2",
    label: "Tezos X Shadownet",
    rpcUrl: env.VITE_RPC_URL_TEZOSX_SHADOWNET ?? "https://michelson.etherlink.shadownet.octez.io",
    contractAddress: env.VITE_CONTRACT_ADDRESS_TEZOSX_SHADOWNET ?? "",
    chainId: "NetXtLrzvQDobza",
    tzktApi: "https://api.shadownet.etherlink.tzkt.io",
    explorer: "https://shadownet.etherlink.tzkt.io",
  },
  "tezosx-mainnet": {
    name: "tezosx-mainnet", chain: "mainnet", layer: "l2",
    label: "Tezos X Mainnet",
    rpcUrl: env.VITE_RPC_URL_TEZOSX_MAINNET ?? "https://michelson.etherlink.mainnet.octez.io",
    contractAddress: env.VITE_CONTRACT_ADDRESS_TEZOSX_MAINNET ?? "",
    chainId: "NetXohUVN5QWR4f",
    tzktApi: "https://api.etherlink.tzkt.io",
    explorer: "https://etherlink.tzkt.io",
  },
};

export const CHAINS: readonly { name: Chain; label: string }[] = [
  { name: "shadownet", label: "Shadownet" },
  { name: "mainnet", label: "Mainnet" },
];
export const LAYERS: readonly { name: Layer; label: string; title: string }[] = [
  { name: "l1", label: "L1", title: "Tezos layer 1" },
  { name: "l2", label: "L2", title: "Tezos X (Etherlink)" },
];

export const DEFAULT_NETWORK: NetworkName = "shadownet";
const STORAGE_KEY = "tezinvaders.network";

export function isNetworkName(x: unknown): x is NetworkName {
  return typeof x === "string" && x in NETWORKS;
}
export const isChain = (x: unknown): x is Chain => x === "shadownet" || x === "mainnet";
export const isLayer = (x: unknown): x is Layer => x === "l1" || x === "l2";

/** The network for a chain/layer pair. */
export const networkFor = (chain: Chain, layer: Layer): NetworkName =>
  layer === "l1" ? chain : `tezosx-${chain}`;

/** The network chosen in this browser, falling back to the default. */
export function currentNetwork(): NetworkName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isNetworkName(stored)) return stored;
  } catch { /* storage unavailable */ }
  return DEFAULT_NETWORK;
}

/** Persist the choice. Callers reload the page afterwards: the wallet and toolkit are bound to one network. */
export function setNetwork(name: NetworkName): void {
  try { localStorage.setItem(STORAGE_KEY, name); } catch { /* storage unavailable */ }
}

/** The active network's settings, resolved at access time. */
export const config = {
  get network(): NetworkName { return currentNetwork(); },
  get chain(): Chain { return NETWORKS[currentNetwork()].chain; },
  get layer(): Layer { return NETWORKS[currentNetwork()].layer; },
  get label(): string { return NETWORKS[currentNetwork()].label; },
  get rpcUrl(): string { return NETWORKS[currentNetwork()].rpcUrl; },
  get contractAddress(): string { return NETWORKS[currentNetwork()].contractAddress; },
  get chainId(): string { return NETWORKS[currentNetwork()].chainId; },
  get tzktApi(): string { return NETWORKS[currentNetwork()].tzktApi; },
  get explorer(): string { return NETWORKS[currentNetwork()].explorer; },
  /** The `.env` variable suffix for the active network, e.g. `TEZOSX_SHADOWNET`. */
  get envSuffix(): string { return currentNetwork().toUpperCase().replace("-", "_"); },
  /** The score verifier (verifier/server.ts or lambda.ts), one for every network; empty when none is configured. */
  get verifierUrl(): string { return (env.VITE_VERIFIER_URL ?? "").replace(/\/$/, ""); },
};

export const hasContract = (): boolean => /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(config.contractAddress);

export const shortAddress = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const formatTez = (mutez: number): string => `${(mutez / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} ꜩ`;
