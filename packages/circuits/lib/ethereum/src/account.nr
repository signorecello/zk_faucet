use crate::types::{Address, Hash};
use crate::fragment::Fragment;
use crate::bytes::right_pad;
use crate::rlp::{RlpFragment, decode_list_of_small_strings};
use crate::mpt::{Proof, ProofInput, verify_merkle_proof, MAX_ACCOUNT_LEAF_LEN, MAX_ACCOUNT_STATE_LEN, MAX_ACCOUNT_DEPTH};
use keccak256::keccak256;

// -- Constants --

// keccak256(address) = 32 bytes = 64 nibbles.
pub global KEY_NIBBLES: u32 = 64;

// Left-padded key array: 66 bytes (room for 33 packed bytes = 1 prefix + 32 hash).
pub global MAX_PREFIXED_KEY_LEN: u32 = 66;

// Account RLP has 4 fields: nonce, balance, storage_root, code_hash.
global ACCOUNT_FIELDS_COUNT: u32 = 4;
global BALANCE_INDEX: u32 = 1;

// -- Types --

pub type AccountProofInput = ProofInput<MAX_PREFIXED_KEY_LEN, MAX_ACCOUNT_STATE_LEN, MAX_ACCOUNT_DEPTH, MAX_ACCOUNT_LEAF_LEN>;
pub type AccountProof = Proof<MAX_ACCOUNT_DEPTH, MAX_ACCOUNT_LEAF_LEN>;

// -- Helpers --

// Convert a 32-byte key to a 64-nibble array.
pub fn key_to_nibbles(key: [u8; 32]) -> [u8; 64] {
    let mut nibbles: [u8; 64] = [0; 64];
    for i in 0..32 {
        nibbles[2 * i] = key[i] / 16;
        nibbles[2 * i + 1] = key[i] - 16 * (key[i] / 16);
    }
    nibbles
}

// Extract the balance (as Field) from an RLP-encoded account state.
// Account RLP = [nonce, balance, storage_root, code_hash].
pub fn extract_balance(account_rlp_padded: [u8; MAX_ACCOUNT_STATE_LEN]) -> Field {
    // The value is left-padded with zeros; strip them to get the actual RLP bytes.
    let (shifted_rlp, rlp_len) = right_pad(account_rlp_padded);
    let frag = Fragment::new_with_length(rlp_len, shifted_rlp);

    let rlp_list: BoundedVec<RlpFragment, ACCOUNT_FIELDS_COUNT> =
        decode_list_of_small_strings(frag);
    assert(rlp_list.len() == ACCOUNT_FIELDS_COUNT, "Account RLP must have 4 fields");

    let balance_field = rlp_list.get(BALANCE_INDEX);

    let mut balance: Field = 0;
    // Read balance bytes (big-endian variable-length integer).
    for i in 0..MAX_ACCOUNT_STATE_LEN {
        if (i >= balance_field.offset) & (i < balance_field.offset + balance_field.length) {
            balance = balance * 256 + shifted_rlp[i] as Field;
        }
    }
    balance
}

// -- Public API --

// Verify an Ethereum account proof and return the balance as a Field.
//
// 1. Asserts keccak256(address) matches the proof key.
// 2. Verifies the MPT proof against state_root.
// 3. Extracts and returns the balance from the RLP-encoded account state.
pub fn verify_account_balance(
    address: Address,
    state_root: Hash,
    proof_input: AccountProofInput,
) -> Field {
    // 1. Verify address -> key mapping.
    let address_hash: [u8; 32] = keccak256(address, 20);

    // The last 32 bytes of the proof key should equal keccak256(address).
    for i in 0..32 {
        assert(
            proof_input.key[MAX_PREFIXED_KEY_LEN - 32 + i] == address_hash[i],
            "Address hash does not match proof key",
        );
    }

    // 2. Convert key to nibbles and verify the MPT proof.
    let key_nibbles = key_to_nibbles(address_hash);
    verify_merkle_proof(key_nibbles, proof_input.value, state_root, proof_input.proof);

    // 3. Extract balance from verified account state.
    extract_balance(proof_input.value)
}

// -- Tests --

#[test]
fn test_key_to_nibbles() {
    let mut key: [u8; 32] = [0; 32];
    key[0] = 0xAB;
    key[31] = 0xCD;

    let nibbles = key_to_nibbles(key);
    assert(nibbles[0] == 0x0A);
    assert(nibbles[1] == 0x0B);
    assert(nibbles[62] == 0x0C);
    assert(nibbles[63] == 0x0D);
    assert(nibbles[2] == 0);
    assert(nibbles[3] == 0);
}

#[test]
fn test_extract_balance_simple() {
    // Hand-crafted RLP for account [nonce=0, balance=1000, storage_root=32 zeros, code_hash=32 zeros]
    // RLP encoding:
    //   nonce = 0: 0x80
    //   balance = 1000 (0x03E8): 0x82, 0x03, 0xE8
    //   storage_root = 32 bytes: 0xa0 + 32 zeros
    //   code_hash = 32 bytes: 0xa0 + 32 zeros
    //   Payload = 1 + 3 + 33 + 33 = 70 bytes
    //   List header: 70 > 55, long form: 0xf8, 0x46 (70)
    //   Total RLP: 72 bytes
    //
    // Left-padded into 110-byte array: 38 zero bytes then 72 bytes of RLP.
    let mut rlp: [u8; 110] = [0; 110];
    let off: u32 = 110 - 72; // = 38
    rlp[off]      = 0xf8;
    rlp[off + 1]  = 70;
    rlp[off + 2]  = 0x80;
    rlp[off + 3]  = 0x82;
    rlp[off + 4]  = 0x03;
    rlp[off + 5]  = 0xE8;
    rlp[off + 6]  = 0xa0;
    // bytes off+7..off+38 = zeros (dummy storage root)
    rlp[off + 39] = 0xa0;
    // bytes off+40..off+71 = zeros (dummy code hash)

    let balance = extract_balance(rlp);
    assert(balance == 1000);
}
