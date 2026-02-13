import type { PublicClient } from "viem";
import type { Logger } from "../util/logger";
import { MAX_STATE_ROOT_AGE_BLOCKS } from "./modules/eth-balance/constants";

interface CachedStateRoot {
  blockNumber: bigint;
  stateRoot: string;
}

export class StateRootOracle {
  private client: PublicClient;
  private logger: Logger;
  private cache: CachedStateRoot[] = [];
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private maxAge: number;

  constructor(client: PublicClient, logger: Logger, maxAge: number = MAX_STATE_ROOT_AGE_BLOCKS) {
    this.client = client;
    this.logger = logger;
    this.maxAge = maxAge;
  }

  async start(): Promise<void> {
    await this.refresh();
    // Refresh every 12 seconds (L1 block time)
    this.refreshInterval = setInterval(() => {
      this.refresh().catch((err) => {
        this.logger.error({ err }, "Failed to refresh state roots");
      });
    }, 12_000);
  }

  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private async refresh(): Promise<void> {
    const block = await this.client.getBlock({ blockTag: "latest" });
    if (!block.stateRoot) {
      this.logger.warn("Block missing stateRoot field");
      return;
    }

    const existing = this.cache.find((c) => c.blockNumber === block.number);
    if (!existing) {
      this.cache.push({
        blockNumber: block.number,
        stateRoot: block.stateRoot,
      });

      // Prune entries older than maxAge blocks
      const minBlock = block.number - BigInt(this.maxAge);
      this.cache = this.cache.filter((c) => c.blockNumber >= minBlock);

      this.logger.debug(
        { blockNumber: block.number.toString(), cacheSize: this.cache.length },
        "State root cache updated",
      );
    }
  }

  async getLatestStateRoot(): Promise<{ blockNumber: bigint; stateRoot: string }> {
    if (this.cache.length === 0) {
      await this.refresh();
    }
    if (this.cache.length === 0) {
      throw new Error("No state roots available");
    }
    // Return the most recent cached entry
    return this.cache[this.cache.length - 1];
  }

  async isValidStateRoot(stateRoot: string): Promise<boolean> {
    if (this.cache.length === 0) {
      await this.refresh();
    }
    return this.cache.some((c) => c.stateRoot === stateRoot);
  }
}
