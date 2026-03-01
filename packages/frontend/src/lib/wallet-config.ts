// Wagmi config + Reown AppKit setup for React hooks
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createAppKit } from '@reown/appkit/react';
import { mainnet, sepolia, holesky, base, arbitrum } from '@reown/appkit/networks';
import type { AppKitNetwork } from '@reown/appkit/networks';

/** Map chain IDs to AppKit network objects */
export const NETWORK_MAP: Record<number, AppKitNetwork> = {
  1: mainnet,
  11155111: sepolia,
  17000: holesky,
  8453: base,
  42161: arbitrum,
};

/** Default origin chain ID from build-time env var (defaults to Ethereum mainnet) */
const defaultOriginChainId = Number(import.meta.env.VITE_ORIGIN_CHAINID || '1');
export const originNetwork = NETWORK_MAP[defaultOriginChainId] ?? mainnet;

/** Re-export as originChain for backward compat with hooks that use viem Chain type */
export const originChain = originNetwork;

/** Minimum balance in wei from build-time env var */
const minBalanceRaw = import.meta.env.VITE_MIN_BALANCE_WEI;
if (!minBalanceRaw) {
  throw new Error('VITE_MIN_BALANCE_WEI must be set (e.g. 10000000000000000 for 0.01 ETH).');
}
export const MIN_BALANCE_WEI = BigInt(minBalanceRaw);

console.log(
  `[zk_faucet] config: default_origin=${defaultOriginChainId} (${originNetwork.name}), VITE_MIN_BALANCE_WEI=${minBalanceRaw}`,
);

/** Domain message prefix -- must match circuit and server exactly */
const DOMAIN_MESSAGE_PREFIX = 'zk_faucet_v1:eth-balance:nullifier_seed:';
const EPOCH_PAD_LENGTH = 10;

/** Epoch duration in seconds from build-time env var (default: 1 week) */
export const EPOCH_DURATION_SECONDS = Number(import.meta.env.VITE_EPOCH_DURATION || '604800');

/** Build the domain message for a given epoch */
export function buildDomainMessage(epoch: number): string {
  const epochStr = epoch.toString().padStart(EPOCH_PAD_LENGTH, '0');
  return `${DOMAIN_MESSAGE_PREFIX}${epochStr}`;
}

/** Get current epoch number */
export function getCurrentEpoch(): number {
  return Math.floor(Date.now() / 1000 / EPOCH_DURATION_SECONDS);
}

// --- Reown AppKit setup ---

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;

// Include all origin chains + default origin chain first
const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  originNetwork,
  ...Object.values(NETWORK_MAP).filter(n => n !== originNetwork),
];

const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
});

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  metadata: {
    name: 'zk_faucet',
    description: 'Privacy-preserving testnet faucet',
    url: globalThis.location?.origin ?? 'https://zkfaucet.xyz',
    icons: [],
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#00ff88',
    '--w3m-color-mix': '#0a0a0a',
    '--w3m-color-mix-strength': 40,
    '--w3m-font-family': "'JetBrains Mono', monospace",
    '--w3m-border-radius-master': '2px',
  },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

/** Low-balance warning threshold for faucet wallet */
export const FAUCET_LOW_BALANCE_WEI = BigInt(import.meta.env.VITE_FAUCET_LOW_BALANCE_WEI || '500000000000000000');
