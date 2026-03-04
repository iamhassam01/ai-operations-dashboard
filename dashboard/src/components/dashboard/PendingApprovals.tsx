'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Phone, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';

interface Approval {
  id: string;
  action_type: string;
  status: string;
  created_at: string;
  task_title: string | null;
  phone_number: string | null;
  notes: string;
}

function parseApprovalInfo(approval: Approval) {
  // Extract phone number and purpose from notes when joins return NULL
  let phone = approval.phone_number;
  let purpose = approval.task_title || '';

  if (approval.notes) {
    if (!phone) {
      const phoneMatch = approval.notes.match(/\+[1-9]\d{6,14}/);
      if (phoneMatch) phone = phoneMatch[0];
    }
    if (!purpose) {
      // notes format: "Call +number: purpose"
      const purposeMatch = approval.notes.match(/:\s*(.+)$/);
      purpose = purposeMatch ? purposeMatch[1] : approval.notes;
    }
  }

  return { phone, purpose };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
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
      queryClient.invalidateQueries({ queryKey: ['sidebar-stats'] });
      if (variables.status === 'approved') toast.success('Call approved — initiating...');
      else toast.info('Call approval rejected');
    },
    onError: () => {
      toast.error('Failed to update approval');
    },
  });

  // Don't render anything if no pending approvals
  if (!isLoading && (!approvals || approvals.length === 0)) return null;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-accent)] bg-[var(--surface-accent)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-[var(--text-primary)]" style={{ fontSize: 'var(--text-body)' }}>
            Pending Approvals
          </h3>
          {approvals && approvals.length > 0 && (
            <Badge variant="warning">{approvals.length}</Badge>
          )}
        </div>
        <span className="flex items-center gap-1 text-[var(--text-tertiary)]" style={{ fontSize: 'var(--text-caption)' }}>
          <Clock size={12} />
          Auto-refreshes
        </span>
      </div>
      <div className="space-y-2">
        {isLoading && (
          <p className="text-[var(--text-secondary)] text-center py-4" style={{ fontSize: 'var(--text-body-small)' }}>Loading...</p>
        )}
        {approvals?.map((approval) => {
          const { phone, purpose } = parseApprovalInfo(approval);
          return (
            <div
              key={approval.id}
              className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-primary)] p-4 hover:border-[var(--border-hover)] transition-colors duration-[var(--duration-fast)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="shrink-0 text-[var(--text-accent)]" />
                    <p className="font-medium text-[var(--text-primary)] truncate" style={{ fontSize: 'var(--text-body-small)' }}>
                      {phone ? `Call ${phone}` : 'Call request'}
                    </p>
                  </div>
                  <p className="mt-1 text-[var(--text-secondary)] line-clamp-2" style={{ fontSize: 'var(--text-caption)' }}>
                    {purpose}
                  </p>
                  <p className="mt-1 text-[var(--text-tertiary)]" style={{ fontSize: 'var(--text-caption)' }}>
                    {timeAgo(approval.created_at)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => mutation.mutate({ id: approval.id, status: 'approved' })}
                    disabled={mutation.isPending}
                    className="flex items-center gap-1 rounded-[var(--radius-md)] bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors duration-[var(--duration-fast)] disabled:opacity-50"
                  >
                    <CheckCircle size={14} />
                    Approve
                  </button>
                  <button
                    onClick={() => mutation.mutate({ id: approval.id, status: 'rejected' })}
                    disabled={mutation.isPending}
                    className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors duration-[var(--duration-fast)] disabled:opacity-50"
                  >
                    <XCircle size={14} />
                    Reject
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
