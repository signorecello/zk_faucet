#!/usr/bin/env bun
/**
 * Compiles (if needed), executes, and proves the ethereum_test circuit
 * using noir_js + bb.js (WASM).
 *
 * Prerequisites:
 *   1. nargo compile in ../ethereum_test/ (or this script does it)
 *   2. generate_prover_toml.ts (produces prover_inputs.json)
 *
 * Usage:
 *   bun run scripts/prove.ts
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";
import { cpus } from "os";

const circuitPath = resolve(process.cwd(), "target/ethereum_test.json");
const inputsPath = resolve(process.cwd(), "prover_inputs.json");

async function main() {
  // 2. Load circuit
  console.log("Loading circuit...");
  const circuitJson = JSON.parse(readFileSync(circuitPath, "utf-8"));

  // 3. Load inputs
  if (!existsSync(inputsPath)) {
    throw new Error(
      `prover_inputs.json not found at ${inputsPath}\nRun generate_prover_toml.ts first.`
    );
  }
  console.log("Loading prover_inputs.json...");
  const inputs = JSON.parse(readFileSync(inputsPath, "utf-8"));
  console.log("Input keys:", Object.keys(inputs));

  // 4. Initialize noir + backend
  console.log("\nInitializing Noir + UltraHonk backend... Using " + cpus().length + " threads");
  const backend = new UltraHonkBackend(circuitJson.bytecode, { threads: cpus().length });
  const noir = new Noir(circuitJson);

  // 5. Execute (generate witness)
  console.log("Generating witness...");
  const startExec = Date.now();
  const { witness } = await noir.execute(inputs);
  const execTime = ((Date.now() - startExec) / 1000).toFixed(1);
  console.log(`Witness generated in ${execTime}s`);

  // 6. Generate proof
  console.log("\nGenerating proof (this may take a while)...");
  const startProve = Date.now();
  const proof = await backend.generateProof(witness);
  const proveTime = ((Date.now() - startProve) / 1000).toFixed(1);
  console.log(`Proof generated in ${proveTime}s`);
  console.log(`Proof size: ${proof.proof.length} bytes`);
  console.log(`Public inputs: ${proof.publicInputs.length}`);

  // Save proof
  const proofPath = resolve(process.cwd(), "target/proof.bin");
  writeFileSync(proofPath, Buffer.from(proof.proof));
  console.log(`Proof saved to ${proofPath}`);

  // 7. Verify proof
  console.log("\nVerifying proof...");
  const verified = await backend.verifyProof(proof);
  console.log(`Proof verified: ${verified}`);

  if (!verified) {
    console.error("PROOF VERIFICATION FAILED");
    process.exit(1);
  }

  console.log("\nSuccess! Ethereum MPT proof generated and verified.");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
