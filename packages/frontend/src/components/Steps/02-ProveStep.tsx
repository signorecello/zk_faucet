import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useClaim, type ClaimStatus } from '../../hooks/useClaim';
import type { Module, Network } from '../../lib/api';

const statusLabels: Record<ClaimStatus, string> = {
  idle: '',
  signing: 'Signing domain message...',
  'fetching-proof': 'Fetching storage proof...',
  'downloading-circuit': 'Loading circuit artifact...',
  proving: 'Computing ZK proof...',
  submitting: 'Submitting claim...',
  success: 'Claim successful!',
  error: 'Error',
};

interface ProveStepProps {
  module: Module | undefined;
  recipient: string;
  targetNetwork: string;
  networks: Network[];
  onSuccess: () => void;
  claimHook: ReturnType<typeof useClaim>;
}

export function ProveStep({
  module,
  recipient,
  targetNetwork,
  networks,
  onSuccess,
  claimHook,
}: ProveStepProps) {
  const { address } = useAccount();
  const { claim, status, statusDetail, result, error, errorCode, reset } = claimHook;

  const isActive = status !== 'idle' && status !== 'success' && status !== 'error';

  useEffect(() => {
    if (status === 'success') {
      onSuccess();
    }
  }, [status, onSuccess]);

  const handleStart = () => {
    if (!address || !module) return;
    reset();
    claim(address, recipient, targetNetwork, module);
  };

  const friendlyError = errorCode ? getFriendlyError(errorCode, error ?? '', module?.epochDurationSeconds) : null;

  return (
    <div>
      {status === 'idle' && (
        <div>
          <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
            This will sign a message, fetch a storage proof, and generate a ZK proof entirely
            in your browser. The process takes 60-90 seconds.
          </p>
          <button
            className="btn btn-primary"
            onClick={handleStart}
            disabled={!address || !module || !recipient || !targetNetwork}
          >
            Generate ZK Proof &amp; Claim
          </button>
        </div>
      )}

      {isActive && (
        <div className="proving-progress">
          <div className="proving-spinner" />
          <div className="proving-step">{statusLabels[status]}</div>
          {statusDetail && <div className="proving-detail">{statusDetail}</div>}
        </div>
      )}

      {status === 'error' && (
        <div>
          <div className="message message-error">
            {friendlyError?.message ?? error}
            {friendlyError?.hint && (
              <span className="error-hint">{friendlyError.hint}</span>
            )}
          </div>
          <button className="btn btn-secondary" onClick={handleStart} style={{ marginTop: 12 }}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

interface FriendlyError {
  message: string;
  hint: string;
}

function getFriendlyError(
  code: string,
  originalMessage: string,
  epochDurationSeconds?: number,
): FriendlyError | null {
  const durationHrs = epochDurationSeconds ? Math.round(epochDurationSeconds / 3600) : 24;

  const errorMap: Record<string, FriendlyError> = {
    ALREADY_CLAIMED: {
      message: "You've already claimed this epoch.",
      hint: `Each wallet can claim once per epoch. Try again after the epoch resets (every ${durationHrs}h).`,
    },
    INVALID_PROOF: {
      message: 'The ZK proof could not be verified.',
      hint: "Try reconnecting your wallet and submitting again. If the issue persists, your wallet's balance may have changed.",
    },
    INSUFFICIENT_BALANCE: {
      message: 'Your ETH balance is too low.',
      hint: 'You need a minimum ETH balance on the origin chain to claim testnet funds.',
    },
    RATE_LIMITED: {
      message: 'Too many requests.',
      hint: 'Please wait a moment before trying again.',
    },
    NETWORK_UNAVAILABLE: {
      message: 'The selected network is currently unavailable.',
      hint: 'Try a different target network, or check back later.',
    },
    FAUCET_DRAINED: {
      message: 'The faucet is temporarily out of funds.',
      hint: 'The faucet wallet needs to be refilled. Please try again later.',
    },
  };

  return errorMap[code] ?? null;
}
