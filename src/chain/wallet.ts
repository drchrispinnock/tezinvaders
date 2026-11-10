import { BeaconEvent, NetworkType, defaultEventCallbacks } from "@tezos-x/octez.connect-sdk";
import { TezosToolkit } from "@tezos-x/octez.js";
import { BeaconWallet } from "@tezos-x/octez.js-dapp-wallet";
import { config, type NetworkName } from "./config";

const NETWORK_TYPES: Record<NetworkName, NetworkType> = {
  shadownet: NetworkType.SHADOWNET,
  mainnet: NetworkType.MAINNET,
  "tezosx-shadownet": NetworkType.TEZOSX_SHADOWNET,
  "tezosx-mainnet": NetworkType.TEZOSX_MAINNET,
};

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
      network: { type: NETWORK_TYPES[config.network], rpcUrl: config.rpcUrl },
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

  /** Re-attach to a session the client persisted in local storage. */
  async restore(): Promise<string | null> {
    const account = await this.provider.client.getActiveAccount();
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
