import { type ReactNode } from 'react';

type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  neutral: {
    bg: 'bg-[var(--surface-secondary)]',
    text: 'text-[var(--text-secondary)]',
    dot: 'bg-[var(--text-tertiary)]',
  },
  accent: {
    bg: 'bg-[var(--surface-accent)]',
    text: 'text-[var(--text-accent)]',
    dot: 'bg-[var(--interactive-primary)]',
  },
  success: {
    bg: 'bg-[var(--status-success-surface)]',
    text: 'text-success-muted',
    dot: 'bg-success',
  },
  warning: {
    bg: 'bg-[var(--status-warning-surface)]',
    text: 'text-warning-muted',
    dot: 'bg-warning',
  },
  error: {
    bg: 'bg-[var(--status-error-surface)]',
    text: 'text-error-muted',
    dot: 'bg-error',
  },
  info: {
    bg: 'bg-[var(--status-info-surface)]',
    text: 'text-info-muted',
    dot: 'bg-info',
  },
};

export function Badge({ variant = 'neutral', children, dot = false, className = '' }: BadgeProps) {
  const styles = variantStyles[variant];
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full px-2 py-0.5
        text-[0.75rem] leading-4 font-medium
        ${styles.bg} ${styles.text}
        ${className}
      `.trim()}
      role="status"
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${styles.dot}`} />}
      {children}
    </span>
  );
}

/* ── Status Dot (standalone) ── */
type DotSize = 'sm' | 'md' | 'lg';

interface StatusDotProps {
  color?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'accent';
  size?: DotSize;
  pulse?: boolean;
  className?: string;
}

const dotSizes: Record<DotSize, string> = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
  lg: 'h-2.5 w-2.5',
};

const dotColors: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
  accent: 'bg-[var(--interactive-primary)]',
  neutral: 'bg-[var(--text-tertiary)]',
};

export function StatusDot({ color = 'neutral', size = 'md', pulse = false, className = '' }: StatusDotProps) {
  return (
    <span
      className={`
        inline-block rounded-full shrink-0
        ${dotSizes[size]}
        ${dotColors[color]}
        ${pulse ? 'animate-pulse-dot' : ''}
        ${className}
      `.trim()}
      aria-hidden="true"
    />
  );
}
