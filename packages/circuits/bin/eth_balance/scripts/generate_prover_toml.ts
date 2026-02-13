#!/usr/bin/env bun
/**
 * Generates a valid Prover.toml for the eth_balance circuit.
 *
 * Usage:
 *   PRIVATE_KEY=0x... ETH_RPC_URL=https://... bun run scripts/generate_prover_toml.ts
 *
 * Or load from project .env:
 *   bun --env-file=../../../../.env run scripts/generate_prover_toml.ts
 */

import { createPublicClient, createWalletClient, http, keccak256, toBytes, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import * as secp256k1 from "@noble/secp256k1";
import { BarretenbergSync, Fr } from "@aztec/bb.js";

// --- Config ---
const EPOCH_DURATION = 604_800; // 1 week in seconds
const MIN_BALANCE_WEI = 10_000_000_000_000_000n; // 0.01 ETH

// --- Helpers ---
function bytesToTomlArray(bytes: Uint8Array): string {
  return `[${Array.from(bytes).map((b) => `0x${b.toString(16).padStart(2, "0")}`).join(", ")}]`;
}

function fieldToDecimalString(f: bigint): string {
  return `"${f.toString()}"`;
}

function hexToBytes32(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const padded = clean.padStart(64, "0");
  return Uint8Array.from(Buffer.from(padded, "hex"));
}

// --- Main ---
async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.ETH_RPC_URL;

  if (!privateKey) throw new Error("PRIVATE_KEY env var required");
  if (!rpcUrl) throw new Error("ETH_RPC_URL env var required");

  console.error("Generating Prover.toml...\n");

  // 1. Derive account from private key
  const account = privateKeyToAccount(privateKey as Hex);
  console.error(`Address: ${account.address}`);

  // 2. Derive raw public key from private key
  const privKeyBytes = hexToBytes32(privateKey);
  const pubKeyUncompressed = secp256k1.getPublicKey(privKeyBytes, false);
  // pubKeyUncompressed is 65 bytes: 0x04 || x (32) || y (32)
  const pubkey_x = pubKeyUncompressed.slice(1, 33);
  const pubkey_y = pubKeyUncompressed.slice(33, 65);
  console.error(`PubKey X: 0x${Buffer.from(pubkey_x).toString("hex")}`);
  console.error(`PubKey Y: 0x${Buffer.from(pubkey_y).toString("hex")}`);

  // Verify: keccak256(pubkey_x || pubkey_y)[12..32] == address
  const pubkeyConcat = new Uint8Array(64);
  pubkeyConcat.set(pubkey_x, 0);
  pubkeyConcat.set(pubkey_y, 32);
  const addrHash = keccak256(pubkeyConcat);
  const derivedAddr = `0x${addrHash.slice(26)}`;
  console.error(`Derived address: ${derivedAddr}`);
  if (derivedAddr.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Address mismatch: derived=${derivedAddr} vs account=${account.address}`);
  }

  // 3. Compute epoch
  const epoch = BigInt(Math.floor(Date.now() / 1000 / EPOCH_DURATION));
  console.error(`Epoch: ${epoch}`);

  // 4. Sign domain message
  const domainMsg = `zk_faucet_v1:eth-balance:nullifier_seed:${epoch}`;
  console.error(`Domain message: "${domainMsg}"`);

  // personal_sign: sign the raw string (viem handles EIP-191 prefix)
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const signature = await walletClient.signMessage({ message: domainMsg });
  console.error(`Signature: ${signature}`);

  // Parse r, s, v from signature
  const sigBytes = toBytes(signature);
  const sig_r = sigBytes.slice(0, 32);
  const sig_s = sigBytes.slice(32, 64);
  const v = sigBytes[64];
  console.error(`v: ${v}`);

  // 5. Compute message_hash (EIP-191 prefixed hash -- what ECDSA actually signs)
  const domainMsgBytes = new TextEncoder().encode(domainMsg);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${domainMsgBytes.length}`);
  const prefixedMsg = new Uint8Array(prefix.length + domainMsgBytes.length);
  prefixedMsg.set(prefix, 0);
  prefixedMsg.set(domainMsgBytes, prefix.length);
  const message_hash = toBytes(keccak256(prefixedMsg));
  console.error(`Message hash: 0x${Buffer.from(message_hash).toString("hex")}`);

  // 6. Fetch balance from RPC
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const balance = await publicClient.getBalance({ address: account.address });
  console.error(`Balance: ${balance} wei (${Number(balance) / 1e18} ETH)`);

  if (balance < MIN_BALANCE_WEI) {
    console.error(`WARNING: Balance ${balance} < min_balance ${MIN_BALANCE_WEI}`);
  }

  // 7. Derive Ethereum address bytes
  const addressBytes = toBytes(account.address);

  // 8. Compute Poseidon2 nullifier using bb.js
  console.error("\nInitializing Barretenberg for Poseidon2...");
  const bb = await BarretenbergSync.initSingleton();

  // Convert pubkey coordinates to Field elements (big-endian, reduced mod BN254 p)
  // This matches the Noir circuit's bytes32_to_field() which does modular arithmetic
  const BN254_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const pubkey_x_bigint = BigInt(`0x${Buffer.from(pubkey_x).toString("hex")}`) % BN254_MODULUS;
  const pubkey_y_bigint = BigInt(`0x${Buffer.from(pubkey_y).toString("hex")}`) % BN254_MODULUS;
  console.error(`PubKey X (field): ${pubkey_x_bigint}`);
  console.error(`PubKey Y (field): ${pubkey_y_bigint}`);

  const nullifier_fr = bb.poseidon2Hash([
    new Fr(pubkey_x_bigint),
    new Fr(pubkey_y_bigint),
    new Fr(epoch),
  ]);
  const nullifier_hex = nullifier_fr.toString();
  const nullifier_bigint = BigInt(nullifier_hex);
  console.error(`Nullifier: ${nullifier_bigint}`);

  // 9. Write Prover.toml
  const toml = `# Generated by generate_prover_toml.ts
# Address: ${account.address}
# Epoch: ${epoch}
# Balance: ${balance} wei

# Private inputs
sig_r = ${bytesToTomlArray(sig_r)}
sig_s = ${bytesToTomlArray(sig_s)}
pubkey_x = ${bytesToTomlArray(pubkey_x)}
pubkey_y = ${bytesToTomlArray(pubkey_y)}
message_hash = ${bytesToTomlArray(message_hash)}
address = ${bytesToTomlArray(addressBytes)}
balance = ${fieldToDecimalString(balance)}

# Public inputs
epoch = ${fieldToDecimalString(epoch)}
min_balance = ${fieldToDecimalString(MIN_BALANCE_WEI)}
nullifier = ${fieldToDecimalString(nullifier_bigint)}
`;

  // Write to stdout (redirect to Prover.toml)
  console.log(toml);
  console.error("\nDone! Pipe stdout to Prover.toml:");
  console.error("  bun run scripts/generate_prover_toml.ts > Prover.toml");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
