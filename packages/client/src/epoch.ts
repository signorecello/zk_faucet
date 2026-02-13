/** Epoch duration in seconds: 1 week (7 * 24 * 60 * 60) */
export const EPOCH_DURATION_SECONDS = 604_800;

/**
 * Returns the current epoch number.
 * epoch = floor(unix_timestamp / EPOCH_DURATION_SECONDS)
 * Must match server-side computation exactly.
 */
export function getCurrentEpoch(): number {
  return Math.floor(Date.now() / 1000 / EPOCH_DURATION_SECONDS);
}

/**
 * Returns the start and end unix timestamps for a given epoch.
 */
export function getEpochBounds(epoch: number): { start: number; end: number } {
  return {
    start: epoch * EPOCH_DURATION_SECONDS,
    end: (epoch + 1) * EPOCH_DURATION_SECONDS,
  };
}

/**
 * Returns true if the given epoch is the current epoch.
 */
export function isCurrentEpoch(epoch: number): boolean {
  return epoch === getCurrentEpoch();
}
