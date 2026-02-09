'use client';

import { useQuery } from '@tanstack/react-query';
import { PhoneIncoming, PhoneOutgoing, Phone, ArrowRight, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { OverlineHeading } from '@/components/ui/OverlineHeading';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';

interface Call {
  id: string;
  direction: string;
  phone_number: string;
  caller_name: string;
  status: string;
  duration_seconds: number;
  summary: string;
  task_title: string;
  created_at: string;
}

const statusBadgeVariant: Record<string, 'success' | 'info' | 'error' | 'warning' | 'neutral'> = {
  completed: 'success',
  in_progress: 'info',
  failed: 'error',
  no_answer: 'warning',
  pending: 'neutral',
};

function formatDuration(seconds: number): string {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function RecentCalls() {
  const { data: calls, isLoading, isError } = useQuery<Call[]>({
    queryKey: ['recent-calls'],
    queryFn: () => fetch('/api/calls?limit=5').then((r) => r.json()),
    refetchInterval: 10000,
  });

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-primary)] p-5">
      <OverlineHeading
        action={
          <a
            href="/calls"
            className="inline-flex items-center gap-1 text-[var(--text-accent)] transition-colors duration-[var(--duration-fast)] hover:underline"
            style={{ fontSize: 'var(--text-caption)' }}
          >
            View All Calls
            <ArrowRight size={12} />
          </a>
        }
      >
        Recent Calls
      </OverlineHeading>

      <div className="mt-3 space-y-2 stagger-children">
        {isLoading && <SkeletonList count={3} />}

        {isError && (
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--status-error-surface)] p-3">
            <AlertTriangle size={14} className="shrink-0 text-[var(--interactive-destructive)]" />
            <p className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)' }}>Unable to load calls</p>
          </div>
        )}

        {calls?.map((call) => (
          <div
            key={call.id}
            className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 transition-all duration-[var(--duration-fast)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)]"
          >
            <div
              className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${
                call.direction === 'inbound'
                  ? 'bg-[var(--status-success-surface)]'
                  : 'bg-[var(--status-info-surface)]'
              }`}
            >
              {call.direction === 'inbound' ? (
                <PhoneIncoming size={14} className="text-[var(--text-primary)]" />
              ) : (
                <PhoneOutgoing size={14} className="text-[var(--text-accent)]" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p
                className="font-medium text-[var(--text-primary)] truncate"
                style={{ fontSize: 'var(--text-body-small)' }}
              >
                {call.caller_name || call.phone_number}
              </p>
              <p
                className="text-[var(--text-tertiary)] truncate"
                style={{ fontSize: 'var(--text-caption)' }}
              >
                {call.task_title || call.summary || 'No details'}
              </p>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span
                  className="font-medium text-[var(--text-primary)] tabular-nums"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  {formatDuration(call.duration_seconds)}
                </span>
                <Badge variant={statusBadgeVariant[call.status] || 'neutral'}>
                  {call.status}
                </Badge>
              </div>
            </div>
          </div>
        ))}

        {!isLoading && (!calls || calls.length === 0) && (
          <EmptyState
            icon={Phone}
            title="No calls yet"
            description="Calls will appear here once telephony is connected"
            tip="Configure Twilio in Settings to enable calling"
          />
        )}
      </div>
    </div>
  );
}
