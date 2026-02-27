import { useState, useCallback } from 'react';
import type { StorageProofResponse } from '../lib/api';
import type { ProofResult } from '../lib/prove';

export type ProverStatus =
  | 'idle'
  | 'downloading'
  | 'executing'
  | 'proving'
  | 'success'
  | 'error';

interface ProverState {
  prove: (
    circuitArtifact: any,
    storageProof: StorageProofResponse,
    signature: string,
    address: string,
    epoch: number,
    minBalance: bigint,
  ) => Promise<ProofResult>;
  proof: ProofResult | null;
  status: ProverStatus;
  statusDetail: string;
  error: string | null;
  reset: () => void;
}

export function useProver(): ProverState {
  const [proof, setProof] = useState<ProofResult | null>(null);
  const [status, setStatus] = useState<ProverStatus>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setProof(null);
    setStatus('idle');
    setStatusDetail('');
    setError(null);
  }, []);

  const prove = useCallback(
    async (
      circuitArtifact: any,
      storageProof: StorageProofResponse,
      signature: string,
      address: string,
      epoch: number,
      minBalance: bigint,
    ): Promise<ProofResult> => {
      setStatus('executing');
      setError(null);

      try {
        const { generateProofInBrowser } = await import('../lib/prove');

        const result = await generateProofInBrowser(
          circuitArtifact,
          storageProof,
          signature,
          address,
          epoch,
          minBalance,
          (step, detail) => {
            if (step.includes('ZK proof')) {
              setStatus('proving');
            } else if (step.includes('witness')) {
              setStatus('executing');
            }
            setStatusDetail(detail ?? step);
          },
        );

        setProof(result);
        setStatus('success');
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setStatus('error');
        throw err;
      }
    },
    [],
  );

  return { prove, proof, status, statusDetail, error, reset };
}
