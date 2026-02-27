import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock wallet-config
vi.mock('../../lib/wallet-config', () => ({
  EPOCH_DURATION_SECONDS: 604800,
  getCurrentEpoch: () => 4300,
  originChain: { id: 1, name: 'Ethereum' },
  originNetwork: { id: 1, name: 'Ethereum' },
  MIN_BALANCE_WEI: 10000000000000000n,
}));

const mockOpen = vi.fn();
const mockDisconnect = vi.fn();
let mockAccount = { address: '', isConnected: false };
let mockBalanceData: { value: bigint } | undefined = undefined;

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open: mockOpen }),
  useAppKitAccount: () => mockAccount,
}));

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>();
  return {
    ...actual,
    useDisconnect: () => ({ disconnect: mockDisconnect }),
    useBalance: () => ({ data: mockBalanceData }),
    useSwitchChain: () => ({ switchChain: vi.fn() }),
  };
});

import { ConnectStep } from '../../components/Steps/01-ConnectStep';

describe('ConnectStep', () => {
  const onContinue = vi.fn();
  const onModuleChange = vi.fn();
  const defaultModules = [
    { id: 'eth-balance:1', name: 'ETH Balance (Ethereum)', description: '', currentEpoch: 1, epochDurationSeconds: 604800, originChainId: 1, originChainName: 'Ethereum' },
  ];
  const defaultProps = {
    modules: defaultModules,
    selectedModuleId: 'eth-balance:1',
    onModuleChange,
    onContinue,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAccount = { address: '', isConnected: false };
    mockBalanceData = undefined;
  });

  it('renders Connect Wallet button when disconnected', () => {
    render(<ConnectStep {...defaultProps} />);
    expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
  });

  it('opens wallet modal on Connect Wallet click', () => {
    render(<ConnectStep {...defaultProps} />);
    fireEvent.click(screen.getByText('Connect Wallet'));
    expect(mockOpen).toHaveBeenCalledOnce();
  });

  it('shows address and balance when connected with sufficient balance', () => {
    mockAccount = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
    };
    mockBalanceData = { value: 1000000000000000000n }; // 1 ETH

    render(<ConnectStep {...defaultProps} />);
    expect(screen.getByText('0x1234...5678')).toBeInTheDocument();
    expect(screen.getByText(/1\.0000 ETH/)).toBeInTheDocument();
    expect(screen.getByText(/\[ok\]/)).toBeInTheDocument();
  });

  it('shows insufficient balance warning', () => {
    mockAccount = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
    };
    mockBalanceData = { value: 1000000000000000n }; // 0.001 ETH (below threshold)

    render(<ConnectStep {...defaultProps} />);
    expect(screen.getByText(/\[insufficient\]/)).toBeInTheDocument();
    expect(screen.getByText(/Insufficient balance/)).toBeInTheDocument();
  });

  it('disables Continue button when balance is insufficient', () => {
    mockAccount = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
    };
    mockBalanceData = { value: 1000000000000000n };

    render(<ConnectStep {...defaultProps} />);
    expect(screen.getByText('Continue')).toBeDisabled();
  });

  it('enables Continue button when balance is sufficient', () => {
    mockAccount = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
    };
    mockBalanceData = { value: 1000000000000000000n };

    render(<ConnectStep {...defaultProps} />);
    const btn = screen.getByText('Continue');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('calls disconnect on disconnect button click', () => {
    mockAccount = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
    };
    mockBalanceData = { value: 1000000000000000000n };

    render(<ConnectStep {...defaultProps} />);
    fireEvent.click(screen.getByText('disconnect'));
    expect(mockDisconnect).toHaveBeenCalledOnce();
  });
});
