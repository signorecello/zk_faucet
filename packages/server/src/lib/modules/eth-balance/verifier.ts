import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { UltraHonkBackend, UltraHonkVerifierBackend } from "@aztec/bb.js";
import type { PublicInputs } from "../types";

/**
 * Path to the compiled circuit artifact (eth_balance.json).
 * Configurable via CIRCUIT_ARTIFACT_PATH env var; defaults to the
 * monorepo-relative path from project root.
 */
const CIRCUIT_ARTIFACT_PATH =
  process.env.CIRCUIT_ARTIFACT_PATH ??
  resolve(
    import.meta.dir,
    "../../../../../circuits/bin/eth_balance/target/eth_balance.json",
  );

/** Path to the cached verification key (sits next to the circuit artifact). */
const VK_CACHE_PATH = CIRCUIT_ARTIFACT_PATH.replace(/\.json$/, ".vk.bin");

/** Cached verification key — loaded from disk or generated once at startup. */
let cachedVk: Uint8Array | null = null;

/** Lightweight verifier backend — does not need circuit bytecode. */
let verifierInstance: UltraHonkVerifierBackend | null = null;

async function getVerifier(): Promise<{ verifier: UltraHonkVerifierBackend; vk: Uint8Array }> {
  if (verifierInstance && cachedVk) return { verifier: verifierInstance, vk: cachedVk };

  verifierInstance = new UltraHonkVerifierBackend();
  if (!cachedVk) {
    throw new Error("Verification key not initialized — call initBackend() first");
  }
  return { verifier: verifierInstance, vk: cachedVk };
}

/**
 * Eagerly initialize the verification key at startup.
 *
 * 1. If a cached VK exists on disk, load it (instant).
 * 2. Otherwise, spin up the heavy UltraHonkBackend to derive the VK,
 *    cache it to disk, then tear down the backend.
 *
 * After this, verifyProof() uses the lightweight UltraHonkVerifierBackend
 * which takes ~1-2s instead of ~43s.
 */
export async function initBackend(): Promise<void> {
  // Try loading cached VK from disk
  if (existsSync(VK_CACHE_PATH)) {
    cachedVk = new Uint8Array(readFileSync(VK_CACHE_PATH));
    verifierInstance = new UltraHonkVerifierBackend();
    return;
  }

  // No cached VK — generate it from the circuit (slow, one-time cost)
  const circuitJson = JSON.parse(readFileSync(CIRCUIT_ARTIFACT_PATH, "utf-8"));
  const backend = new UltraHonkBackend(circuitJson.bytecode);
  cachedVk = await backend.getVerificationKey();
  await backend.destroy();

  // Cache to disk for next startup
  writeFileSync(VK_CACHE_PATH, cachedVk);

  verifierInstance = new UltraHonkVerifierBackend();
}

/**
 * Verifies a ZK proof using the lightweight UltraHonkVerifierBackend.
 *
 * The proof attests that the prover holds >= minBalance ETH at the given
 * state root, and derives a deterministic nullifier for double-claim prevention.
 */
export async function verifyProof(
  proof: Uint8Array,
  publicInputs: PublicInputs,
): Promise<boolean> {
  const publicInputFields = encodePublicInputs(publicInputs);
  const { verifier, vk } = await getVerifier();
  return verifier.verifyProof({
    proof,
    publicInputs: publicInputFields,
    verificationKey: vk,
  });
}

/**
 * Encodes structured public inputs into an ordered array of 35 hex-encoded
 * field elements matching the circuit's public input layout:
 *   [0..31]  = state_root bytes (32 individual byte fields)
 *   [32]     = epoch
 *   [33]     = min_balance
 *   [34]     = nullifier
 */
export function encodePublicInputs(inputs: PublicInputs): string[] {
  const fields: string[] = [];

  // Split stateRoot into 32 individual byte fields
  const stateRootHex = inputs.stateRoot.startsWith("0x")
    ? inputs.stateRoot.slice(2)
    : inputs.stateRoot;
  for (let i = 0; i < 32; i++) {
    const byteHex = stateRootHex.slice(i * 2, i * 2 + 2);
    const byteVal = parseInt(byteHex, 16);
    fields.push("0x" + byteVal.toString(16).padStart(64, "0"));
  }

  // epoch as field
  fields.push("0x" + inputs.epoch.toString(16).padStart(64, "0"));

  // minBalance as field
  fields.push("0x" + BigInt(inputs.minBalance).toString(16).padStart(64, "0"));

  // nullifier as field (handles both decimal and hex string formats)
  fields.push("0x" + BigInt(inputs.nullifier).toString(16).padStart(64, "0"));

  return fields; // 35 fields total
}

/**
 * Reset the cached backend (for testing).
 */
export function resetBackend(): void {
  cachedVk = null;
  verifierInstance = null;
}
