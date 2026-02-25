import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock wallet-config to avoid AppKit side effects
vi.mock('../../lib/wallet-config', () => ({
  EPOCH_DURATION_SECONDS: 604800,
  getCurrentEpoch: () => Math.floor(Date.now() / 1000 / 604800),
}));

import { useEpoch } from '../useEpoch';

describe('useEpoch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the current epoch', () => {
    const { result } = renderHook(() => useEpoch());
    const expected = Math.floor(Date.now() / 1000 / 604800);
    expect(result.current.epoch).toBe(expected);
  });

  it('returns positive secondsRemaining', () => {
    const { result } = renderHook(() => useEpoch());
    expect(result.current.secondsRemaining).toBeGreaterThan(0);
    expect(result.current.secondsRemaining).toBeLessThanOrEqual(604800);
  });

  it('updates on interval tick', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEpoch());
    const initial = result.current.secondsRemaining;

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // After 2 seconds, remaining should decrease by ~2
    expect(result.current.secondsRemaining).toBeLessThanOrEqual(initial);
    vi.useRealTimers();
  });
});
