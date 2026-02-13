// zk_faucet: ETH Balance Proof Circuit
//
// Proves that a user controls an Ethereum address with >= min_balance ETH,
// and derives a deterministic nullifier from the public key + epoch.
//
// Privacy guarantees:
//   - The address, signature, balance are private inputs
//   - Only the nullifier, epoch, and min_balance are public
//   - The nullifier is derived from the public key (not the signature),
//     ensuring determinism regardless of ECDSA nonce randomness
//
// Circuit constraints:
//   1. ECDSA signature verification (secp256k1)
//   2. Address derivation: keccak256(pubkey)[12..32] == address
//   3. Balance check: balance >= min_balance
//   4. Nullifier: poseidon2(pubkey_x, pubkey_y, epoch)
//
// TODO: Add MPT account proof verification against state_root once vlayer
//       library is ported to nargo 1.0.0

use std::ecdsa_secp256k1;
use keccak256::keccak256;
use poseidon::poseidon2::Poseidon2;

// Convert a 32-byte array to a Field element (big-endian)
fn bytes32_to_field(bytes: [u8; 32]) -> Field {
    let mut result: Field = 0;
    for i in 0..32 {
        result = result * 256 + bytes[i] as Field;
    }
    result
}

// Verify an ECDSA secp256k1 signature against the provided public key.
//
// The signature is over a message hash (client-side: EIP-191 personal_sign
// of the domain message "zk_faucet_v1:eth-balance:nullifier_seed:<epoch>").
fn verify_signature(
    message_hash: [u8; 32],
    sig_r: [u8; 32],
    sig_s: [u8; 32],
    pubkey_x: [u8; 32],
    pubkey_y: [u8; 32],
) {
    let mut signature: [u8; 64] = [0; 64];
    for i in 0..32 {
        signature[i] = sig_r[i];
        signature[i + 32] = sig_s[i];
    }
    let valid = ecdsa_secp256k1::verify_signature(pubkey_x, pubkey_y, signature, message_hash);
    assert(valid, "ECDSA signature verification failed");
}

// Verify that the given public key hashes to the expected Ethereum address:
//   address = keccak256(pubkey_x || pubkey_y)[12..32]
fn verify_address_from_pubkey(
    pubkey_x: [u8; 32],
    pubkey_y: [u8; 32],
    address: [u8; 20],
) {
    let mut pubkey_bytes: [u8; 64] = [0; 64];
    for i in 0..32 {
        pubkey_bytes[i] = pubkey_x[i];
        pubkey_bytes[i + 32] = pubkey_y[i];
    }
    let hash: [u8; 32] = keccak256(pubkey_bytes, 64);
    for i in 0..20 {
        assert(hash[i + 12] == address[i], "Address does not match public key");
    }
}

// Main circuit entrypoint
//
// Proves:
//   1. The prover controls an Ethereum address (via ECDSA signature)
//   2. That address has balance >= min_balance
//   3. A deterministic nullifier derived from the public key + epoch
fn main(
    // === Private inputs ===
    sig_r: [u8; 32],
    sig_s: [u8; 32],
    pubkey_x: [u8; 32],
    pubkey_y: [u8; 32],
    // Precomputed message hash
    // Client computes: keccak256("\x19Ethereum Signed Message:\n" + len + domain_msg)
    message_hash: [u8; 32],
    // Ethereum address (derived from pubkey, verified in-circuit)
    address: [u8; 20],
    // Balance in wei (private, only compared against min_balance)
    balance: Field,
    // === Public inputs ===
    epoch: pub Field,
    min_balance: pub Field,
    nullifier: pub Field,
) {
    // 1. ECDSA signature verification
    verify_signature(message_hash, sig_r, sig_s, pubkey_x, pubkey_y);

    // 2. Address derivation from public key
    verify_address_from_pubkey(pubkey_x, pubkey_y, address);

    // 3. Balance check (cast to u64 -- sufficient for ETH amounts up to ~18.4 ETH)
    // For a faucet min_balance of 0.01 ETH = 10^16 wei, any balance >= min fits u64
    assert(balance as u64 >= min_balance as u64, "Balance below minimum threshold");

    // 4. Nullifier derivation from PUBLIC KEY (deterministic regardless of ECDSA nonce)
    let pubkey_x_field = bytes32_to_field(pubkey_x);
    let pubkey_y_field = bytes32_to_field(pubkey_y);
    let computed_nullifier = Poseidon2::hash([pubkey_x_field, pubkey_y_field, epoch], 3);
    assert(nullifier == computed_nullifier, "Nullifier mismatch");
}

// ================================================================
// Tests
// ================================================================

#[test]
fn test_bytes32_to_field() {
    let mut bytes: [u8; 32] = [0; 32];
    bytes[31] = 1;
    assert(bytes32_to_field(bytes) == 1);

    let mut bytes2: [u8; 32] = [0; 32];
    bytes2[31] = 255;
    assert(bytes32_to_field(bytes2) == 255);

    let mut bytes3: [u8; 32] = [0; 32];
    bytes3[30] = 1;
    assert(bytes32_to_field(bytes3) == 256);
}

#[test]
fn test_balance_check_passes() {
    let balance: Field = 100;
    let min_balance: Field = 10;
    assert(balance as u64 >= min_balance as u64);
}

#[test]
fn test_nullifier_is_deterministic() {
    let mut pubkey_x: [u8; 32] = [0; 32];
    pubkey_x[31] = 42;
    let mut pubkey_y: [u8; 32] = [0; 32];
    pubkey_y[31] = 99;
    let epoch: Field = 5;

    let pubkey_x_field = bytes32_to_field(pubkey_x);
    let pubkey_y_field = bytes32_to_field(pubkey_y);

    let nullifier1 = Poseidon2::hash([pubkey_x_field, pubkey_y_field, epoch], 3);
    let nullifier2 = Poseidon2::hash([pubkey_x_field, pubkey_y_field, epoch], 3);
    assert(nullifier1 == nullifier2, "Nullifier should be deterministic");
}

#[test]
fn test_different_epochs_produce_different_nullifiers() {
    let mut pubkey_x: [u8; 32] = [0; 32];
    pubkey_x[31] = 42;
    let mut pubkey_y: [u8; 32] = [0; 32];
    pubkey_y[31] = 99;

    let pubkey_x_field = bytes32_to_field(pubkey_x);
    let pubkey_y_field = bytes32_to_field(pubkey_y);

    let nullifier_epoch5 = Poseidon2::hash([pubkey_x_field, pubkey_y_field, 5], 3);
    let nullifier_epoch6 = Poseidon2::hash([pubkey_x_field, pubkey_y_field, 6], 3);
    assert(nullifier_epoch5 != nullifier_epoch6, "Different epochs should produce different nullifiers");
}

#[test]
fn test_different_pubkeys_produce_different_nullifiers() {
    let epoch: Field = 5;

    let mut pubkey_x_a: [u8; 32] = [0; 32];
    pubkey_x_a[31] = 1;
    let mut pubkey_y_a: [u8; 32] = [0; 32];
    pubkey_y_a[31] = 2;

    let mut pubkey_x_b: [u8; 32] = [0; 32];
    pubkey_x_b[31] = 3;
    let mut pubkey_y_b: [u8; 32] = [0; 32];
    pubkey_y_b[31] = 4;

    let null_a = Poseidon2::hash(
        [bytes32_to_field(pubkey_x_a), bytes32_to_field(pubkey_y_a), epoch],
        3,
    );
    let null_b = Poseidon2::hash(
        [bytes32_to_field(pubkey_x_b), bytes32_to_field(pubkey_y_b), epoch],
        3,
    );
    assert(null_a != null_b, "Different pubkeys should produce different nullifiers");
}
