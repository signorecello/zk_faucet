import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ClaimStatus } from '../../hooks/useClaim';
import { mockModule, mockNetwork, mockClaimResponse, MOCK_RECIPIENT } from '../../test/fixtures';

// Mock wallet-config
vi.mock('../../lib/wallet-config', () => ({
  EPOCH_DURATION_SECONDS: 604800,
  getCurrentEpoch: () => 4300,
  buildDomainMessage: (epoch: number) =>
    `zk_faucet_v1:eth-balance:nullifier_seed:${epoch.toString().padStart(10, '0')}`,
  originChain: { id: 1, name: 'Ethereum' },
  MIN_BALANCE_WEI: 10000000000000000n,
}));

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>();
  return {
    ...actual,
    useAccount: () => ({ address: '0x1234567890abcdef1234567890abcdef12345678' }),
  };
});

import { ProveStep } from '../../components/Steps/02-ProveStep';

function makeClaimHook(overrides: Partial<{
  status: ClaimStatus;
  statusDetail: string;
  result: typeof mockClaimResponse | null;
  error: string | null;
  errorCode: string | null;
}> = {}) {
  return {
    claim: vi.fn(),
    status: (overrides.status ?? 'idle') as ClaimStatus,
    statusDetail: overrides.statusDetail ?? '',
    result: overrides.result ?? null,
    error: overrides.error ?? null,
    errorCode: overrides.errorCode ?? null,
    reset: vi.fn(),
  };
}

describe('ProveStep', () => {
  const defaultProps = {
    module: mockModule,
    recipient: MOCK_RECIPIENT,
    targetNetwork: 'sepolia',
    networks: [mockNetwork],
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders start button in idle state', () => {
    const claimHook = makeClaimHook();
    render(<ProveStep {...defaultProps} claimHook={claimHook} />);
    expect(screen.getByText('Generate ZK Proof & Claim')).toBeInTheDocument();
  });

  it('disables start button when recipient is missing', () => {
    const claimHook = makeClaimHook();
    render(<ProveStep {...defaultProps} recipient="" claimHook={claimHook} />);
    expect(screen.getByText('Generate ZK Proof & Claim')).toBeDisabled();
  });

  it('disables start button when targetNetwork is missing', () => {
    const claimHook = makeClaimHook();
    render(<ProveStep {...defaultProps} targetNetwork="" claimHook={claimHook} />);
    expect(screen.getByText('Generate ZK Proof & Claim')).toBeDisabled();
  });

  it('shows signing status label', () => {
    const claimHook = makeClaimHook({ status: 'signing', statusDetail: 'Please confirm' });
    render(<ProveStep {...defaultProps} claimHook={claimHook} />);
    expect(screen.getByText('Signing domain message...')).toBeInTheDocument();
    expect(screen.getByText('Please confirm')).toBeInTheDocument();
  });

  it('shows proving status label', () => {
    const claimHook = makeClaimHook({ status: 'proving', statusDetail: '60-90 seconds' });
    render(<ProveStep {...defaultProps} claimHook={claimHook} />);
    expect(screen.getByText('Computing ZK proof...')).toBeInTheDocument();
  });

  it('shows submitting status label', () => {
    const claimHook = makeClaimHook({ status: 'submitting' });
    render(<ProveStep {...defaultProps} claimHook={claimHook} />);
    expect(screen.getByText('Submitting claim...')).toBeInTheDocument();
  });

  it('shows generic error message', () => {
    const claimHook = makeClaimHook({
      status: 'error',
      error: 'Something went wrong',
      errorCode: null,
    });
    render(<ProveStep {...defaultProps} claimHook={claimHook} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('shows friendly ALREADY_CLAIMED error', () => {
    const claimHook = makeClaimHook({
      status: 'error',
      error: 'Already claimed',
      errorCode: 'ALREADY_CLAIMED',
    });
    render(<ProveStep {...defaultProps} claimHook={claimHook} />);
    expect(screen.getByText("You've already claimed this epoch.")).toBeInTheDocument();
  });

  it('shows friendly INVALID_PROOF error', () => {
    const claimHook = makeClaimHook({
      status: 'error',
      error: 'Invalid proof',
      errorCode: 'INVALID_PROOF',
    });
    render(<ProveStep {...defaultProps} claimHook={claimHook} />);
    expect(screen.getByText('The ZK proof could not be verified.')).toBeInTheDocument();
  });

  it('calls claim on start button click', () => {
    const claimHook = makeClaimHook();
    render(<ProveStep {...defaultProps} claimHook={claimHook} />);
    fireEvent.click(screen.getByText('Generate ZK Proof & Claim'));
    expect(claimHook.reset).toHaveBeenCalledOnce();
    expect(claimHook.claim).toHaveBeenCalledWith(
      '0x1234567890abcdef1234567890abcdef12345678',
      MOCK_RECIPIENT,
      'sepolia',
      mockModule,
    );
  });

  it('calls claim on Try Again click', () => {
    const claimHook = makeClaimHook({ status: 'error', error: 'fail' });
    render(<ProveStep {...defaultProps} claimHook={claimHook} />);
    fireEvent.click(screen.getByText('Try Again'));
    expect(claimHook.claim).toHaveBeenCalled();
  });
});
