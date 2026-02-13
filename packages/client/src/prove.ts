import { toHex, hexToBytes } from "viem";
import type { ProofInputs } from "./types";

/**
 * Fetches the compiled Noir circuit artifact from the faucet server.
 */
export async function loadCircuitArtifact(
  serverUrl: string,
  moduleId: string,
): Promise<object> {
  const url = `${serverUrl}/circuits/${moduleId}/artifact.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch circuit artifact from ${url}: ${res.status} ${res.statusText}`,
    );
  }
  return res.json();
}

/**
 * Converts a bigint to a hex field element string (0x-prefixed, 32 bytes).
 */
function bigintToField(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}

/**
 * Converts a Uint8Array to a hex string (0x-prefixed).
 */
function bytesToField(bytes: Uint8Array): string {
  return toHex(bytes);
}

/**
 * Formats ProofInputs into the Record<string, string> format that Noir expects.
 * All values are converted to hex strings or field elements.
 */
export function formatInputsForCircuit(
  inputs: ProofInputs,
): Record<string, string> {
  return {
    address: bytesToField(inputs.address),
    signature_r: bytesToField(inputs.signature.r),
    signature_s: bytesToField(inputs.signature.s),
    signature_v: "0x" + inputs.signature.v.toString(16).padStart(2, "0"),
    account_proof_nodes: JSON.stringify(
      inputs.accountProofNodes.map((node) => bytesToField(node)),
    ),
    balance: bigintToField(inputs.balance),
    nonce: bigintToField(inputs.nonce),
    code_hash: bytesToField(inputs.codeHash),
    storage_root: bytesToField(inputs.storageRoot),
    state_root: bytesToField(inputs.stateRoot),
    epoch: "0x" + inputs.epoch.toString(16).padStart(8, "0"),
    min_balance: bigintToField(inputs.minBalance),
  };
}

/**
 * Generates a ZK proof using the Noir/Barretenberg WASM backend.
 *
 * The nullifier is derived from the RECOVERED PUBLIC KEY (not the signature):
 *   nullifier = poseidon2(pubkey_x, pubkey_y, epoch)
 * This ensures deterministic nullifiers regardless of ECDSA nonce randomness.
 *
 * TODO: Integrate actual @noir-lang/noir_js and @noir-lang/backend_barretenberg
 * once compiled circuit artifacts are available.
 */
export async function generateProof(
  artifact: object,
  inputs: ProofInputs,
): Promise<{ proof: Uint8Array; publicInputs: string[] }> {
  const formattedInputs = formatInputsForCircuit(inputs);

  // TODO: Replace with actual Noir proving when circuit artifacts are available
  //
  // The implementation will be:
  //
  // import { Noir } from "@noir-lang/noir_js";
  // import { BarretenbergBackend } from "@noir-lang/backend_barretenberg";
  //
  // const backend = new BarretenbergBackend(artifact);
  // const noir = new Noir(artifact, backend);
  // const { witness } = await noir.execute(formattedInputs);
  // const proof = await backend.generateProof(witness);
  //
  // The circuit internally:
  // 1. Recovers pubkey from signature + message
  // 2. Computes nullifier = poseidon2(pubkey_x, pubkey_y, epoch)
  // 3. Verifies the MPT proof against stateRoot
  // 4. Checks balance >= minBalance
  // 5. Exposes public inputs: stateRoot, epoch, minBalance, nullifier

  throw new Error(
    "Noir proof generation not yet available. " +
      "Install @noir-lang/noir_js and @noir-lang/backend_barretenberg, " +
      "and provide compiled circuit artifacts.",
  );
}
