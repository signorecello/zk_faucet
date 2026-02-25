import type { StorageProofResponse, ClaimResponse, Network, Module } from '../lib/api';
import type { ProofResult } from '../lib/prove';

export const MOCK_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
export const MOCK_RECIPIENT = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

export const mockNetwork: Network = {
  id: 'sepolia',
  name: 'Sepolia',
  chainId: 11155111,
  explorerUrl: 'https://sepolia.etherscan.io',
  enabled: true,
  dispensationWei: '100000000000000000',
};

export const mockModule: Module = {
  id: 'eth-balance',
  name: 'ETH Balance',
  description: 'Prove ETH balance on mainnet',
  currentEpoch: 4300,
  epochDurationSeconds: 604800,
};

export const mockStorageProof: StorageProofResponse = {
  balance: '1000000000000000000',
  nonce: '5',
  codeHash: '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
  storageHash: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
  accountProof: [
    '0xf90211a0abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  ],
  stateRoot: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  blockNumber: '18000000',
};

export const mockProofResult: ProofResult = {
  proof: '0xdeadbeef',
  publicInputs: {
    stateRoot: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    epoch: 4300,
    minBalance: '10000000000000000',
    nullifier: '0xabcdef',
  },
};

export const mockClaimResponse: ClaimResponse = {
  claimId: 'claim-123',
  txHash: '0xfeedface1234567890abcdef1234567890abcdef1234567890abcdef12345678',
  network: 'sepolia',
  amount: '100000000000000000',
};
