// MetaMask / window.ethereum wallet interaction

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  balance: string | null; // wei
  signature: string | null;
}

const DOMAIN_MESSAGE_PREFIX = "zk_faucet epoch:";

let state: WalletState = {
  connected: false,
  address: null,
  balance: null,
  signature: null,
};

let onChangeCallback: ((state: WalletState) => void) | null = null;

export function getWalletState(): WalletState {
  return { ...state };
}

export function onWalletChange(cb: (state: WalletState) => void) {
  onChangeCallback = cb;
}

function notify() {
  if (onChangeCallback) onChangeCallback({ ...state });
}

export function isMetaMaskAvailable(): boolean {
  return typeof window.ethereum !== "undefined";
}

export async function connectWallet(epoch: number): Promise<WalletState> {
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed. Please install MetaMask to continue.");
  }

  // Request accounts
  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts returned. Please unlock MetaMask.");
  }

  state.address = accounts[0];
  state.connected = true;

  // Sign the domain message for the current epoch
  const message = `${DOMAIN_MESSAGE_PREFIX}${epoch}`;
  const signature = (await window.ethereum.request({
    method: "personal_sign",
    params: [stringToHex(message), state.address],
  })) as string;

  state.signature = signature;

  // Fetch mainnet ETH balance
  const balanceHex = (await window.ethereum.request({
    method: "eth_getBalance",
    params: [state.address, "latest"],
  })) as string;

  state.balance = BigInt(balanceHex).toString();

  // Listen for account changes
  window.ethereum.on("accountsChanged", handleAccountsChanged);

  notify();
  return { ...state };
}

export function disconnectWallet() {
  if (window.ethereum) {
    window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
  }
  state = { connected: false, address: null, balance: null, signature: null };
  notify();
}

function handleAccountsChanged(accounts: unknown) {
  const accs = accounts as string[];
  if (!accs || accs.length === 0) {
    disconnectWallet();
  } else {
    state.address = accs[0];
    state.balance = null;
    state.signature = null;
    state.connected = true;
    notify();
  }
}

function stringToHex(str: string): string {
  let hex = "0x";
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

export function formatBalance(weiStr: string): string {
  const wei = BigInt(weiStr);
  const eth = Number(wei) / 1e18;
  return eth.toFixed(4);
}

export function hasMinBalance(weiStr: string, minWei = "1000000000000000"): boolean {
  return BigInt(weiStr) >= BigInt(minWei);
}

/** Generate a mock nullifier from address + epoch (placeholder for real ZK proof) */
export function generateMockNullifier(address: string, epoch: number): string {
  // Simple deterministic hash placeholder: keccak would be ideal but we
  // just need something unique for the MVP mock. We'll use a simple
  // hex encoding of address + epoch.
  const input = address.toLowerCase() + ":" + epoch.toString();
  let hash = 0n;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31n + BigInt(input.charCodeAt(i))) % (2n ** 256n);
  }
  return "0x" + hash.toString(16).padStart(64, "0");
}
