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
  ];
}
