import type { ReactNode } from 'react';

interface StepContainerProps {
  stepNumber: number;
  title: string;
  isOpen: boolean;
  isCompleted: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function StepContainer({
  stepNumber,
  title,
  isOpen,
  isCompleted,
  onToggle,
  children,
}: StepContainerProps) {
  const stepClass = isCompleted ? 'completed' : isOpen ? 'active' : '';

  return (
    <div className="card">
      <h2
        onClick={onToggle}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <span
          className="step-number"
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.65rem',
            fontWeight: 600,
            border: `1px solid ${isCompleted ? 'var(--accent-dim)' : isOpen ? 'var(--accent)' : 'var(--text-muted)'}`,
            color: isCompleted || isOpen ? 'var(--bg-primary)' : 'var(--text-muted)',
            background: isCompleted
              ? 'var(--accent-dim)'
              : isOpen
                ? 'var(--accent)'
                : 'transparent',
            boxShadow: isOpen ? '0 0 8px rgba(0, 255, 136, 0.3)' : 'none',
            flexShrink: 0,
          }}
        >
          {isCompleted ? '\u2713' : stepNumber}
        </span>
        {title}
      </h2>
      {isOpen && <div className={`step-content ${stepClass}`}>{children}</div>}
    </div>
  );
}
