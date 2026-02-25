import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { mockNetwork, mockClaimResponse } from '../../test/fixtures';

// Mock wallet-config
vi.mock('../../lib/wallet-config', () => ({
  EPOCH_DURATION_SECONDS: 604800,
  getCurrentEpoch: () => 4300,
  originChain: { id: 1, name: 'Ethereum' },
  MIN_BALANCE_WEI: 10000000000000000n,
}));

import { ClaimStep } from '../../components/Steps/03-ClaimStep';

describe('ClaimStep', () => {
  const defaultProps = {
    networks: [mockNetwork],
    recipient: '',
    targetNetwork: '',
    onRecipientChange: vi.fn(),
    onNetworkChange: vi.fn(),
    result: null,
    loading: false,
  };

  it('renders recipient input and network select', () => {
    render(<ClaimStep {...defaultProps} />);
    expect(screen.getByLabelText('Recipient Address')).toBeInTheDocument();
    expect(screen.getByLabelText('Target Network')).toBeInTheDocument();
  });

  it('calls onRecipientChange when typing', () => {
    render(<ClaimStep {...defaultProps} />);
    const input = screen.getByLabelText('Recipient Address');
    fireEvent.change(input, { target: { value: '0xabc' } });
    expect(defaultProps.onRecipientChange).toHaveBeenCalledWith('0xabc');
  });

  it('shows network dropdown with enabled networks', () => {
    render(<ClaimStep {...defaultProps} />);
    const select = screen.getByLabelText('Target Network');
    expect(select).toBeInTheDocument();
    expect(screen.getByText(/Sepolia/)).toBeInTheDocument();
    expect(screen.getByText(/0\.1000 ETH/)).toBeInTheDocument();
  });

  it('calls onNetworkChange on select', () => {
    render(<ClaimStep {...defaultProps} />);
    const select = screen.getByLabelText('Target Network');
    fireEvent.change(select, { target: { value: 'sepolia' } });
    expect(defaultProps.onNetworkChange).toHaveBeenCalledWith('sepolia');
  });

  it('shows skeleton loader when loading', () => {
    render(<ClaimStep {...defaultProps} loading={true} />);
    expect(document.querySelector('.skeleton')).toBeInTheDocument();
  });

  it('filters out disabled networks', () => {
    const disabledNetwork = { ...mockNetwork, id: 'goerli', name: 'Goerli', enabled: false };
    render(<ClaimStep {...defaultProps} networks={[mockNetwork, disabledNetwork]} />);
    expect(screen.getByText(/Sepolia/)).toBeInTheDocument();
    expect(screen.queryByText(/Goerli/)).not.toBeInTheDocument();
  });

  it('renders ResultCard when result is present', () => {
    render(<ClaimStep {...defaultProps} result={mockClaimResponse} />);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('claim-123')).toBeInTheDocument();
  });
});
