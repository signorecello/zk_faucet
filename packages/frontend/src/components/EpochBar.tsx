import { useEpoch } from '../hooks/useEpoch';

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Epoch ended';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

export function EpochBar() {
  const { epoch, secondsRemaining } = useEpoch();

  return (
    <div className="epoch-bar">
      <span className="epoch-label">
        Epoch <span>{epoch}</span>
      </span>
      <span className="epoch-value">{formatCountdown(secondsRemaining)}</span>
    </div>
  );
}
