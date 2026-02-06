import { type ReactNode } from 'react';

interface OverlineHeadingProps {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function OverlineHeading({ children, action, className = '' }: OverlineHeadingProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <h3
        className="text-[var(--text-tertiary)] uppercase tracking-[0.05em] font-semibold select-none"
        style={{ fontSize: 'var(--text-overline)', lineHeight: 'var(--leading-caption)' }}
      >
        {children}
      </h3>
      {action && <div>{action}</div>}
    </div>
  );
}
