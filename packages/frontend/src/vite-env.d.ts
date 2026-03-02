/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ORIGIN_CHAINID: string;
  readonly VITE_MIN_BALANCE_WEI: string;
  readonly VITE_EPOCH_DURATION: string;
  readonly VITE_REOWN_PROJECT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
