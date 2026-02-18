import { useState, useCallback } from 'react';
import { createPublicClient, custom } from 'viem';
import { useAppKitProvider } from '@reown/appkit/react';
import { originChain } from '../lib/wallet-config';
import type { StorageProofResponse } from '../lib/api';

type Status = 'idle' | 'fetching' | 'success' | 'error';

interface StorageProofState {
  fetchProof: (address: string) => Promise<StorageProofResponse>;
  proof: StorageProofResponse | null;
  status: Status;
  error: string | null;
}

export function useStorageProof(): StorageProofState {
  const { walletProvider } = useAppKitProvider('eip155');
  const [proof, setProof] = useState<StorageProofResponse | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const fetchProof = useCallback(async (address: string): Promise<StorageProofResponse> => {
    if (!walletProvider) {
      throw new Error('No wallet provider available.');
    }

    setStatus('fetching');
    setError(null);

    try {
      const client = createPublicClient({
        chain: originChain,
        transport: custom(walletProvider),
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
