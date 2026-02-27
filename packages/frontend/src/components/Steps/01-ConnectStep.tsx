import { useDisconnect, useBalance, useSwitchChain } from 'wagmi';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { formatEther } from 'viem';
import { MIN_BALANCE_WEI } from '../../lib/wallet-config';
import type { Module } from '../../lib/api';

function truncateAddress(address: string): string {
  return address.slice(0, 6) + '...' + address.slice(-4);
}

function formatBalance(wei: bigint): string {
  return Number(formatEther(wei)).toFixed(4);
}

interface ConnectStepProps {
  modules: Module[];
  selectedModuleId: string;
  onModuleChange: (moduleId: string) => void;
  onContinue: () => void;
}

function ChainBalance({ chainId, minBalance }: { chainId: number; minBalance: bigint }) {
  const { address } = useAppKitAccount();
  const { data: balanceData } = useBalance({
    address: address as `0x${string}` | undefined,
    chainId,
  });

  const balance = balanceData?.value ?? null;
  const sufficient = balance !== null && balance >= minBalance;
  const balStr = balance !== null ? formatBalance(balance) : '...';

  return (
    <span className={`wallet-balance ${balance !== null ? (sufficient ? 'sufficient' : 'insufficient') : ''}`}>
      {balStr} ETH{balance !== null ? (sufficient ? ' [ok]' : ' [insufficient]') : ''}
    </span>
  );
}

export function ConnectStep({ modules, selectedModuleId, onModuleChange, onContinue }: ConnectStepProps) {
  const { address, isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const originModules = modules.filter((m) => m.originChainId != null);

  // Check default chain balance (first module or chain 1)
  const defaultChainId = originModules[0]?.originChainId ?? 1;
  const { data: defaultBalanceData } = useBalance({
    address: address as `0x${string}` | undefined,
    chainId: defaultChainId,
  });

  // Check second chain balance if available
  const secondChainId = originModules[1]?.originChainId;
  const { data: secondBalanceData } = useBalance({
    address: address as `0x${string}` | undefined,
    chainId: secondChainId,
  });

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

  const handleModuleChange = (moduleId: string) => {
    onModuleChange(moduleId);
    const mod = modules.find((m) => m.id === moduleId);
    if (mod?.originChainId) {
      switchChain?.({ chainId: mod.originChainId });
    }
  };

  const minBal = MIN_BALANCE_WEI;
  const balances = [defaultBalanceData?.value, secondBalanceData?.value].filter((b): b is bigint => b != null);
  const anyChainSufficient = balances.some((b) => b >= minBal);
  const allLoaded = (defaultBalanceData !== undefined) && (secondChainId == null || secondBalanceData !== undefined);

  return (
    <div>
      <div className="wallet-status connected">
        <div>
          <span className="wallet-address">{truncateAddress(address)}</span>
        </div>
        <button className="wallet-disconnect" onClick={() => disconnect()}>
          disconnect
        </button>
      </div>

      {originModules.length > 0 && (
        <div className="origin-balances">
          {originModules.map((mod) => (
            <button
              key={mod.id}
              type="button"
              className={`origin-balance-row${originModules.length > 1 ? ' selectable' : ''}${mod.id === selectedModuleId ? ' selected' : ''}`}
              onClick={() => originModules.length > 1 && handleModuleChange(mod.id)}
            >
              <span className="origin-chain-name">{mod.originChainName}</span>
              <ChainBalance
                chainId={mod.originChainId!}
                minBalance={mod.minBalanceWei ? BigInt(mod.minBalanceWei) : minBal}
              />
            </button>
          ))}
        </div>
      )}

      {allLoaded && !anyChainSufficient && (
        <div className="message message-error" style={{ marginBottom: 12 }}>
          Insufficient balance. You need at least {Number(formatEther(minBal)).toFixed(4)} ETH on any supported origin chain.
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={onContinue}
        disabled={!allLoaded || !anyChainSufficient}
      >
        Continue
      </button>
    </div>
  );
}
