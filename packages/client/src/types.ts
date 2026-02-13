export interface ClaimRequest {
  moduleId: string;
  proof: string; // hex-encoded
  publicInputs: {
    stateRoot: string;
    epoch: number;
    minBalance: string;
    nullifier: string;
  };
  recipient: string; // 0x testnet address
  targetNetwork: string;
}

export interface ClaimResponse {
  claimId: string;
  txHash: string;
  network: string;
  amount: string;
}

export interface StatusResponse {
  claimId: string;
  status: "pending" | "confirmed" | "failed";
  txHash?: string;
  network?: string;
}

export interface NetworkInfo {
  id: string;
  name: string;
  chainId: number;
  enabled: boolean;
  dispensationWei: string;
}

export interface ModuleInfo {
  id: string;
  name: string;
  description: string;
  currentEpoch: number;
  epochDurationSeconds: number;
}

export interface StorageProofData {
  address: string;
  balance: bigint;
  nonce: bigint;
  codeHash: string;
  storageHash: string;
  accountProof: string[]; // RLP-encoded MPT nodes
  blockNumber: bigint;
  stateRoot: string;
}

export interface ProofInputs {
  // Private inputs
  address: Uint8Array;
  signature: { r: Uint8Array; s: Uint8Array; v: number };
  accountProofNodes: Uint8Array[];
  balance: bigint;
  nonce: bigint;
  codeHash: Uint8Array;
  storageRoot: Uint8Array;
  // Public inputs
  stateRoot: Uint8Array;
  epoch: number;
  minBalance: bigint;
}
