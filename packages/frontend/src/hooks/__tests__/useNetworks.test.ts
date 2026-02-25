import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { mockNetwork, mockModule } from '../../test/fixtures';

// Mock wallet-config to avoid AppKit side effects
vi.mock('../../lib/wallet-config', () => ({
  EPOCH_DURATION_SECONDS: 604800,
  getCurrentEpoch: () => 4300,
  originChain: { id: 1, name: 'Ethereum' },
  MIN_BALANCE_WEI: 10000000000000000n,
}));

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    getNetworks: vi.fn(),
    getModules: vi.fn(),
    submitClaim: vi.fn(),
    getStatus: vi.fn(),
    getCircuitArtifact: vi.fn(),
  },
}));

vi.mock('../../lib/api', () => ({
  api: mockApi,
  ApiRequestError: class ApiRequestError extends Error {
    code: string;
    statusCode: number;
    constructor(message: string, code: string, statusCode: number) {
      super(message);
      this.name = 'ApiRequestError';
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

import { useNetworks } from '../useNetworks';

describe('useNetworks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches networks and modules on mount', async () => {
    mockApi.getNetworks.mockResolvedValue([mockNetwork]);
    mockApi.getModules.mockResolvedValue([mockModule]);

    const { result } = renderHook(() => useNetworks());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.networks).toEqual([mockNetwork]);
    expect(result.current.modules).toEqual([mockModule]);
    expect(result.current.error).toBeNull();
  });

  it('sets error on fetch failure', async () => {
    mockApi.getNetworks.mockRejectedValue(new Error('Network error'));
    mockApi.getModules.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useNetworks());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.networks).toEqual([]);
    expect(result.current.modules).toEqual([]);
  });

  it('handles non-Error thrown values', async () => {
    mockApi.getNetworks.mockRejectedValue('string error');
    mockApi.getModules.mockResolvedValue([]);

    const { result } = renderHook(() => useNetworks());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load data');
  });
});
