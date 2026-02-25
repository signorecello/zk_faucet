import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock wallet-config
vi.mock('../../lib/wallet-config', () => ({
  EPOCH_DURATION_SECONDS: 604800,
  getCurrentEpoch: () => 4300,
  originChain: { id: 1, name: 'Ethereum' },
  MIN_BALANCE_WEI: 10000000000000000n,
}));

import { ApiRequestError } from '../api';

describe('ApiRequestError', () => {
  it('has correct properties', () => {
    const err = new ApiRequestError('Not found', 'NOT_FOUND', 404);
    expect(err.message).toBe('Not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe('ApiRequestError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('ApiClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('getNetworks fetches /networks and extracts networks array', async () => {
    const mockNetworks = [{ id: 'sepolia', name: 'Sepolia' }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ networks: mockNetworks }),
    });

    // Re-import to get fresh api instance using mocked fetch
    const { api } = await import('../api');
    const result = await api.getNetworks();
    expect(result).toEqual(mockNetworks);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/networks',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('getModules fetches /modules and extracts modules array', async () => {
    const mockModules = [{ id: 'eth-balance', name: 'ETH Balance' }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ modules: mockModules }),
    });

    const { api } = await import('../api');
    const result = await api.getModules();
    expect(result).toEqual(mockModules);
  });

  it('submitClaim sends POST to /claim', async () => {
    const claimResponse = { claimId: 'abc', txHash: '0x123', network: 'sepolia', amount: '100' };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(claimResponse),
    });

    const { api } = await import('../api');
    const result = await api.submitClaim({
      moduleId: 'eth-balance',
      proof: '0xdeadbeef',
      publicInputs: {
        stateRoot: '0x123',
        epoch: 4300,
        minBalance: '10000000000000000',
        nullifier: '0xabc',
      },
      recipient: '0xrecipient',
      targetNetwork: 'sepolia',
    });

    expect(result).toEqual(claimResponse);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/claim',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws ApiRequestError on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({
          error: { code: 'ALREADY_CLAIMED', message: 'Already claimed' },
        }),
    });

    const { api } = await import('../api');

    await expect(api.getNetworks()).rejects.toThrow('Already claimed');
    try {
      await api.getNetworks();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect((err as ApiRequestError).code).toBe('ALREADY_CLAIMED');
      expect((err as ApiRequestError).statusCode).toBe(409);
    }
  });

  it('getStatus encodes claimId in URL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ claimId: 'test', status: 'confirmed' }),
    });

    const { api } = await import('../api');
    await api.getStatus('claim/with/slashes');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/status/claim%2Fwith%2Fslashes',
      expect.any(Object),
    );
  });

  it('getCircuitArtifact fetches without Content-Type header', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bytecode: '...' }),
    });

    const { api } = await import('../api');
    await api.getCircuitArtifact('eth-balance');
    expect(globalThis.fetch).toHaveBeenCalledWith('/circuits/eth-balance/artifact.json');
  });

  it('getCircuitArtifact throws on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { api } = await import('../api');
    await expect(api.getCircuitArtifact('eth-balance')).rejects.toThrow(
      'Failed to fetch circuit artifact',
    );
  });
});
