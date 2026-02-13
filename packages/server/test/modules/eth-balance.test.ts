import { describe, test, expect, beforeEach, mock } from "bun:test";
import { EthBalanceModule } from "../../src/lib/modules/eth-balance/module";
import type { StateRootOracle } from "../../src/lib/state-root-oracle";
import type { PublicInputs } from "../../src/lib/modules/types";
import { EPOCH_DURATION_SECONDS, MIN_BALANCE_WEI } from "../../src/lib/modules/eth-balance/constants";

function createMockOracle(opts: { validStateRoots?: string[] } = {}): StateRootOracle {
  const validRoots = new Set(opts.validStateRoots ?? ["0xvalidroot"]);
  return {
    start: mock(() => Promise.resolve()),
    stop: mock(() => {}),
    getLatestStateRoot: mock(() =>
      Promise.resolve({ blockNumber: 1000n, stateRoot: "0xvalidroot" }),
    ),
    isValidStateRoot: mock((root: string) => Promise.resolve(validRoots.has(root))),
  } as unknown as StateRootOracle;
}

describe("EthBalanceModule", () => {
  let module: EthBalanceModule;
  let oracle: StateRootOracle;

  beforeEach(() => {
    oracle = createMockOracle();
    module = new EthBalanceModule(oracle);
  });

  test("id is eth-balance", () => {
    expect(module.id).toBe("eth-balance");
  });

  test("currentEpoch returns correct value", () => {
    const expected = Math.floor(Date.now() / 1000 / EPOCH_DURATION_SECONDS);
    expect(module.currentEpoch()).toBe(expected);
  });

  test("epochDurationSeconds defaults to EPOCH_DURATION_SECONDS", () => {
    expect(module.epochDurationSeconds).toBe(EPOCH_DURATION_SECONDS);
  });

  test("currentEpoch respects custom epoch duration", () => {
    const customModule = new EthBalanceModule(oracle, { epochDuration: 3600 });
    const expected = Math.floor(Date.now() / 1000 / 3600);
    expect(customModule.currentEpoch()).toBe(expected);
  });

  describe("validatePublicInputs", () => {
    function validInputs(): PublicInputs {
      return {
        stateRoot: "0xvalidroot",
        epoch: module.currentEpoch(),
        minBalance: MIN_BALANCE_WEI.toString(),
        nullifier: "0xnullifier123",
      };
    }

    test("accepts valid inputs", async () => {
      const result = await module.validatePublicInputs(validInputs());
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test("rejects wrong epoch", async () => {
      const inputs = validInputs();
      inputs.epoch = 0;
      const result = await module.validatePublicInputs(inputs);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Epoch mismatch");
    });

    test("rejects stale state root", async () => {
      const inputs = validInputs();
      inputs.stateRoot = "0xstaleroot";
      const result = await module.validatePublicInputs(inputs);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not recognized or too old");
    });

    test("rejects min balance below threshold", async () => {
      const inputs = validInputs();
      inputs.minBalance = "1000"; // way below 0.01 ETH
      const result = await module.validatePublicInputs(inputs);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Minimum balance too low");
    });

    test("rejects empty nullifier", async () => {
      const inputs = validInputs();
      inputs.nullifier = "0x";
      const result = await module.validatePublicInputs(inputs);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("non-empty");
    });

    test("rejects empty string nullifier", async () => {
      const inputs = validInputs();
      inputs.nullifier = "";
      const result = await module.validatePublicInputs(inputs);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("non-empty");
    });

    test("accepts min balance exactly at threshold", async () => {
      const inputs = validInputs();
      inputs.minBalance = MIN_BALANCE_WEI.toString();
      const result = await module.validatePublicInputs(inputs);
      expect(result.valid).toBe(true);
    });

    test("accepts min balance above threshold", async () => {
      const inputs = validInputs();
      inputs.minBalance = (MIN_BALANCE_WEI * 2n).toString();
      const result = await module.validatePublicInputs(inputs);
      expect(result.valid).toBe(true);
    });

    test("rejects min balance one wei below threshold", async () => {
      const inputs = validInputs();
      inputs.minBalance = (MIN_BALANCE_WEI - 1n).toString();
      const result = await module.validatePublicInputs(inputs);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Minimum balance too low");
    });

    test("rejects epoch one ahead of current", async () => {
      const inputs = validInputs();
      inputs.epoch = module.currentEpoch() + 1;
      const result = await module.validatePublicInputs(inputs);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Epoch mismatch");
    });

    test("rejects epoch one behind current", async () => {
      const inputs = validInputs();
      inputs.epoch = module.currentEpoch() - 1;
      const result = await module.validatePublicInputs(inputs);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Epoch mismatch");
    });

    test("rejects zero min balance", async () => {
      const inputs = validInputs();
      inputs.minBalance = "0";
      const result = await module.validatePublicInputs(inputs);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Minimum balance too low");
    });

    test("rejects negative min balance (as string)", async () => {
      const inputs = validInputs();
      inputs.minBalance = "-1";
      // BigInt("-1") is negative, which is less than minBalance
      await expect(module.validatePublicInputs(inputs)).resolves.toMatchObject({
        valid: false,
      });
    });

    test("oracle returning false for any state root rejects all claims", async () => {
      const strictOracle = createMockOracle({ validStateRoots: [] });
      const strictModule = new EthBalanceModule(strictOracle);
      const inputs: PublicInputs = {
        stateRoot: "0xvalidroot",
        epoch: strictModule.currentEpoch(),
        minBalance: MIN_BALANCE_WEI.toString(),
        nullifier: "0xnullifier123",
      };
      const result = await strictModule.validatePublicInputs(inputs);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not recognized");
    });
  });

  describe("verifyProof", () => {
    test("delegates to verifier (throws without Barretenberg)", async () => {
      const proof = new Uint8Array([1, 2, 3]);
      const inputs: PublicInputs = {
        stateRoot: "0xvalidroot",
        epoch: module.currentEpoch(),
        minBalance: MIN_BALANCE_WEI.toString(),
        nullifier: "0xnullifier123",
      };
      // Without MOCK_VERIFIER=true, verifyProof throws because Barretenberg is not integrated
      await expect(module.verifyProof(proof, inputs)).rejects.toThrow(
        "Barretenberg verifier not yet integrated",
      );
    });
  });
});
