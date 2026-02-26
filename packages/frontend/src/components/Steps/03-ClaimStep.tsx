import { formatEther } from 'viem';
import type { ClaimResponse, Network } from '../../lib/api';
import { ResultCard } from '../ResultCard';

function formatWei(wei: string): string {
  return Number(formatEther(BigInt(wei))).toFixed(4) + ' ETH';
}

interface ClaimStepProps {
  networks: Network[];
  recipient: string;
  targetNetwork: string;
  onRecipientChange: (value: string) => void;
  onNetworkChange: (value: string) => void;
  result: ClaimResponse | null;
  loading: boolean;
}

export function ClaimStep({
  networks,
  recipient,
  targetNetwork,
  onRecipientChange,
  onNetworkChange,
  result,
  loading,
}: ClaimStepProps) {
  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(recipient);
  const showValidation = recipient.length > 0 && !isValidAddress;

  if (result) {
    return <ResultCard result={result} networks={networks} />;
  }

  return (
    <div>
      <div className="form-group">
        <label htmlFor="recipient-input">Recipient Address</label>
        <input
          type="text"
          id="recipient-input"
          placeholder="0x..."
          spellCheck={false}
          autoComplete="off"
          value={recipient}
          onChange={(e) => onRecipientChange(e.target.value)}
          style={showValidation ? { borderColor: 'var(--error)' } : undefined}
        />
      </div>

      <div className="form-group">
        <label htmlFor="network-select">Target Network</label>
        {loading ? (
          <div className="skeleton" />
        ) : (
          <select
            id="network-select"
            value={targetNetwork}
            onChange={(e) => onNetworkChange(e.target.value)}
          >
            <option value="">Select network...</option>
            {networks
              .filter((n) => n.enabled)
              .map((net) => (
                <option key={net.id} value={net.id}>
                  {net.name} ({formatWei(net.dispensationWei)})
                </option>
              ))}
          </select>
        )}
      </div>
    </div>
  );
}
