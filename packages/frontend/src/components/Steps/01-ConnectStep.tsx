import { useDisconnect, useBalance } from 'wagmi';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { originChain, MIN_BALANCE_WEI } from '../../lib/wallet-config';

function truncateAddress(address: string): string {
  return address.slice(0, 6) + '...' + address.slice(-4);
}

function formatBalance(wei: bigint): string {
  return (Number(wei) / 1e18).toFixed(4);
}

interface ConnectStepProps {
  onContinue: () => void;
}

export function ConnectStep({ onContinue }: ConnectStepProps) {
  const { address, isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { data: balanceData } = useBalance({
    address: address as `0x${string}` | undefined,
    chainId: originChain.id as number,
  });

  const balance = balanceData?.value ?? null;
  const hasSufficientBalance = balance !== null && balance >= MIN_BALANCE_WEI;

  if (!isConnected || !address) {
    return (
      <div>
        <button
          className="btn btn-secondary"
          onClick={() => open()}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  const balStr = balance !== null ? formatBalance(balance) : '...';
  const balClass = balance !== null ? (hasSufficientBalance ? 'sufficient' : 'insufficient') : '';
  const checkMark = balance !== null ? (hasSufficientBalance ? ' [ok]' : ' [insufficient]') : '';

  return (
    <div>
      <div className="wallet-status connected">
        <div>
          <span className="wallet-address">{truncateAddress(address)}</span>
          <span className={`wallet-balance ${balClass}`}>
            {balStr} ETH{checkMark}
          </span>
        </div>
        <button className="wallet-disconnect" onClick={() => disconnect()}>
          disconnect
        </button>
      </div>

      {!hasSufficientBalance && balance !== null && (
        <div className="message message-error" style={{ marginBottom: 12 }}>
          Insufficient balance. You need at least {(Number(MIN_BALANCE_WEI) / 1e18).toFixed(4)} ETH on {originChain.name}.
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={onContinue}
        disabled={!hasSufficientBalance}
      >
        Continue
      </button>
    </div>
  );
}
