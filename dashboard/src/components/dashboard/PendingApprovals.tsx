'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface Approval {
  id: string;
  action_type: string;
  status: string;
  created_at: string;
  task_title: string;
  phone_number: string;
  notes: string;
}

export function PendingApprovals() {
  const queryClient = useQueryClient();

  const { data: approvals, isLoading } = useQuery<Approval[]>({
    queryKey: ['approvals'],
    queryFn: () => fetch('/api/approvals').then(r => r.json()),
    refetchInterval: 5000,
  });

  const mutation = useMutation({
    mutationFn: (data: { id: string; status: string; notes?: string }) =>
      fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
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

  return (
    <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-[var(--color-text)]">Pending Approvals</h3>
        <span className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
          <Clock size={12} />
          Auto-refreshes
        </span>
      </div>
      <div className="space-y-3">
        {isLoading && (
          <p className="text-sm text-[var(--color-text-secondary)] text-center py-6">Loading...</p>
        )}
        {approvals?.map((approval) => (
          <div key={approval.id} className="rounded-lg border border-[var(--color-border)] p-4 hover:border-[var(--color-border-hover)] transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {approval.task_title || 'Untitled Task'}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                  <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-blue-700 dark:text-blue-300">
                    {approval.action_type}
                  </span>
                  {approval.phone_number && (
                    <span>{approval.phone_number}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => mutation.mutate({ id: approval.id, status: 'approved' })}
                  disabled={mutation.isPending}
                  className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <CheckCircle size={14} />
                  Approve
                </button>
                <button
                  onClick={() => mutation.mutate({ id: approval.id, status: 'rejected' })}
                  disabled={mutation.isPending}
                  className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  <XCircle size={14} />
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
        {!isLoading && (!approvals || approvals.length === 0) && (
          <div className="text-center py-8">
            <CheckCircle className="mx-auto text-green-400 dark:text-green-500 mb-2" size={24} />
            <p className="text-sm text-[var(--color-text-secondary)]">No pending approvals</p>
          </div>
        )}
      </div>
    </div>
  );
}
