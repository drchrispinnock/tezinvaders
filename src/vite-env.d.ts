/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL_SHADOWNET?: string;
  readonly VITE_CONTRACT_ADDRESS_SHADOWNET?: string;
  readonly VITE_RPC_URL_MAINNET?: string;
  readonly VITE_CONTRACT_ADDRESS_MAINNET?: string;
}
