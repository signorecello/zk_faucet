import type { Chain } from "viem";
import { mainnet, base } from "viem/chains";

export interface OriginChainConfig {
  chainId: number;
  name: string;
  chain: Chain;
  rpcUrl: string;
  blockTimeMs: number;
}

export function loadOriginChains(): OriginChainConfig[] {
  return [
    {
      chainId: 1,
      name: "Ethereum",
      chain: mainnet,
      rpcUrl: process.env.ETHEREUM_RPC_URL || "https://eth.drpc.org",
      blockTimeMs: 12_000,
    },
    {
      chainId: 8453,
      name: "Base",
      chain: base,
      rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      blockTimeMs: 2_000,
    },
  ];
}
