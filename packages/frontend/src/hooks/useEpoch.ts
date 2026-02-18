import { useState, useEffect } from 'react';
import { EPOCH_DURATION_SECONDS, getCurrentEpoch } from '../lib/wallet-config';

interface EpochState {
  epoch: number;
  secondsRemaining: number;
}

function computeSecondsRemaining(epoch: number): number {
  const epochEndMs = (epoch + 1) * EPOCH_DURATION_SECONDS * 1000;
  return Math.max(0, Math.floor((epochEndMs - Date.now()) / 1000));
}

export function useEpoch(): EpochState {
  const [epoch, setEpoch] = useState(() => getCurrentEpoch());
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    computeSecondsRemaining(getCurrentEpoch()),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const currentEpoch = getCurrentEpoch();
      setEpoch(currentEpoch);
      setSecondsRemaining(computeSecondsRemaining(currentEpoch));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return { epoch, secondsRemaining };
}
