'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { SkeletonStat } from '@/components/ui/Skeleton';
import { AlertTriangle } from 'lucide-react';

interface StatItem {
  label: string;
  value: number | string;
  context?: string;
  variant?: 'default' | 'warning';
  suffix?: string;
  href?: string;
}

export function QuickStats() {
  const router = useRouter();
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['stats'],
    queryFn: () => fetch('/api/stats').then((r) => r.json()),
    refetchInterval: 30000,
  });

  const statItems: StatItem[] = [
    {
      label: 'Calls Today',
      value: stats?.calls_today ?? 0,
    },
    {
      label: 'Tasks Done',
      value: stats?.completed ?? 0,
    },
    {
      label: 'Pending',
      value: stats?.pending_approvals ?? 0,
    },
    {
      label: 'Escalated',
      value: stats?.escalated ?? 0,
      context: stats?.escalated > 0 ? 'needs attention' : undefined,
      variant: stats?.escalated > 0 ? 'warning' : 'default',
      href: '/tasks?status=escalated',
    },
    {
      label: 'Success Rate',
      value: stats?.success_rate ?? 0,
      suffix: '%',
      context: 'tasks completed',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--status-error-surface)] p-4 flex items-center gap-3">
        <AlertTriangle size={18} className="shrink-0 text-[var(--interactive-destructive)]" />
        <p className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-body-small)' }}>
          Unable to load stats. Data will refresh automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 stagger-children">
      {statItems.map((stat) => (
        <div
          key={stat.label}
          onClick={stat.href ? () => router.push(stat.href!) : undefined}
          role={stat.href ? 'link' : undefined}
          tabIndex={stat.href ? 0 : undefined}
          className={`rounded-[var(--radius-lg)] border p-4 transition-shadow duration-[var(--duration-fast)] hover:shadow-sm ${
            stat.variant === 'warning'
              ? 'border-[var(--border-accent)] bg-[var(--status-warning-surface)]'
              : 'border-[var(--border-default)] bg-[var(--surface-primary)]'
          } ${stat.href ? 'cursor-pointer hover:border-[var(--border-hover)]' : ''}`}
        >
          <p
            className="font-semibold uppercase tracking-[0.05em] text-[var(--text-tertiary)]"
            style={{ fontSize: 'var(--text-overline)' }}
          >
            {stat.label}
          </p>
          <p
            className="mt-1 font-bold text-[var(--text-primary)] tabular-nums"
            style={{ fontSize: 'var(--text-metric)' }}
          >
            {stat.value}{stat.suffix || ''}
          </p>
          {stat.context && (
            <p
              className="mt-0.5 text-[var(--text-secondary)]"
              style={{ fontSize: 'var(--text-caption)' }}
            >
              {stat.context}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
