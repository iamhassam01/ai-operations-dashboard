'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, AlertTriangle } from 'lucide-react';
import { StatusDot } from '@/components/ui/Badge';
import { OverlineHeading } from '@/components/ui/OverlineHeading';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';

interface AgentLog {
  id: string;
  action: string;
  status: string;
  error_message: string;
  created_at: string;
}

const statusDotColor: Record<string, 'success' | 'error' | 'warning' | 'neutral'> = {
  success: 'success',
  failure: 'error',
  pending: 'warning',
};

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AgentActivity() {
  const { data: logs, isLoading, isError } = useQuery<AgentLog[]>({
    queryKey: ['agent-activity'],
    queryFn: () => fetch('/api/agent-logs?limit=8').then((r) => r.json()),
    refetchInterval: 15000,
  });

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-primary)] p-5">
      <OverlineHeading
        action={
          <Activity size={14} className="text-[var(--text-tertiary)]" />
        }
      >
        Agent Activity
      </OverlineHeading>

      <div className="mt-3 space-y-0 stagger-children">
        {isLoading && <SkeletonList count={4} />}

        {isError && (
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--status-error-surface)] p-3">
            <AlertTriangle size={14} className="shrink-0 text-[var(--interactive-destructive)]" />
            <p className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)' }}>Unable to load activity</p>
          </div>
        )}

        {logs?.map((log, index) => (
          <div
            key={log.id}
            className="relative flex items-start gap-3 py-2.5"
          >
            {/* Timeline connector */}
            {index < (logs?.length ?? 0) - 1 && (
              <div
                className="absolute left-[5px] top-[22px] bottom-0 w-px bg-[var(--border-subtle)]"
                aria-hidden="true"
              />
            )}

            <StatusDot
              color={statusDotColor[log.status] || 'neutral'}
              size="sm"
            />

            <div className="flex-1 min-w-0">
              <p
                className="text-[var(--text-secondary)]"
                style={{ fontSize: 'var(--text-body-small)' }}
              >
                {log.action}
              </p>
              {log.error_message && (
                <p
                  className="mt-0.5 text-[var(--interactive-destructive)]"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  {log.error_message}
                </p>
              )}
            </div>

            <span
              className="shrink-0 text-[var(--text-tertiary)] tabular-nums"
              style={{ fontSize: 'var(--text-caption)' }}
            >
              {formatTime(log.created_at)}
            </span>
          </div>
        ))}

        {!isLoading && (!logs || logs.length === 0) && (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            description="Agent activity will appear here once the system is active"
          />
        )}
      </div>
    </div>
  );
}
