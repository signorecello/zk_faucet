import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  MOCK_ADDRESS,
  MOCK_RECIPIENT,
  mockModule,
  mockStorageProof,
  mockProofResult,
  mockClaimResponse,
} from '../../test/fixtures';

// --- Hoisted mocks (available inside vi.mock factories) ---

const { mockSignMessageAsync, mockFetchProof, mockProve, mockApi } = vi.hoisted(() => ({
  mockSignMessageAsync: vi.fn(),
  mockFetchProof: vi.fn(),
  mockProve: vi.fn(),
  mockApi: {
    getNetworks: vi.fn(),
    getModules: vi.fn(),
    submitClaim: vi.fn(),
    getStatus: vi.fn(),
    getCircuitArtifact: vi.fn(),
  },
}));

// Mock wallet-config (avoid AppKit init)
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
    useSignMessage: () => ({ signMessageAsync: mockSignMessageAsync }),
  };
});

vi.mock('../useStorageProof', () => ({
  useStorageProof: () => ({
    fetchProof: mockFetchProof,
    proof: null,
    status: 'idle',
    error: null,
  }),
}));

vi.mock('../useProver', () => ({
  useProver: () => ({
    prove: mockProve,
    proof: null,
    status: 'idle',
    statusDetail: '',
    error: null,
    reset: vi.fn(),
  }),
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

import { useClaim } from '../useClaim';
import { ApiRequestError } from '../../lib/api';

describe('useClaim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupHappyPath() {
    mockSignMessageAsync.mockResolvedValue('0xsig');
    mockFetchProof.mockResolvedValue(mockStorageProof);
    mockApi.getCircuitArtifact.mockResolvedValue({ bytecode: '...' });
    mockProve.mockResolvedValue(mockProofResult);
    mockApi.submitClaim.mockResolvedValue(mockClaimResponse);
  }

  it('starts in idle state', () => {
    const { result } = renderHook(() => useClaim());
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it('happy path: idle -> success with all mocks called', async () => {
    setupHappyPath();
    const { result } = renderHook(() => useClaim());

    await act(async () => {
      await result.current.claim(
        MOCK_ADDRESS,
        MOCK_RECIPIENT,
        'sepolia',
        mockModule,
      );
    });

    expect(result.current.status).toBe('success');
    expect(result.current.result).toEqual(mockClaimResponse);
    expect(result.current.error).toBeNull();

    // Verify all mocks called in order
    expect(mockSignMessageAsync).toHaveBeenCalledOnce();
    expect(mockFetchProof).toHaveBeenCalledWith(MOCK_ADDRESS, 1);
    expect(mockApi.getCircuitArtifact).toHaveBeenCalledWith('eth-balance:1');
    expect(mockProve).toHaveBeenCalledWith(
      { bytecode: '...' },
      mockStorageProof,
      '0xsig',
      MOCK_ADDRESS,
      4300,
      10000000000000000n,
    );
    expect(mockApi.submitClaim).toHaveBeenCalledWith({
      moduleId: 'eth-balance:1',
      proof: mockProofResult.proof,
      publicInputs: mockProofResult.publicInputs,
      recipient: MOCK_RECIPIENT,
      targetNetwork: 'sepolia',
    });
  });

  it('signature rejected -> error', async () => {
    mockSignMessageAsync.mockRejectedValue(new Error('User denied message signature'));

    const { result } = renderHook(() => useClaim());

    await act(async () => {
      await result.current.claim(MOCK_ADDRESS, MOCK_RECIPIENT, 'sepolia', mockModule);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Signature request was rejected.');
    expect(result.current.errorCode).toBeNull();
  });

  it('storage proof failure -> error', async () => {
    mockSignMessageAsync.mockResolvedValue('0xsig');
    mockFetchProof.mockRejectedValue(new Error('RPC timeout'));

    const { result } = renderHook(() => useClaim());

    await act(async () => {
      await result.current.claim(MOCK_ADDRESS, MOCK_RECIPIENT, 'sepolia', mockModule);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('Failed to fetch storage proof');
    expect(result.current.error).toContain('RPC timeout');
  });

  it('circuit download failure -> error', async () => {
    mockSignMessageAsync.mockResolvedValue('0xsig');
    mockFetchProof.mockResolvedValue(mockStorageProof);
    mockApi.getCircuitArtifact.mockRejectedValue(new Error('404'));

    const { result } = renderHook(() => useClaim());

    await act(async () => {
      await result.current.claim(MOCK_ADDRESS, MOCK_RECIPIENT, 'sepolia', mockModule);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('Failed to load circuit');
  });

  it('API returns ALREADY_CLAIMED -> error with errorCode', async () => {
    mockSignMessageAsync.mockResolvedValue('0xsig');
    mockFetchProof.mockResolvedValue(mockStorageProof);
    mockApi.getCircuitArtifact.mockResolvedValue({ bytecode: '...' });
    mockProve.mockResolvedValue(mockProofResult);
    mockApi.submitClaim.mockRejectedValue(
      new ApiRequestError('Already claimed this epoch', 'ALREADY_CLAIMED', 409),
    );

    const { result } = renderHook(() => useClaim());

    await act(async () => {
      await result.current.claim(MOCK_ADDRESS, MOCK_RECIPIENT, 'sepolia', mockModule);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Already claimed this epoch');
    expect(result.current.errorCode).toBe('ALREADY_CLAIMED');
  });

  it('reset() clears error and returns to idle', async () => {
    mockSignMessageAsync.mockRejectedValue(new Error('User denied'));

    const { result } = renderHook(() => useClaim());

    await act(async () => {
      await result.current.claim(MOCK_ADDRESS, MOCK_RECIPIENT, 'sepolia', mockModule);
    });

    expect(result.current.status).toBe('error');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.errorCode).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it('reset() clears success result', async () => {
    setupHappyPath();

    const { result } = renderHook(() => useClaim());

    await act(async () => {
      await result.current.claim(MOCK_ADDRESS, MOCK_RECIPIENT, 'sepolia', mockModule);
    });

    expect(result.current.status).toBe('success');
    expect(result.current.result).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
  });
});
