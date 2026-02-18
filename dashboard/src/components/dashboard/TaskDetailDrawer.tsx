'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, ArrowLeft, PhoneIncoming, PhoneOutgoing, CheckCircle, XCircle, Pause, Play } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { OverlineHeading } from '@/components/ui/OverlineHeading';
import { toast } from 'sonner';

interface TaskDetail {
  id: string;
  type: string;
  priority: string;
  title: string;
  description: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  preferred_time_1: string;
  preferred_time_2: string;
  constraints: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Call {
  id: string;
  direction: string;
  phone_number: string;
  caller_name: string;
  status: string;
  duration_seconds: number;
  created_at: string;
}

interface Approval {
  id: string;
  action_type: string;
  status: string;
  created_at: string;
  task_title: string;
  phone_number: string;
  notes: string;
}

interface AgentLog {
  id: string;
  action: string;
  status: string;
  created_at: string;
}

const statusBadgeVariant: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info'> = {
  new: 'info',
  pending_approval: 'warning',
  approved: 'success',
  in_progress: 'accent',
  completed: 'neutral',
  cancelled: 'error',
  escalated: 'error',
  pending_user_input: 'warning',
  scheduled: 'info',
  closed: 'neutral',
};

const allStatuses = [
  'new',
  'pending_approval',
  'approved',
  'in_progress',
  'pending_user_input',
  'scheduled',
  'completed',
  'cancelled',
  'escalated',
  'closed',
];

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  // If it looks like a datetime-local value (YYYY-MM-DDTHH:MM), display nicely
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function titleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TaskDetailDrawer({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: task, isLoading } = useQuery<TaskDetail>({
    queryKey: ['task-detail', taskId],
    queryFn: () => fetch(`/api/tasks/${taskId}`).then((r) => r.json()),
    enabled: !!taskId,
  });

  const { data: calls } = useQuery<Call[]>({
    queryKey: ['task-calls', taskId],
    queryFn: () => fetch(`/api/calls?task_id=${taskId}`).then((r) => r.json()),
    enabled: !!taskId,
  });

  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ['task-approvals', taskId],
    queryFn: () => fetch(`/api/approvals?task_id=${taskId}`).then((r) => r.json()),
    enabled: !!taskId,
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['recent-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast.success('Status updated');
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/tasks/${taskId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => {
        if (!r.ok) throw new Error('Failed to resume task');
        return r.json();
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['recent-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(data.message || 'Task resumed — agent is processing it');
    },
    onError: () => toast.error('Failed to resume task'),
  });

  const approvalMutation = useMutation({
    mutationFn: (data: { id: string; status: string }) =>
      fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-approvals', taskId] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      if (variables.status === 'approved') toast.success('Approval granted');
      else toast.info('Approval rejected');
    },
  });

  return (
    <Drawer open={!!taskId} onClose={onClose} title={task?.title || 'Task Detail'}>
      {isLoading ? (
        <div className="space-y-4 p-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 rounded skeleton" style={{ width: `${80 - i * 10}%` }} />
          ))}
        </div>
      ) : task ? (
        <div className="space-y-6">
          {/* Header: Status + Meta */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <select
                value={task.status}
                onChange={(e) => statusMutation.mutate(e.target.value)}
                className="appearance-none rounded-[var(--radius-full)] border border-[var(--border-default)] bg-[var(--surface-secondary)] px-3 py-1 pr-6 font-medium text-[var(--text-primary)] focus-ring cursor-pointer"
                style={{ fontSize: 'var(--text-caption)' }}
                disabled={statusMutation.isPending}
              >
                {allStatuses.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
                ▼
              </span>
            </div>
            <span
              className="text-[var(--text-tertiary)]"
              style={{ fontSize: 'var(--text-caption)' }}
            >
              Created {formatDateTime(task.created_at)}
            </span>
            <Badge variant={task.priority === 'urgent' ? 'error' : task.priority === 'high' ? 'warning' : 'neutral'}>
              {task.priority}
            </Badge>
            <Badge variant="neutral">{task.type}</Badge>
          </div>

          {/* Quick Action Buttons: Pause / Continue */}
          {(task.status === 'in_progress' || task.status === 'pending_user_input' || task.status === 'new' || task.status === 'approved') && (
            <div className="flex gap-2 flex-wrap">
              {task.status !== 'pending_user_input' && (
                <button
                  onClick={() => statusMutation.mutate('pending_user_input')}
                  disabled={statusMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-secondary)] px-3 py-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  <Pause size={13} /> Pause
                </button>
              )}
              {(task.status === 'pending_user_input' || task.status === 'new' || task.status === 'approved') && (
                <button
                  onClick={() => resumeMutation.mutate()}
                  disabled={resumeMutation.isPending || statusMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--interactive-primary)] px-3 py-1.5 text-[var(--text-inverse)] transition-colors hover:bg-[var(--interactive-primary-hover)] disabled:opacity-50"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  <Play size={13} /> {resumeMutation.isPending ? 'Resuming...' : 'Continue'}
                </button>
              )}
            </div>
          )}

          {/* Description */}
          {task.description && (
            <div>
              <OverlineHeading>Description</OverlineHeading>
              <p
                className="mt-2 text-[var(--text-secondary)]"
                style={{ fontSize: 'var(--text-body-small)', lineHeight: '1.6' }}
              >
                {task.description}
              </p>
            </div>
          )}

          <hr className="border-[var(--border-subtle)]" />

          {/* Contact */}
          {(task.contact_name || task.contact_phone || task.contact_email) && (
            <div>
              <OverlineHeading>Contact</OverlineHeading>
              <div className="mt-2 space-y-1">
                {task.contact_name && (
                  <p
                    className="font-medium text-[var(--text-primary)]"
                    style={{ fontSize: 'var(--text-body-small)' }}
                  >
                    {task.contact_name}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {task.contact_phone && (
                    <span
                      className="text-[var(--text-secondary)]"
                      style={{ fontSize: 'var(--text-caption)' }}
                    >
                      {task.contact_phone}
                    </span>
                  )}
                  {task.contact_email && (
                    <span
                      className="text-[var(--text-secondary)]"
                      style={{ fontSize: 'var(--text-caption)' }}
                    >
                      {task.contact_email}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Address */}
          {task.address && (
            <div>
              <OverlineHeading>Address</OverlineHeading>
              <p
                className="mt-2 text-[var(--text-secondary)]"
                style={{ fontSize: 'var(--text-body-small)' }}
              >
                {task.address}
              </p>
            </div>
          )}

          {/* Preferred Times */}
          {(task.preferred_time_1 || task.preferred_time_2) && (
            <div>
              <OverlineHeading>Preferred Times</OverlineHeading>
              <div className="mt-2 space-y-1">
                {task.preferred_time_1 && (
                  <p
                    className="text-[var(--text-secondary)]"
                    style={{ fontSize: 'var(--text-body-small)' }}
                  >
                    1. {formatDateTime(task.preferred_time_1)}
                  </p>
                )}
                {task.preferred_time_2 && (
                  <p
                    className="text-[var(--text-secondary)]"
                    style={{ fontSize: 'var(--text-body-small)' }}
                  >
                    2. {formatDateTime(task.preferred_time_2)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Constraints */}
          {task.constraints && (
            <div>
              <OverlineHeading>Constraints</OverlineHeading>
              <p
                className="mt-2 italic text-[var(--text-secondary)]"
                style={{ fontSize: 'var(--text-body-small)' }}
              >
                &ldquo;{task.constraints}&rdquo;
              </p>
            </div>
          )}

          <hr className="border-[var(--border-subtle)]" />

          {/* Linked Calls */}
          <div>
            <OverlineHeading>Linked Calls ({calls?.length ?? 0})</OverlineHeading>
            <div className="mt-2 space-y-2">
              {calls && calls.length > 0 ? (
                calls.map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3"
                  >
                    {call.direction === 'inbound' ? (
                      <PhoneIncoming size={14} className="shrink-0 text-[var(--text-secondary)]" />
                    ) : (
                      <PhoneOutgoing size={14} className="shrink-0 text-[var(--text-accent)]" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-[var(--text-primary)]"
                        style={{ fontSize: 'var(--text-caption)' }}
                      >
                        {formatDateTime(call.created_at)} · {call.direction} · {formatDuration(call.duration_seconds)}
                      </span>
                    </div>
                    <Badge variant={call.status === 'completed' ? 'success' : 'neutral'}>
                      {call.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <p
                  className="text-[var(--text-tertiary)]"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  No linked calls
                </p>
              )}
            </div>
          </div>

          {/* Approvals */}
          <div>
            <OverlineHeading>Approvals ({approvals?.length ?? 0})</OverlineHeading>
            <div className="mt-2 space-y-2">
              {approvals && approvals.length > 0 ? (
                approvals.map((approval) => (
                  <div
                    key={approval.id}
                    className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3"
                  >
                    <StatusDot
                      color={
                        approval.status === 'approved'
                          ? 'success'
                          : approval.status === 'rejected'
                          ? 'error'
                          : 'warning'
                      }
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <span
                        className="font-medium text-[var(--text-primary)]"
                        style={{ fontSize: 'var(--text-caption)' }}
                      >
                        {approval.action_type}
                      </span>
                      <span
                        className="ml-2 text-[var(--text-tertiary)]"
                        style={{ fontSize: 'var(--text-caption)' }}
                      >
                        — {titleCase(approval.status)}
                      </span>
                    </div>
                    {approval.status === 'pending' && (
                      <div className="flex gap-1.5 flex-wrap mt-1 sm:mt-0">
                        <button
                          onClick={() => approvalMutation.mutate({ id: approval.id, status: 'approved' })}
                          disabled={approvalMutation.isPending}
                          className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--interactive-primary)] px-2 py-1 text-[var(--text-inverse)] transition-colors hover:bg-[var(--interactive-primary-hover)] disabled:opacity-50"
                          style={{ fontSize: 'var(--text-caption)' }}
                        >
                          <CheckCircle size={12} /> Approve
                        </button>
                        <button
                          onClick={() => approvalMutation.mutate({ id: approval.id, status: 'rejected' })}
                          disabled={approvalMutation.isPending}
                          className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--surface-hover)] px-2 py-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-active)] disabled:opacity-50"
                          style={{ fontSize: 'var(--text-caption)' }}
                        >
                          <XCircle size={12} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p
                  className="text-[var(--text-tertiary)]"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  No approvals
                </p>
              )}
            </div>
          </div>

          {/* Activity Timeline */}
          <div>
            <OverlineHeading>Activity Timeline</OverlineHeading>
            <div className="mt-2 space-y-0">
              <div className="flex items-start gap-3 py-2">
                <StatusDot color="neutral" size="sm" />
                <div className="flex-1">
                  <span
                    className="text-[var(--text-secondary)]"
                    style={{ fontSize: 'var(--text-caption)' }}
                  >
                    Task created
                  </span>
                </div>
                <span
                  className="shrink-0 text-[var(--text-tertiary)] tabular-nums"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  {formatDateTime(task.created_at)}
                </span>
              </div>
              {task.updated_at && task.updated_at !== task.created_at && (
                <div className="flex items-start gap-3 py-2">
                  <StatusDot color="accent" size="sm" />
                  <div className="flex-1">
                    <span
                      className="text-[var(--text-secondary)]"
                      style={{ fontSize: 'var(--text-caption)' }}
                    >
                      Last updated
                    </span>
                  </div>
                  <span
                    className="shrink-0 text-[var(--text-tertiary)] tabular-nums"
                    style={{ fontSize: 'var(--text-caption)' }}
                  >
                    {formatDateTime(task.updated_at)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-center py-8 text-[var(--text-secondary)]">Task not found</p>
      )}
    </Drawer>
  );
}
