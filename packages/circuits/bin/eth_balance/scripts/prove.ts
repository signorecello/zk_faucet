#!/usr/bin/env bun
/**
 * Generates and verifies a ZK proof using noir_js + bb.js (WASM).
 *
 * Prerequisites:
 *   1. nargo compile (produces target/eth_balance.json)
 *   2. generate_prover_toml.ts (produces Prover.toml)
 *
 * Usage:
 *   bun run scripts/prove.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";
import { cpus } from "os";

const circuitPath = resolve(process.cwd(), "target/eth_balance.json");
const proverTomlPath = resolve(process.cwd(), "Prover.toml");

// Parse Prover.toml into input map
function parseProverToml(toml: string): Record<string, any> {
  const inputs: Record<string, any> = {};
  for (const line of toml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const rawValue = trimmed.slice(eqIdx + 1).trim();

    if (rawValue.startsWith("[")) {
      // Array of hex bytes: [0x05, 0x8b, ...]
      const hexValues = rawValue
        .replace(/[\[\]]/g, "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => parseInt(v, 16).toString());
      inputs[key] = hexValues;
    } else if (rawValue.startsWith('"')) {
      // String-quoted field value
      inputs[key] = rawValue.replace(/"/g, "");
    } else {
      inputs[key] = rawValue;
    }
  }
  return inputs;
}

async function main() {
  console.log("Loading circuit...");
  const circuitJson = JSON.parse(readFileSync(circuitPath, "utf-8"));

  console.log("Parsing Prover.toml...");
  const toml = readFileSync(proverTomlPath, "utf-8");
  const inputs = parseProverToml(toml);
  console.log("Input keys:", Object.keys(inputs));

  console.log("\nInitializing Noir + UltraHonk backend...");
  const backend = new UltraHonkBackend(circuitJson.bytecode, { threads: cpus().length });
  const noir = new Noir(circuitJson);

  console.log("Generating witness...");
  const { witness } = await noir.execute(inputs);
  console.log("Witness generated successfully.");

  console.log("\nGenerating proof (this may take a while)...");
  const startTime = Date.now();
  const proof = await backend.generateProof(witness);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Proof generated in ${elapsed}s`);
  console.log(`Proof size: ${proof.proof.length} bytes`);
  console.log(`Public inputs: ${proof.publicInputs.length}`);

  // Save proof
  const proofPath = resolve(process.cwd(), "target/proof.bin");
  writeFileSync(proofPath, Buffer.from(proof.proof));
  console.log(`Proof saved to ${proofPath}`);

  // Verify proof
  console.log("\nVerifying proof...");
  const verified = await backend.verifyProof(proof);
  console.log(`Proof verified: ${verified}`);

  if (!verified) {
    console.error("PROOF VERIFICATION FAILED");
    process.exit(1);
  }

  console.log("\nSuccess! Proof generated and verified.");

  process.exit(0)
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
