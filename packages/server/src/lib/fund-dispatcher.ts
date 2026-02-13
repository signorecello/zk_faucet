import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  type WalletClient,
  type PublicClient,
  type Chain,
  type Transport,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Logger } from "../util/logger";

export interface NetworkConfig {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  enabled: boolean;
  dispensationWei: string;
}

export interface DispatchResult {
  txHash: string;
  claimId: string;
}

export class FundDispatcher {
  private walletClients = new Map<string, WalletClient<Transport, Chain, Account>>();
  private publicClients = new Map<string, PublicClient>();
  private networks: Map<string, NetworkConfig>;
  private account: ReturnType<typeof privateKeyToAccount>;
  private logger: Logger;

  constructor(
    networks: NetworkConfig[],
    faucetPrivateKey: `0x${string}`,
    logger: Logger,
  ) {
    this.networks = new Map(networks.map((n) => [n.id, n]));
    this.account = privateKeyToAccount(faucetPrivateKey);
    this.logger = logger;
  }

  private getWalletClient(networkId: string): WalletClient<Transport, Chain, Account> {
    let client = this.walletClients.get(networkId);
    if (client) return client;

    const network = this.networks.get(networkId);
    if (!network) {
      throw new Error(`Network not found: ${networkId}`);
    }
    if (!network.enabled) {
      throw new Error(`Network is disabled: ${networkId}`);
    }

    const chain: Chain = {
      id: network.chainId,
      name: network.name,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: {
        default: { http: [network.rpcUrl] },
      },
    };

    client = createWalletClient({
      account: this.account,
      chain,
      transport: http(network.rpcUrl),
    });

    this.walletClients.set(networkId, client);
    return client;
  }

  private getPublicClient(networkId: string): PublicClient {
    let client = this.publicClients.get(networkId);
    if (client) return client;

    const network = this.networks.get(networkId);
    if (!network) {
      throw new Error(`Network not found: ${networkId}`);
    }

    const chain: Chain = {
      id: network.chainId,
      name: network.name,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: {
        default: { http: [network.rpcUrl] },
      },
    };

    client = createPublicClient({
      chain,
      transport: http(network.rpcUrl),
    });

    this.publicClients.set(networkId, client);
    return client;
  }

  async dispatch(
    networkId: string,
    recipient: `0x${string}`,
    amountWei?: bigint,
  ): Promise<DispatchResult> {
    const network = this.networks.get(networkId);
    if (!network) {
      throw new Error(`Network not found: ${networkId}`);
    }
    if (!network.enabled) {
      throw new Error(`Network is disabled: ${networkId}`);
    }

    const value = amountWei ?? BigInt(network.dispensationWei);
    const claimId = generateClaimId();

    this.logger.info(
      { networkId, recipient, value: value.toString(), claimId },
      "Dispatching funds",
    );

    const walletClient = this.getWalletClient(networkId);

    const txHash = await walletClient.sendTransaction({
      to: recipient,
      value,
    });

    this.logger.info(
      { networkId, recipient, txHash, claimId },
      "Transaction sent",
    );

    return { txHash, claimId };
  }

  async getBalance(networkId: string): Promise<bigint> {
    const publicClient = this.getPublicClient(networkId);
    return publicClient.getBalance({ address: this.account.address });
  }

  getNetworks(): NetworkConfig[] {
    return Array.from(this.networks.values());
  }

  getNetwork(networkId: string): NetworkConfig | undefined {
    return this.networks.get(networkId);
  }
}

function generateClaimId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
