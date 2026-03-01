import type { NetworkConfig } from "./fund-dispatcher";

/**
 * Loads network configurations from environment variables.
 * RPC URLs are server-only (no VITE_ prefix) so they never leak to the frontend.
 * Falls back to public RPCs if env vars are not set.
 */
export function loadNetworks(): NetworkConfig[] {
  return [
    {
      id: "sepolia",
      name: "Sepolia",
      chainId: 11155111,
      rpcUrl: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      explorerUrl: "https://sepolia.etherscan.io",
      enabled: true,
      dispensationWei: "100000000000000000",
    },
    {
      id: "base-sepolia",
      name: "Base Sepolia",
      chainId: 84532,
      rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      explorerUrl: "https://sepolia.basescan.org",
      enabled: true,
      dispensationWei: "100000000000000000",
    },
    {
      id: "arbitrum-sepolia",
      name: "Arbitrum Sepolia",
      chainId: 421614,
      rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      explorerUrl: "https://sepolia.arbiscan.io",
      enabled: true,
      dispensationWei: "100000000000000000",
    },
  ];
}
