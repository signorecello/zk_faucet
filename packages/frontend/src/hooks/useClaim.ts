import { useState, useCallback } from 'react';
import { useSignMessage } from 'wagmi';
import { api, ApiRequestError, type ClaimResponse, type Module } from '../lib/api';
import { buildDomainMessage, MIN_BALANCE_WEI } from '../lib/wallet-config';
import { useStorageProof } from './useStorageProof';
import { useProver } from './useProver';

export type ClaimStatus =
  | 'idle'
  | 'signing'
  | 'fetching-proof'
  | 'downloading-circuit'
  | 'proving'
  | 'submitting'
  | 'success'
  | 'error';

interface ClaimState {
  claim: (
    address: string,
    recipient: string,
    targetNetwork: string,
    module: Module,
  ) => Promise<void>;
  status: ClaimStatus;
  statusDetail: string;
  result: ClaimResponse | null;
  error: string | null;
  errorCode: string | null;
  reset: () => void;
}

export function useClaim(): ClaimState {
  const [status, setStatus] = useState<ClaimStatus>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [result, setResult] = useState<ClaimResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const { signMessageAsync } = useSignMessage();
  const { fetchProof } = useStorageProof();
  const { prove } = useProver();

  const reset = useCallback(() => {
    setStatus('idle');
    setStatusDetail('');
    setResult(null);
    setError(null);
    setErrorCode(null);
  }, []);

  const claim = useCallback(
    async (
      address: string,
      recipient: string,
      targetNetwork: string,
      module: Module,
    ) => {
      setStatus('signing');
      setStatusDetail('Please confirm in your wallet');
      setError(null);
      setErrorCode(null);
      setResult(null);

      try {
        const epoch = module.currentEpoch;
        const originChainId = module.originChainId ?? 1;
        const minBalance = module.minBalanceWei ? BigInt(module.minBalanceWei) : MIN_BALANCE_WEI;

        // Step 1: Sign domain message
        const message = buildDomainMessage(epoch);
        let signature: string;
        try {
          signature = await signMessageAsync({ message });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('User denied') || msg.includes('rejected')) {
            throw new Error('Signature request was rejected.');
          }
          throw new Error('Failed to sign message: ' + msg);
        }

        // Step 2: Fetch storage proof on the selected origin chain
        setStatus('fetching-proof');
        setStatusDetail(`Querying ${module.originChainName ?? 'origin chain'} via your wallet's RPC`);

        let storageProof;
        try {
          storageProof = await fetchProof(address, originChainId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error('Failed to fetch storage proof: ' + msg);
        }

        // Step 3: Download circuit artifact
        setStatus('downloading-circuit');
        setStatusDetail('Downloading compiled circuit (~5 MB)');

        let circuitArtifact;
        try {
          circuitArtifact = await api.getCircuitArtifact(module.id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error('Failed to load circuit: ' + msg);
        }

        // Step 4: Generate ZK proof with module's min balance
        setStatus('proving');
        setStatusDetail('This may take 60-90 seconds');

        const proofResult = await prove(
          circuitArtifact,
          storageProof,
          signature,
          address,
          epoch,
          minBalance,
        );

        // Step 5: Submit claim
        setStatus('submitting');
        setStatusDetail('Sending proof to the faucet');

        const claimResult = await api.submitClaim({
          moduleId: module.id,
          proof: proofResult.proof,
          publicInputs: proofResult.publicInputs,
          recipient,
          targetNetwork,
        });

        setResult(claimResult);
        setStatus('success');
      } catch (err) {
        if (err instanceof ApiRequestError) {
          setError(err.message);
          setErrorCode(err.code);
        } else {
          setError(err instanceof Error ? err.message : String(err));
          setErrorCode(null);
        }
        setStatus('error');
      }
    },
    [signMessageAsync, fetchProof, prove],
  );

  return { claim, status, statusDetail, result, error, errorCode, reset };
}
