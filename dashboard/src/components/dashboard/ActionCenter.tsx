'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, ArrowRight, Zap, AlertTriangle } from 'lucide-react';
import { OverlineHeading } from '@/components/ui/OverlineHeading';
import { toast } from 'sonner';

interface Approval {
  id: string;
  task_id: string;
  action_type: string;
  status: string;
  created_at: string;
  task_title: string;
  phone_number: string;
  notes: string;
}

export function ActionCenter() {
  const queryClient = useQueryClient();

  const { data: approvals, isLoading } = useQuery<Approval[]>({
    queryKey: ['approvals'],
    queryFn: () => fetch('/api/approvals').then((r) => r.json()),
    refetchInterval: 5000,
  });

  const mutation = useMutation({
    mutationFn: (data: { id: string; status: string }) =>
      fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      if (variables.status === 'approved') toast.success('Approval granted');
      else toast.info('Approval rejected');
    },
    onError: () => {
      toast.error('Failed to update approval');
    },
  });

  // Don't render if loading or no pending items
  if (isLoading || !approvals || approvals.length === 0) {
    return null;
  }

  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--border-accent)] bg-[var(--surface-accent)] p-5"
    >
      <OverlineHeading className="text-[var(--text-accent)]">
        Action Required
      </OverlineHeading>

      <div className="mt-3 space-y-3">
        {approvals.map((approval) => (
          <div
            key={approval.id}
            className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-primary)] p-4 transition-colors duration-[var(--duration-fast)] hover:border-[var(--border-hover)]"
          >
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {approval.action_type === 'escalation' ? (
                    <AlertTriangle size={16} className="text-[var(--interactive-destructive)]" />
                  ) : (
                    <Zap size={16} className="text-[var(--text-accent)]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className="font-medium text-[var(--text-primary)]"
                    style={{ fontSize: 'var(--text-body)' }}
                  >
                    {approval.task_title || 'Untitled Task'}
                  </p>
                  <p
                    className="mt-0.5 text-[var(--text-secondary)]"
                    style={{ fontSize: 'var(--text-caption)' }}
                  >
                    {approval.action_type}
                    {approval.phone_number && ` · ${approval.phone_number}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => mutation.mutate({ id: approval.id, status: 'approved' })}
                  disabled={mutation.isPending}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--interactive-primary)] px-3 py-1.5 font-medium text-[var(--text-inverse)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--interactive-primary-hover)] disabled:opacity-50"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  <CheckCircle size={14} />
                  Approve
                </button>
                <button
                  onClick={() => mutation.mutate({ id: approval.id, status: 'rejected' })}
                  disabled={mutation.isPending}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--surface-secondary)] px-3 py-1.5 font-medium text-[var(--text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  <XCircle size={14} />
                  Reject
                </button>
                <a
                  href={`/tasks?task=${approval.task_id || ''}`}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--text-accent)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-hover)]"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  View Task
                  <ArrowRight size={12} />
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
