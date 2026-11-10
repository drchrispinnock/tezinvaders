import { BeaconEvent, NetworkType, defaultEventCallbacks } from "@tezos-x/octez.connect-sdk";
import { TezosToolkit } from "@tezos-x/octez.js";
import { BeaconWallet } from "@tezos-x/octez.js-dapp-wallet";
import { NETWORKS, config } from "./config";

// Network names in networks.json are the Octez Connect NetworkType values (shadownet, tezosx-shadownet, …),
// unless the entry sets connectType, e.g. "custom" for a testnet the protocol has no name for: the
// wallet then identifies the network by the RPC URL (Signet maps it onto its own entry that way).
function connectNetwork(): { type: NetworkType; name: string; rpcUrl: string } {
  const type = NETWORKS[config.network]?.connectType ?? config.network;
  if (!Object.values(NetworkType).includes(type as NetworkType)) throw new Error(`Octez Connect has no network type ${type}`);
  return { type: type as NetworkType, name: config.label, rpcUrl: config.rpcUrl };
}

/**
 * Octez Connect wallet session (the protocol formerly called Beacon). The toolkit is usable
 * for reads before any wallet is connected. The client is bound to one network for the
 * page's lifetime; switching networks reloads the page (see main.ts).
 */
export class Wallet {
  readonly tezos = new TezosToolkit(config.rpcUrl);
  private readonly provider: BeaconWallet;
  /** Set while a connect is in flight; called when the player closes the pairing dialog. */
  private onPairingAborted: (() => void) | null = null;
  /** Fired when the wallet switches or clears the active account (also after connect/disconnect). */
  onAccountChange: ((address: string | null) => void) | null = null;
  address: string | null = null;

  constructor() {
    this.provider = new BeaconWallet({
      name: "TezInvaders",
      network: connectNetwork(),
      eventHandlers: {
        // Closing the pairing dialog is silent by default, which would leave the UI stuck on
        // "Connecting…". Wrap the abort hook so connect() can reject instead.
        [BeaconEvent.PAIR_INIT]: {
          handler: async (data, buttons) => {
            const original = data.abortedHandler;
            data.abortedHandler = () => {
              original?.();
              this.onPairingAborted?.();
            };
            await defaultEventCallbacks[BeaconEvent.PAIR_INIT](data, buttons);
          },
        },
      },
    });
    this.tezos.setWalletProvider(this.provider);
    void this.provider.client.subscribeToEvent(BeaconEvent.ACTIVE_ACCOUNT_SET, (account) => {
      this.address = account?.address ?? null;
      this.onAccountChange?.(this.address);
    });
  }

  /** Re-attach to a session the client persisted in local storage, unless it belongs to another network (then drop it). */
  async restore(): Promise<string | null> {
    const account = await this.provider.client.getActiveAccount();
    const expected = connectNetwork();
    const foreign = account && (account.network.type !== expected.type ||
      (expected.type === NetworkType.CUSTOM && (account.network.rpcUrl ?? "").replace(/\/$/, "") !== expected.rpcUrl.replace(/\/$/, "")));
    if (account && foreign) {
      void this.provider.client.clearActiveAccount().catch(() => undefined);
      this.address = null;
      return null;
    }
    this.address = account?.address ?? null;
    return this.address;
  }

  /** Open the pairing dialog and wait for the wallet to grant permissions. Rejects if the dialog is closed. */
  async connect(): Promise<string> {
    const aborted = new Promise<never>((_, reject) => {
      this.onPairingAborted = () => reject(new Error("pairing cancelled"));
    });
    try {
      await Promise.race([this.provider.requestPermissions(), aborted]);
    } finally {
      this.onPairingAborted = null;
    }
    this.address = await this.provider.getPKH();
    return this.address;
  }

  async disconnect(): Promise<void> {
    await this.provider.clearActiveAccount();
    this.address = null;
  }
}
