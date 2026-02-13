import type { PublicInputs } from "../types";

/**
 * Verifies a ZK proof using the Barretenberg WASM backend.
 *
 * The proof attests that the prover holds >= minBalance ETH at the given
 * state root, and derives a deterministic nullifier for double-claim prevention.
 *
 * The verification key is loaded from the compiled circuit artifact.
 */
export async function verifyProof(
  proof: Uint8Array,
  publicInputs: PublicInputs,
): Promise<boolean> {
  // Encode public inputs as field elements matching the circuit's public interface.
  // The circuit exposes: [stateRoot, epoch, minBalance, nullifier]
  const publicInputFields = encodePublicInputs(publicInputs);

  // TODO: Integrate actual Barretenberg WASM verification.
  //
  // The implementation will:
  //   1. Load the verification key from the compiled circuit artifact
  //      (e.g., packages/circuits/target/eth_balance.vkey)
  //   2. Instantiate the Barretenberg verifier:
  //      const api = await Barretenberg.new();
  //      const acirComposer = await api.acirCreateProof(acirBuffer);
  //   3. Call api.acirVerifyProof(verificationKey, proof, publicInputFields)
  //   4. Return the boolean result
  //
  // Until the circuit is compiled and Barretenberg bindings are wired up,
  // we reject all proofs to ensure safety. In test environments, the module
  // should be mocked at the verifyProof boundary.

  if (process.env.NODE_ENV === "test" && process.env.MOCK_VERIFIER === "true") {
    // Allow tests to bypass verification when explicitly opted in via env.
    // This should never be set in production.
    return proof.length > 0 && publicInputFields.length === 4;
  }

  throw new Error(
    "Barretenberg verifier not yet integrated. " +
    "Compile the circuit and wire up the verification key to enable proof verification.",
  );
}

/**
 * Encodes structured public inputs into an ordered array of hex-encoded
 * field elements matching the circuit's public input layout.
 */
function encodePublicInputs(inputs: PublicInputs): string[] {
  return [
    inputs.stateRoot,
    "0x" + inputs.epoch.toString(16).padStart(64, "0"),
    "0x" + BigInt(inputs.minBalance).toString(16).padStart(64, "0"),
    inputs.nullifier,
  ];
}

export { encodePublicInputs };
