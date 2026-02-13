/**
 * Test fixtures for e2e tests.
 *
 * The mock verifier (NODE_ENV=test, MOCK_VERIFIER=true) accepts any proof
 * that has length > 0 and exactly 4 public input fields. We use these
 * fixtures to exercise the HTTP flow without real ZK proof generation.
 */

/** A mock proof hex string that the mock verifier will accept (non-empty). */
export const VALID_PROOF =
  "0xdeadbeefcafebabe0123456789abcdef" +
  "deadbeefcafebabe0123456789abcdef";

/** An empty proof that the mock verifier will reject (length 0 after stripping 0x). */
export const INVALID_PROOF = "0x";

/** A valid Ethereum address to receive testnet funds. */
export const TEST_RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

/** The target network for test claims. */
export const TEST_NETWORK = "sepolia";

/** Module ID for the eth-balance proof module. */
export const MODULE_ID = "eth-balance";

/** Minimum balance in wei matching the server constant (0.01 ETH). */
export const MIN_BALANCE_WEI = "10000000000000000";

/** A state root that will be seeded into the test oracle cache. */
export const VALID_STATE_ROOT =
  "0x00000000000000000000000000000000" +
  "00000000000000000000000000000001";

/**
 * A stale state root that is NOT in the oracle cache, simulating a root
 * from more than 256 blocks ago.
 */
export const STALE_STATE_ROOT =
  "0xffffffffffffffffffffffffffffffff" +
  "ffffffffffffffffffffffffffffffff";

let nullifierCounter = 0;

/**
 * Generate a unique nullifier for each test to avoid cross-test interference
 * from the nullifier deduplication store.
 */
export function uniqueNullifier(): string {
  nullifierCounter++;
  const hex = nullifierCounter.toString(16).padStart(64, "0");
  return "0x" + hex;
}

/**
 * Build valid public inputs for a claim request. Uses the current epoch
 * from the module and the valid (seeded) state root.
 */
export function validPublicInputs(
  epoch: number,
  overrides: Partial<{
    stateRoot: string;
    minBalance: string;
    nullifier: string;
  }> = {},
) {
  return {
    stateRoot: overrides.stateRoot ?? VALID_STATE_ROOT,
    epoch,
    minBalance: overrides.minBalance ?? MIN_BALANCE_WEI,
    nullifier: overrides.nullifier ?? uniqueNullifier(),
  };
}

/**
 * Build a full claim request body.
 */
export function claimBody(
  epoch: number,
  overrides: Partial<{
    moduleId: string;
    proof: string;
    stateRoot: string;
    minBalance: string;
    nullifier: string;
    recipient: string;
    targetNetwork: string;
  }> = {},
) {
  const pi = validPublicInputs(epoch, {
    stateRoot: overrides.stateRoot,
    minBalance: overrides.minBalance,
    nullifier: overrides.nullifier,
  });

  return {
    moduleId: overrides.moduleId ?? MODULE_ID,
    proof: overrides.proof ?? VALID_PROOF,
    publicInputs: pi,
    recipient: overrides.recipient ?? TEST_RECIPIENT,
    targetNetwork: overrides.targetNetwork ?? TEST_NETWORK,
  };
}
