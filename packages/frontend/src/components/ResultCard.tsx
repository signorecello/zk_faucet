import type { ClaimResponse } from '../lib/api';
import type { Network } from '../lib/api';

function truncateAddress(address: string): string {
  return address.slice(0, 6) + '...' + address.slice(-4);
}

function formatWei(wei: string): string {
  const eth = Number(BigInt(wei)) / 1e18;
  return eth.toFixed(4) + ' ETH';
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

interface ResultCardProps {
  result: ClaimResponse;
  networks: Network[];
}

export function ResultCard({ result, networks }: ResultCardProps) {
  const net = networks.find((n) => n.id === result.network);
  const explorerUrl = net ? `${net.explorerUrl}/tx/${result.txHash}` : '';

  return (
    <div>
      <div className="success-check">
        <svg viewBox="0 0 52 52">
          <circle className="check-circle" cx="26" cy="26" r="25" />
          <path className="check-mark" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
        </svg>
      </div>
      <div className="result-card success-glow">
        <div className="result-row">
          <span className="result-label">Status</span>
          <span className="result-value">
            <span className="badge badge-confirmed">Confirmed</span>
          </span>
        </div>
        <div className="result-row">
          <span className="result-label">Claim ID</span>
          <span className="result-value">
            {result.claimId}
            <button
              className="copy-btn"
              title="Copy to clipboard"
              onClick={() => copyToClipboard(result.claimId)}
            >
              &#x2398;
            </button>
          </span>
        </div>
        <div className="result-row">
          <span className="result-label">Amount</span>
          <span className="result-value text-accent">{formatWei(result.amount)}</span>
        </div>
        <div className="result-row">
          <span className="result-label">Tx Hash</span>
          <span className="result-value">
            {explorerUrl ? (
              <a href={explorerUrl} target="_blank" rel="noopener" className="external-link">
                {truncateAddress(result.txHash)}
                <svg className="external-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            ) : (
              result.txHash
            )}
            <button
              className="copy-btn"
              title="Copy to clipboard"
              onClick={() => copyToClipboard(result.txHash)}
            >
              &#x2398;
            </button>
          </span>
        </div>
        <div className="result-row">
          <span className="result-label">Network</span>
          <span className="result-value">{net?.name ?? result.network}</span>
        </div>
      </div>
    </div>
  );
}
