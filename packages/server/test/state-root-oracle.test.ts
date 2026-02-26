import { describe, test, expect, beforeEach, mock } from "bun:test";
import { StateRootOracle } from "../src/lib/state-root-oracle";
import pino from "pino";

const logger = pino({ level: "silent" });

function makeBlock(number: bigint, stateRoot: string) {
  return {
    number,
    stateRoot,
    hash: `0x${"00".repeat(32)}`,
    parentHash: `0x${"00".repeat(32)}`,
    nonce: "0x0",
    sha3Uncles: "0x0",
    logsBloom: "0x0",
    transactionsRoot: "0x0",
    receiptsRoot: "0x0",
    miner: "0x0",
    difficulty: 0n,
    totalDifficulty: 0n,
    extraData: "0x",
    size: 0n,
    gasLimit: 0n,
    gasUsed: 0n,
    timestamp: 0n,
    transactions: [],
    uncles: [],
  };
}

function createMockClient(blocks: Map<bigint | "latest", ReturnType<typeof makeBlock>>) {
  return {
    getBlock: mock(async (opts: any) => {
      if (opts.blockTag === "latest") {
        return blocks.get("latest")!;
      }
      const block = blocks.get(opts.blockNumber);
      if (!block) throw new Error(`Block ${opts.blockNumber} not found`);
      return block;
    }),
  } as any;
}

describe("StateRootOracle", () => {
  describe("start/stop lifecycle", () => {
    test("start() calls refresh and sets interval", async () => {
      const blocks = new Map<bigint | "latest", any>();
      blocks.set("latest", makeBlock(100n, "0xaaa"));
      const client = createMockClient(blocks);
      const oracle = new StateRootOracle(client, logger, 256);

      await oracle.start();
      expect(client.getBlock).toHaveBeenCalled();

      const result = await oracle.getLatestStateRoot();
      expect(result.stateRoot).toBe("0xaaa");

      oracle.stop();
    });

    test("stop() clears the interval (no further refreshes)", async () => {
      const blocks = new Map<bigint | "latest", any>();
      blocks.set("latest", makeBlock(100n, "0xaaa"));
      const client = createMockClient(blocks);
      const oracle = new StateRootOracle(client, logger, 256);

      await oracle.start();
      oracle.stop();
      // Stopping twice should be safe
      oracle.stop();
    });
  });

  describe("refresh deduplication", () => {
    test("same block number is not added twice", async () => {
      const blocks = new Map<bigint | "latest", any>();
      blocks.set("latest", makeBlock(100n, "0xaaa"));
      const client = createMockClient(blocks);
      const oracle = new StateRootOracle(client, logger, 256);

      await oracle.start();
      // Refresh again with same block
      const result1 = await oracle.getLatestStateRoot();

      // Trigger another refresh (same block)
      await oracle["refresh"]();
      const result2 = await oracle.getLatestStateRoot();

      expect(result1.stateRoot).toBe(result2.stateRoot);
      expect(result1.blockNumber).toBe(result2.blockNumber);
      oracle.stop();
    });
  });

  describe("missing stateRoot handling", () => {
    test("block without stateRoot is skipped", async () => {
      const blocks = new Map<bigint | "latest", any>();
      const blockNoRoot = makeBlock(100n, "0xaaa");
      (blockNoRoot as any).stateRoot = undefined;
      blocks.set("latest", blockNoRoot);
      const client = createMockClient(blocks);
      const oracle = new StateRootOracle(client, logger, 256);

      // refresh should not throw, but cache remains empty
      await oracle["refresh"]();
      // getLatestStateRoot will try refresh again, still no stateRoot => throw
      await expect(oracle.getLatestStateRoot()).rejects.toThrow("No state roots available");
      oracle.stop();
    });
  });

  describe("cache pruning", () => {
    test("entries older than maxAge blocks are removed", async () => {
      const blocks = new Map<bigint | "latest", any>();
      // maxAge = 5, so blocks older than (latest - 5) should be pruned
      blocks.set("latest", makeBlock(100n, "0xroot100"));
      const client = createMockClient(blocks);
      const oracle = new StateRootOracle(client, logger, 5);

      // Manually populate cache with old entries
      await oracle.start();

      // Now advance to block 110 — block 100 should be pruned (110 - 5 = 105)
      blocks.set("latest", makeBlock(110n, "0xroot110"));
      // Need backfill blocks too
      for (let i = 101n; i <= 109n; i++) {
        blocks.set(i, makeBlock(i, `0xroot${i}`));
      }
      await oracle["refresh"]();

      // Block 100's root should no longer be valid
      const isValid = await oracle.isValidStateRoot("0xroot100");
      expect(isValid).toBe(false);

      // Block 110's root should be valid
      const isValid2 = await oracle.isValidStateRoot("0xroot110");
      expect(isValid2).toBe(true);

      oracle.stop();
    });
  });

  describe("gap backfill", () => {
    test("fills intermediate blocks when gap detected", async () => {
      const blocks = new Map<bigint | "latest", any>();
      blocks.set("latest", makeBlock(100n, "0xroot100"));
      const client = createMockClient(blocks);
      const oracle = new StateRootOracle(client, logger, 256);

      await oracle.start();

      // Jump to block 105 (gap of 4 blocks: 101-104)
      blocks.set("latest", makeBlock(105n, "0xroot105"));
      blocks.set(101n, makeBlock(101n, "0xroot101"));
      blocks.set(102n, makeBlock(102n, "0xroot102"));
      blocks.set(103n, makeBlock(103n, "0xroot103"));
      blocks.set(104n, makeBlock(104n, "0xroot104"));

      await oracle["refresh"]();

      // All intermediate blocks should be cached
      expect(await oracle.isValidStateRoot("0xroot101")).toBe(true);
      expect(await oracle.isValidStateRoot("0xroot102")).toBe(true);
      expect(await oracle.isValidStateRoot("0xroot103")).toBe(true);
      expect(await oracle.isValidStateRoot("0xroot104")).toBe(true);
      expect(await oracle.isValidStateRoot("0xroot105")).toBe(true);

      oracle.stop();
    });

    test("caps backfill at 10 blocks", async () => {
      const blocks = new Map<bigint | "latest", any>();
      blocks.set("latest", makeBlock(100n, "0xroot100"));
      const client = createMockClient(blocks);
      const oracle = new StateRootOracle(client, logger, 256);

      await oracle.start();

      // Jump 20 blocks (101-119 gap)
      blocks.set("latest", makeBlock(120n, "0xroot120"));
      for (let i = 101n; i <= 119n; i++) {
        blocks.set(i, makeBlock(i, `0xroot${i}`));
      }

      await oracle["refresh"]();

      // Only last 10 of the gap should be backfilled (110-119)
      expect(await oracle.isValidStateRoot("0xroot109")).toBe(false);
      expect(await oracle.isValidStateRoot("0xroot110")).toBe(true);
      expect(await oracle.isValidStateRoot("0xroot119")).toBe(true);
      expect(await oracle.isValidStateRoot("0xroot120")).toBe(true);

      oracle.stop();
    });
  });

  describe("getLatestStateRoot", () => {
    test("returns the most recent entry", async () => {
      const blocks = new Map<bigint | "latest", any>();
      blocks.set("latest", makeBlock(50n, "0xlatest"));
      const client = createMockClient(blocks);
      const oracle = new StateRootOracle(client, logger, 256);

      const result = await oracle.getLatestStateRoot();
      expect(result.blockNumber).toBe(50n);
      expect(result.stateRoot).toBe("0xlatest");
      oracle.stop();
    });

    test("throws when cache is empty and refresh fails", async () => {
      const client = {
        getBlock: mock(async () => {
          throw new Error("RPC error");
        }),
      } as any;

      const oracle = new StateRootOracle(client, logger, 256);
      await expect(oracle.getLatestStateRoot()).rejects.toThrow();
      oracle.stop();
    });
  });

  describe("isValidStateRoot", () => {
    test("case-insensitive match", async () => {
      const blocks = new Map<bigint | "latest", any>();
      blocks.set("latest", makeBlock(10n, "0xAbCdEf"));
      const client = createMockClient(blocks);
      const oracle = new StateRootOracle(client, logger, 256);

      await oracle.start();
      expect(await oracle.isValidStateRoot("0xABCDEF")).toBe(true);
      expect(await oracle.isValidStateRoot("0xabcdef")).toBe(true);
      oracle.stop();
    });

    test("returns false for unknown root", async () => {
      const blocks = new Map<bigint | "latest", any>();
      blocks.set("latest", makeBlock(10n, "0xknown"));
      const client = createMockClient(blocks);
      const oracle = new StateRootOracle(client, logger, 256);

      await oracle.start();
      expect(await oracle.isValidStateRoot("0xunknown")).toBe(false);
      oracle.stop();
    });

    test("refreshes on empty cache before checking", async () => {
      const blocks = new Map<bigint | "latest", any>();
      blocks.set("latest", makeBlock(10n, "0xfreshroot"));
      const client = createMockClient(blocks);
      const oracle = new StateRootOracle(client, logger, 256);

      // Don't call start — cache is empty
      const result = await oracle.isValidStateRoot("0xfreshroot");
      expect(result).toBe(true);
      expect(client.getBlock).toHaveBeenCalled();
      oracle.stop();
    });
  });

  describe("RPC error handling", () => {
    test("refresh handles RPC errors gracefully", async () => {
      let callCount = 0;
      const client = {
        getBlock: mock(async () => {
          callCount++;
          if (callCount === 1) throw new Error("RPC timeout");
          return makeBlock(10n, "0xrecovered");
        }),
      } as any;

      const oracle = new StateRootOracle(client, logger, 256);

      // First refresh fails
      await expect(oracle["refresh"]()).rejects.toThrow("RPC timeout");

      // Second refresh succeeds
      await oracle["refresh"]();
      const result = await oracle.getLatestStateRoot();
      expect(result.stateRoot).toBe("0xrecovered");
      oracle.stop();
    });
  });
});
