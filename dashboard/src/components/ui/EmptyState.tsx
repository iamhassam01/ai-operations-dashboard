import { type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  tip?: string;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, tip, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--surface-secondary)] mb-4">
        <Icon size={24} className="text-[var(--text-tertiary)]" strokeWidth={1.5} />
      </div>
      <h3
        className="text-[var(--text-heading)] font-semibold leading-[var(--leading-heading)] text-[var(--text-primary)] mb-1"
        style={{ fontSize: 'var(--text-heading)' }}
      >
        {title}
      </h3>
      <p className="text-[var(--text-body-small)] text-[var(--text-secondary)] max-w-[320px] mb-4" style={{ fontSize: 'var(--text-body-small)' }}>
        {description}
      </p>
      {action && <div className="mb-4">{action}</div>}
      {tip && (
        <>
          <div className="w-16 border-t border-[var(--border-subtle)] mb-3" />
          <p className="text-[var(--text-caption)] text-[var(--text-tertiary)] flex items-center gap-1.5" style={{ fontSize: 'var(--text-caption)' }}>
            <span>💡</span> {tip}
          </p>
        </>
      )}
    </div>
  );
}
