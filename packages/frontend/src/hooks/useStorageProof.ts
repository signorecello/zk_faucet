import { useState, useCallback } from 'react';
import { createPublicClient, custom, type Chain } from 'viem';
import { mainnet, base, sepolia, holesky } from 'viem/chains';
import { useAppKitProvider } from '@reown/appkit/react';
import type { StorageProofResponse } from '../lib/api';

/** Map chain IDs to viem Chain objects for createPublicClient */
const VIEM_CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  8453: base,
  11155111: sepolia,
  17000: holesky,
};

type Status = 'idle' | 'fetching' | 'success' | 'error';

interface StorageProofState {
  fetchProof: (address: string, chainId: number) => Promise<StorageProofResponse>;
  proof: StorageProofResponse | null;
  status: Status;
  error: string | null;
}

export function useStorageProof(): StorageProofState {
  const { walletProvider } = useAppKitProvider('eip155');
  const [proof, setProof] = useState<StorageProofResponse | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const fetchProof = useCallback(async (address: string, chainId: number): Promise<StorageProofResponse> => {
    if (!walletProvider) {
      throw new Error('No wallet provider available.');
    }

    const chain = VIEM_CHAIN_MAP[chainId];
    if (!chain) {
      throw new Error(`Unsupported origin chain: ${chainId}`);
    }

    setStatus('fetching');
    setError(null);

    try {
      const client = createPublicClient({
        chain,
        transport: custom(walletProvider as any),
      });

      const block = await client.getBlock({ blockTag: 'latest' });

      const proofData = await client.getProof({
        address: address as `0x${string}`,
        storageKeys: [],
        blockNumber: block.number,
      });

      const result: StorageProofResponse = {
        balance: proofData.balance.toString(),
        nonce: proofData.nonce.toString(),
        codeHash: proofData.codeHash,
        storageHash: proofData.storageHash,
        accountProof: proofData.accountProof,
        stateRoot: block.stateRoot,
        blockNumber: block.number.toString(),
      };

      setProof(result);
      setStatus('success');
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus('error');
      throw err;
    }
  }, [walletProvider]);

  return { fetchProof, proof, status, error };
}
