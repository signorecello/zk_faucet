use crate::fragment::Fragment;
use crate::rlp::{RlpFragment, decode_to_rlp_header, decode_list_of_small_strings, decode_list};
use crate::bytes::{byte_to_nibbles, bytes_to_nibbles, right_pad};
use crate::arrays::sub_array_equals_up_to_length;
use keccak256::keccak256;

// -- Constants --

pub global MAX_NODE_LEN: u32 = 532;
pub global MAX_ACCOUNT_LEAF_LEN: u32 = 148;
pub global MAX_ACCOUNT_STATE_LEN: u32 = 110;
pub global MAX_ACCOUNT_DEPTH: u32 = 10;

global BRANCH_NODE_NUM_FIELDS: u32 = 17;
global EXTENSION_NODE_NUM_FIELDS: u32 = 2;
global HASH_LEN: u32 = 32;

// Max bytes for an encoded key fragment inside a node (prefix byte + up to 32 key bytes).
global MAX_ENCODED_KEY_NIBBLES: u32 = 66;

// -- Proof types --

pub struct Proof<let MAX_DEPTH: u32, let MAX_LEAF_LEN: u32> {
    pub nodes: [[u8; MAX_NODE_LEN]; MAX_DEPTH],
    pub leaf: [u8; MAX_LEAF_LEN],
    pub depth: u32,
}

pub struct ProofInput<let MAX_KEY_LEN: u32, let MAX_VALUE_LEN: u32, let MAX_DEPTH: u32, let MAX_LEAF_LEN: u32> {
    pub key: [u8; MAX_KEY_LEN],
    pub value: [u8; MAX_VALUE_LEN],
    pub proof: Proof<MAX_DEPTH, MAX_LEAF_LEN>,
}

// -- Helpers --

// Compute the actual (unpadded) byte length of an RLP-encoded blob.
fn get_node_len<let MAX_LEN: u32>(node: [u8; MAX_LEN]) -> u32 {
    let header = decode_to_rlp_header(Fragment::from_array(node));
    let unpadded = header.offset + header.length;
    assert(unpadded <= MAX_LEN, "Node RLP length exceeds buffer");
    unpadded
}

// Hex-prefix parity: 0/1 = extension even/odd, 2/3 = leaf even/odd.
fn parity(prefix: u8) -> u32 {
    assert(prefix < 4, "Prefix must be 0, 1, 2 or 3");
    (prefix % 2) as u32
}

// Remove the hex-prefix from an encoded key fragment, returning raw nibbles.
fn strip_prefix(prefixed_key_bytes: Fragment<MAX_ENCODED_KEY_NIBBLES>) -> Fragment<MAX_ENCODED_KEY_NIBBLES> {
    let mut prefixed_key_nibbles = bytes_to_nibbles(prefixed_key_bytes);

    let prefix = prefixed_key_nibbles.pop_front();
    let par = parity(prefix);
    if par == 0 {
        let zero = prefixed_key_nibbles.pop_front();
        assert(zero == 0, "Expected zero after even-parity prefix");
    }
    prefixed_key_nibbles
}

// -- Core verification --

// Follow a branch node: use the current key nibble to pick the child hash.
fn extract_hash_from_branch_node<let KEY_NIB_LEN: u32>(
    node: [u8; MAX_NODE_LEN],
    node_rlp_list: BoundedVec<RlpFragment, BRANCH_NODE_NUM_FIELDS>,
    key_nibbles: [u8; KEY_NIB_LEN],
    key_ptr: &mut u32,
) -> [u8; 32] {
    let curr_nibble = key_nibbles[*key_ptr] as u32;
    let field = node_rlp_list.get(curr_nibble);
    assert(field.length == HASH_LEN, "Expected a 32-byte hash in branch node");
    *key_ptr += 1;

    let hash_frag: Fragment<MAX_NODE_LEN> = Fragment::new(field.offset, HASH_LEN, node);
    let focused: Fragment<32> = hash_frag.focus();
    focused.data
}

// Follow an extension node: verify the shared nibbles, then return the child hash.
fn extract_hash_from_extension_node<let KEY_NIB_LEN: u32>(
    node: [u8; MAX_NODE_LEN],
    node_rlp_list: BoundedVec<RlpFragment, EXTENSION_NODE_NUM_FIELDS>,
    key_nibbles: [u8; KEY_NIB_LEN],
    key_ptr: &mut u32,
) -> [u8; 32] {
    // Extract the encoded key part from the first field.
    let key_field = node_rlp_list.get(0);
    let prefixed_bytes: Fragment<MAX_ENCODED_KEY_NIBBLES> =
        Fragment::new(key_field.offset, key_field.length, node).focus();

    let (prefix_nib, _) = byte_to_nibbles(prefixed_bytes.at(0));
    assert((prefix_nib == 0) | (prefix_nib == 1), "Extension prefix must be 0 or 1");

    let extension_key_part = strip_prefix(prefixed_bytes);

    // Compare extension key nibbles against our key nibbles.
    for i in 0..MAX_ENCODED_KEY_NIBBLES {
        if i < extension_key_part.length {
            assert(
                extension_key_part.at(i) == key_nibbles[*key_ptr + i],
                "Extension key mismatch",
            );
        }
    }

    let hash_field = node_rlp_list.get(1);
    assert(hash_field.length == HASH_LEN, "Expected 32-byte hash at end of extension node");
    *key_ptr += extension_key_part.length;

    let hash_frag: Fragment<MAX_NODE_LEN> = Fragment::new(hash_field.offset, HASH_LEN, node);
    let focused: Fragment<32> = hash_frag.focus();
    focused.data
}

// Dispatch to branch or extension handler based on node field count.
fn extract_hash<let KEY_NIB_LEN: u32>(
    node: [u8; MAX_NODE_LEN],
    key_nibbles: [u8; KEY_NIB_LEN],
    key_ptr: &mut u32,
) -> [u8; 32] {
    let node_rlp_list: BoundedVec<RlpFragment, BRANCH_NODE_NUM_FIELDS> =
        decode_list_of_small_strings(Fragment::from_array(node));

    let num_fields = node_rlp_list.len();

    if num_fields == BRANCH_NODE_NUM_FIELDS {
        extract_hash_from_branch_node(node, node_rlp_list, key_nibbles, key_ptr)
    } else if num_fields == EXTENSION_NODE_NUM_FIELDS {
        // Re-decode as 2-field list for type compatibility.
        let ext_list: BoundedVec<RlpFragment, EXTENSION_NODE_NUM_FIELDS> =
            decode_list_of_small_strings(Fragment::from_array(node));
        extract_hash_from_extension_node(node, ext_list, key_nibbles, key_ptr)
    } else {
        assert(false, "Invalid node type: expected 17 (branch) or 2 (extension) fields");
        [0; 32]
    }
}

// Assert keccak256(node[0..actual_len]) == expected_hash.
fn verify_node_hash<let MAX_LEN: u32>(node: [u8; MAX_LEN], hash: [u8; 32]) {
    let len = get_node_len(node);
    assert(keccak256(node, len) == hash, "Invalid node hash");
}

// Verify the leaf node: check remaining key nibbles and value match.
fn verify_leaf<let MAX_LEAF_LEN: u32, let KEY_NIB_LEN: u32, let MAX_VALUE_LEN: u32>(
    leaf: [u8; MAX_LEAF_LEN],
    key_nibbles: [u8; KEY_NIB_LEN],
    key_ptr: &mut u32,
    value: [u8; MAX_VALUE_LEN],
) {
    let leaf_rlp: BoundedVec<RlpFragment, 2> = decode_list(Fragment::from_array(leaf));
    assert(leaf_rlp.len() == 2, "Leaf expected to have 2 fields");

    // -- key part --
    let key_field = leaf_rlp.get(0);
    let prefixed_bytes: Fragment<MAX_ENCODED_KEY_NIBBLES> =
        Fragment::new(key_field.offset, key_field.length, leaf).focus();

    let (prefix_nib, _) = byte_to_nibbles(prefixed_bytes.at(0));
    assert((prefix_nib == 2) | (prefix_nib == 3), "Leaf prefix must be 2 or 3");

    let leaf_key_part = strip_prefix(prefixed_bytes);
    for i in 0..MAX_ENCODED_KEY_NIBBLES {
        if i < leaf_key_part.length {
            assert(
                leaf_key_part.at(i) == key_nibbles[*key_ptr + i],
                "Key mismatch in leaf",
            );
        }
    }
    *key_ptr += leaf_key_part.length;
    assert(*key_ptr == KEY_NIB_LEN, "Expected to consume all key nibbles");

    // -- value part --
    let (value_data, value_len) = right_pad(value);
    let value_field = leaf_rlp.get(1);
    assert(value_field.length == value_len, "Value length mismatch");
    assert(
        sub_array_equals_up_to_length(value_data, leaf, value_field.offset, value_field.length),
        "Value mismatch",
    );
}

// -- Public API --

// Verify a Merkle-Patricia proof.
//
// key_nibbles: the 64-nibble path (one nibble per byte, values 0..15).
// value:       expected RLP-encoded value at the leaf.
// root:        expected root hash (32 bytes).
// proof:       the MPT proof (internal nodes + leaf + depth).
pub fn verify_merkle_proof<let KEY_NIB_LEN: u32, let MAX_VALUE_LEN: u32, let MAX_DEPTH: u32, let MAX_LEAF_LEN: u32>(
    key_nibbles: [u8; KEY_NIB_LEN],
    value: [u8; MAX_VALUE_LEN],
    root: [u8; 32],
    proof: Proof<MAX_DEPTH, MAX_LEAF_LEN>,
) {
    let mut key_ptr: u32 = 0;
    let mut curr_hash: [u8; 32] = root;

    // Walk the internal nodes.
    for i in 0..MAX_DEPTH {
        if i < proof.depth - 1 {
            verify_node_hash(proof.nodes[i], curr_hash);
            curr_hash = extract_hash(proof.nodes[i], key_nibbles, &mut key_ptr);
        }
    }

    // Verify leaf.
    verify_node_hash(proof.leaf, curr_hash);
    verify_leaf(proof.leaf, key_nibbles, &mut key_ptr, value);
}
