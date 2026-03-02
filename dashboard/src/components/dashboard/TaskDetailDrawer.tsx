'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PhoneIncoming,
  PhoneOutgoing,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  Mail,
  Send,
  FileText,
  Clock,
  BarChart3,
  Info,
  Phone,
  Layers,
} from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { OverlineHeading } from '@/components/ui/OverlineHeading';
import { renderMarkdown } from '@/lib/markdown';
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
  summary: string;
  captured_info: Record<string, string> | null;
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

interface Email {
  id: string;
  direction: string;
  from_address: string;
  to_address: string;
  subject: string;
  body_text: string;
  status: string;
  ai_drafted: boolean;
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
  'new', 'pending_approval', 'approved', 'in_progress',
  'pending_user_input', 'scheduled', 'completed', 'cancelled', 'escalated', 'closed',
];

type TabKey = 'details' | 'calls' | 'emails' | 'offers' | 'timeline';

const tabs: { key: TabKey; label: string; icon: typeof Info }[] = [
  { key: 'details', label: 'Details', icon: Info },
  { key: 'calls', label: 'Calls', icon: Phone },
  { key: 'emails', label: 'Emails', icon: Mail },
  { key: 'offers', label: 'Offers', icon: BarChart3 },
  { key: 'timeline', label: 'Timeline', icon: Clock },
];

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function titleCase(str: string): string {
  return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ─── Tab: Details ─── */
function DetailsTab({
  task,
  statusMutation,
  resumeMutation,
}: {
  task: TaskDetail;
  statusMutation: { mutate: (status: string) => void; isPending: boolean };
  resumeMutation: { mutate: (v?: undefined) => void; isPending: boolean };
}) {
  return (
    <div className="space-y-5">
      {/* Status + Meta */}
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
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">▼</span>
        </div>
        <span className="text-[var(--text-tertiary)]" style={{ fontSize: 'var(--text-caption)' }}>
          Created {formatDateTime(task.created_at)}
        </span>
        <Badge variant={task.priority === 'urgent' ? 'error' : task.priority === 'high' ? 'warning' : 'neutral'}>
          {task.priority}
        </Badge>
        <Badge variant="neutral">{task.type}</Badge>
      </div>

      {/* Quick Actions */}
      {(['in_progress', 'pending_user_input', 'new', 'approved'] as string[]).includes(task.status) && (
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
          {(['pending_user_input', 'new', 'approved'] as string[]).includes(task.status) && (
            <button
              onClick={() => resumeMutation.mutate(undefined)}
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
          <div
            className="chat-content mt-2 text-[var(--text-secondary)]"
            style={{ fontSize: 'var(--text-body-small)', lineHeight: '1.6' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(task.description) }}
          />
        </div>
      )}

      <hr className="border-[var(--border-subtle)]" />

      {/* Contact */}
      {(task.contact_name || task.contact_phone || task.contact_email) && (
        <div>
          <OverlineHeading>Contact</OverlineHeading>
          <div className="mt-2 space-y-1">
            {task.contact_name && (
              <p className="font-medium text-[var(--text-primary)]" style={{ fontSize: 'var(--text-body-small)' }}>
                {task.contact_name}
              </p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {task.contact_phone && (
                <span className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)' }}>
                  {task.contact_phone}
                </span>
              )}
              {task.contact_email && (
                <span className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)' }}>
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
          <p className="mt-2 text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-body-small)' }}>
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
              <p className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-body-small)' }}>
                1. {formatDateTime(task.preferred_time_1)}
              </p>
            )}
            {task.preferred_time_2 && (
              <p className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-body-small)' }}>
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
          <p className="mt-2 italic text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-body-small)' }}>
            &ldquo;{task.constraints}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Calls ─── */
function CallsTab({ calls }: { calls: Call[] | undefined }) {
  return (
    <div>
      <OverlineHeading>Linked Calls ({calls?.length ?? 0})</OverlineHeading>
      <div className="mt-2 space-y-3">
        {calls && calls.length > 0 ? (
          calls.map((call) => (
            <div
              key={call.id}
              className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 space-y-2"
            >
              <div className="flex items-center gap-3">
                {call.direction === 'inbound' ? (
                  <PhoneIncoming size={14} className="shrink-0 text-[var(--text-secondary)]" />
                ) : (
                  <PhoneOutgoing size={14} className="shrink-0 text-[var(--text-accent)]" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-[var(--text-primary)] font-medium" style={{ fontSize: 'var(--text-caption)' }}>
                    {call.caller_name || call.phone_number}
                  </span>
                  <span className="ml-2 text-[var(--text-tertiary)]" style={{ fontSize: 'var(--text-caption)' }}>
                    {formatDateTime(call.created_at)} · {call.direction} · {formatDuration(call.duration_seconds)}
                  </span>
                </div>
                <Badge variant={call.status === 'completed' ? 'success' : call.status === 'no_answer' ? 'warning' : 'neutral'}>
                  {call.status}
                </Badge>
              </div>

              {call.summary && (
                <p className="text-[var(--text-secondary)] pl-7" style={{ fontSize: 'var(--text-caption)', lineHeight: '1.5' }}>
                  {call.summary}
                </p>
              )}

              {call.captured_info && Object.keys(call.captured_info).length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7 mt-1">
                  {Object.entries(call.captured_info).map(([key, value]) =>
                    value ? (
                      <div key={key} className="rounded-[var(--radius-sm)] bg-[var(--surface-primary)] border border-[var(--border-subtle)] p-2">
                        <span className="text-[var(--text-tertiary)] uppercase tracking-wider" style={{ fontSize: '10px' }}>
                          {key.replace(/_/g, ' ')}
                        </span>
                        <p className="mt-0.5 text-[var(--text-primary)] font-medium" style={{ fontSize: 'var(--text-caption)' }}>
                          {value}
                        </p>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="text-[var(--text-tertiary)] py-4 text-center" style={{ fontSize: 'var(--text-caption)' }}>
            No linked calls yet
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Emails ─── */
function EmailsTab({ taskId }: { taskId: string }) {
  const { data: emails } = useQuery<Email[]>({
    queryKey: ['task-emails', taskId],
    queryFn: () => fetch(`/api/emails?task_id=${taskId}`).then((r) => r.json()),
    enabled: !!taskId,
  });

  const emailStatusVariant: Record<string, 'success' | 'warning' | 'neutral' | 'error' | 'info'> = {
    sent: 'success',
    delivered: 'success',
    draft: 'warning',
    failed: 'error',
    received: 'info',
  };

  return (
    <div>
      <OverlineHeading>Task Emails ({emails?.length ?? 0})</OverlineHeading>
      <div className="mt-2 space-y-2">
        {emails && emails.length > 0 ? (
          emails.map((email) => (
            <div
              key={email.id}
              className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 space-y-1.5"
            >
              <div className="flex items-center gap-2">
                {email.direction === 'sent' ? (
                  <Send size={12} className="shrink-0 text-[var(--text-accent)]" />
                ) : (
                  <Mail size={12} className="shrink-0 text-[var(--text-secondary)]" />
                )}
                <span className="font-medium text-[var(--text-primary)] truncate flex-1" style={{ fontSize: 'var(--text-caption)' }}>
                  {email.subject || '(No subject)'}
                </span>
                <Badge variant={emailStatusVariant[email.status] || 'neutral'}>
                  {email.status}
                </Badge>
                {email.ai_drafted && (
                  <Badge variant="accent">AI</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-[var(--text-tertiary)]" style={{ fontSize: '11px' }}>
                <span>{email.direction === 'sent' ? `To: ${email.to_address}` : `From: ${email.from_address}`}</span>
                <span>{formatDateTime(email.created_at)}</span>
              </div>
              {email.body_text && (
                <p className="text-[var(--text-secondary)] line-clamp-2" style={{ fontSize: 'var(--text-caption)', lineHeight: '1.4' }}>
                  {email.body_text}
                </p>
              )}
            </div>
          ))
        ) : (
          <p className="text-[var(--text-tertiary)] py-4 text-center" style={{ fontSize: 'var(--text-caption)' }}>
            No emails linked to this task yet
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Offers ─── */
function OffersTab({ calls }: { calls: Call[] | undefined }) {
  const offersFromCalls = calls?.filter((c) => c.captured_info && Object.keys(c.captured_info).length > 0) || [];

  if (offersFromCalls.length === 0) {
    return (
      <div className="py-8 text-center">
        <Layers size={20} className="mx-auto mb-2 text-[var(--text-tertiary)]" />
        <p className="text-[var(--text-tertiary)]" style={{ fontSize: 'var(--text-body-small)' }}>
          No offers captured yet. Offers are extracted from call results with captured information.
        </p>
      </div>
    );
  }

  // Collect all unique keys across all offers
  const allKeys = Array.from(
    new Set(offersFromCalls.flatMap((c) => Object.keys(c.captured_info || {})))
  );

  return (
    <div>
      <OverlineHeading>Offer Comparison ({offersFromCalls.length} suppliers)</OverlineHeading>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: 'var(--text-caption)' }}>
          <thead>
            <tr>
              <th className="sticky left-0 bg-[var(--surface-primary)] text-left p-2 border-b border-[var(--border-subtle)] text-[var(--text-tertiary)] uppercase tracking-wider" style={{ fontSize: '10px' }}>
                Field
              </th>
              {offersFromCalls.map((call) => (
                <th key={call.id} className="text-left p-2 border-b border-[var(--border-subtle)] text-[var(--text-primary)] font-medium min-w-[140px]">
                  {call.caller_name || call.phone_number}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allKeys.map((key) => (
              <tr key={key}>
                <td className="sticky left-0 bg-[var(--surface-primary)] p-2 border-b border-[var(--border-subtle)] text-[var(--text-tertiary)] font-medium">
                  {titleCase(key)}
                </td>
                {offersFromCalls.map((call) => (
                  <td key={call.id} className="p-2 border-b border-[var(--border-subtle)] text-[var(--text-primary)]">
                    {call.captured_info?.[key] || '—'}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 bg-[var(--surface-primary)] p-2 text-[var(--text-tertiary)] font-medium">
                Call Status
              </td>
              {offersFromCalls.map((call) => (
                <td key={call.id} className="p-2">
                  <Badge variant={call.status === 'completed' ? 'success' : 'neutral'}>{call.status}</Badge>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Tab: Timeline ─── */
function TimelineTab({
  task,
  approvals,
  approvalMutation,
}: {
  task: TaskDetail;
  approvals: Approval[] | undefined;
  approvalMutation: { mutate: (data: { id: string; status: string }) => void; isPending: boolean };
}) {
  return (
    <div className="space-y-5">
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
                  color={approval.status === 'approved' ? 'success' : approval.status === 'rejected' ? 'error' : 'warning'}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-[var(--text-primary)]" style={{ fontSize: 'var(--text-caption)' }}>
                    {approval.action_type}
                  </span>
                  <span className="ml-2 text-[var(--text-tertiary)]" style={{ fontSize: 'var(--text-caption)' }}>
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
            <p className="text-[var(--text-tertiary)]" style={{ fontSize: 'var(--text-caption)' }}>No approvals</p>
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
              <span className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)' }}>Task created</span>
            </div>
            <span className="shrink-0 text-[var(--text-tertiary)] tabular-nums" style={{ fontSize: 'var(--text-caption)' }}>
              {formatDateTime(task.created_at)}
            </span>
          </div>
          {task.updated_at && task.updated_at !== task.created_at && (
            <div className="flex items-start gap-3 py-2">
              <StatusDot color="accent" size="sm" />
              <div className="flex-1">
                <span className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)' }}>Last updated</span>
              </div>
              <span className="shrink-0 text-[var(--text-tertiary)] tabular-nums" style={{ fontSize: 'var(--text-caption)' }}>
                {formatDateTime(task.updated_at)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Drawer ─── */
export function TaskDetailDrawer({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('details');

  const { data: task, isLoading } = useQuery<TaskDetail>({
    queryKey: ['task-detail', taskId],
    queryFn: () => fetch(`/api/tasks/${taskId}`).then((r) => r.json()),
    enabled: !!taskId,
    refetchInterval: 5000,
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

  const resumeMutation = useMutation<{ message?: string }, Error, void>({
    mutationFn: () =>
      fetch(`/api/tasks/${taskId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => {
        if (!r.ok) throw new Error('Failed to resume task');
        return r.json();
      }),
    onSuccess: (data: { message?: string }) => {
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
    onSuccess: (_data: unknown, variables: { id: string; status: string }) => {
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
        <div className="space-y-4">
          {/* Tab Navigation */}
          <div className="flex gap-1 border-b border-[var(--border-subtle)] overflow-x-auto pb-px -mx-1 px-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 border-b-2 transition-colors duration-[var(--duration-fast)] cursor-pointer ${
                    isActive
                      ? 'border-[var(--interactive-primary)] text-[var(--text-accent)] font-medium'
                      : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]'
                  }`}
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  <Icon size={13} />
                  {tab.label}
                  {tab.key === 'calls' && calls && calls.length > 0 && (
                    <span className="ml-0.5 rounded-full bg-[var(--surface-hover)] px-1.5 py-0.5 text-[var(--text-tertiary)]" style={{ fontSize: '10px' }}>
                      {calls.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div style={{ animation: `fadeInUp var(--duration-fast) var(--ease-default)` }}>
            {activeTab === 'details' && (
              <DetailsTab task={task} statusMutation={statusMutation} resumeMutation={resumeMutation} />
            )}
            {activeTab === 'calls' && <CallsTab calls={calls} />}
            {activeTab === 'emails' && <EmailsTab taskId={taskId} />}
            {activeTab === 'offers' && <OffersTab calls={calls} />}
            {activeTab === 'timeline' && (
              <TimelineTab task={task} approvals={approvals} approvalMutation={approvalMutation} />
            )}
          </div>
        </div>
      ) : (
        <p className="text-center py-8 text-[var(--text-secondary)]">Task not found</p>
      )}
    </Drawer>
  );
}
