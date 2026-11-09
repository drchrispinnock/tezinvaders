// Which Tezos network the app talks to. Shadownet (the test network) is the default; the
// player can switch to Mainnet from the panel, and the choice is kept in localStorage.
// Each network has its own RPC and contract address, overridable from `.env`.

export type NetworkName = "shadownet" | "mainnet";

export interface Network {
  readonly name: NetworkName;
  readonly label: string;
  readonly rpcUrl: string;
  readonly contractAddress: string;
}

const env = import.meta.env;

export const NETWORKS: Readonly<Record<NetworkName, Network>> = {
  shadownet: {
    name: "shadownet",
    label: "Shadownet",
    rpcUrl: env.VITE_RPC_URL_SHADOWNET ?? "https://rpc.shadownet.teztnets.com",
    contractAddress: env.VITE_CONTRACT_ADDRESS_SHADOWNET ?? "",
  },
  mainnet: {
    name: "mainnet",
    label: "Mainnet",
    rpcUrl: env.VITE_RPC_URL_MAINNET ?? "https://rpc.tzkt.io/mainnet",
    contractAddress: env.VITE_CONTRACT_ADDRESS_MAINNET ?? "",
  },
};

export const DEFAULT_NETWORK: NetworkName = "shadownet";
const STORAGE_KEY = "tezinvaders.network";

export function isNetworkName(x: unknown): x is NetworkName {
  return x === "shadownet" || x === "mainnet";
}

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
  get label(): string { return NETWORKS[currentNetwork()].label; },
  get rpcUrl(): string { return NETWORKS[currentNetwork()].rpcUrl; },
  get contractAddress(): string { return NETWORKS[currentNetwork()].contractAddress; },
};

export const hasContract = (): boolean => /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(config.contractAddress);

export const shortAddress = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const formatTez = (mutez: number): string => `${(mutez / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} ꜩ`;
