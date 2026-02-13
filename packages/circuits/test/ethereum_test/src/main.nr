use ethereum::account::verify_account_balance;
use ethereum::mpt::{Proof, ProofInput};
use ethereum::types::Address;

// Test circuit for verifying Ethereum account balance via MPT proof.
//
// Inputs match the constants from the ethereum library:
//   MAX_PREFIXED_KEY_LEN = 66
//   MAX_ACCOUNT_STATE_LEN = 110
//   MAX_ACCOUNT_DEPTH = 10
//   MAX_NODE_LEN = 532
//   MAX_ACCOUNT_LEAF_LEN = 148
fn main(
    // -- private inputs --
    address: Address,
    state_root: [u8; 32],
    proof_key: [u8; 66],
    proof_value: [u8; 110],
    proof_nodes: [[u8; 532]; 10],
    proof_leaf: [u8; 148],
    proof_depth: u32,
    // -- public inputs --
    expected_balance: pub Field,
) {
    let proof = Proof {
        nodes: proof_nodes,
        leaf: proof_leaf,
        depth: proof_depth,
    };
    let proof_input = ProofInput {
        key: proof_key,
        value: proof_value,
        proof,
    };

    let balance = verify_account_balance(address, state_root, proof_input);
    assert(balance == expected_balance, "Balance mismatch");
}
