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
  Search,
  Pencil,
  Plus,
  Globe,
  Star,
  MapPin,
  Bot,
} from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
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

interface Contact {
  id: string;
  name: string;
  phone_number: string;
  email: string;
  company: string;
  notes: string;
  call_status?: string;
}

const CAPTURED_INFO_FIELDS = [
  { key: 'price', label: 'Price', icon: '💰' },
  { key: 'availability', label: 'Availability', icon: '📅' },
  { key: 'scope', label: 'Scope', icon: '📋' },
  { key: 'exclusions', label: 'Exclusions', icon: '🚫' },
  { key: 'warranty', label: 'Warranty', icon: '🛡️' },
  { key: 'payment_methods', label: 'Payment Methods', icon: '💳' },
  { key: 'discount_response', label: 'Discount Response', icon: '🏷️' },
  { key: 'notes', label: 'Notes', icon: '📝' },
];

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

type TabKey = 'details' | 'research' | 'calls' | 'emails' | 'offers' | 'timeline';

const tabs: { key: TabKey; label: string; icon: typeof Info }[] = [
  { key: 'details', label: 'Details', icon: Info },
  { key: 'research', label: 'Research', icon: Search },
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

/* ─── Tab: Research ─── */
function ResearchTab({ taskId, calls }: { taskId: string; calls: Call[] | undefined }) {
  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ['task-contacts', taskId],
    queryFn: () => fetch(`/api/contacts?task_id=${taskId}`).then((r) => r.json()),
    enabled: !!taskId,
  });

  // Map calls to contacts by phone number for status display
  const callsByPhone = new Map<string, Call>();
  calls?.forEach((call) => {
    const existing = callsByPhone.get(call.phone_number);
    if (!existing || new Date(call.created_at) > new Date(existing.created_at)) {
      callsByPhone.set(call.phone_number, call);
    }
  });

  const contactCount = contacts?.length ?? 0;
  const calledCount = contacts?.filter((c) => callsByPhone.has(c.phone_number))?.length ?? 0;

  const callStatusVariant: Record<string, 'success' | 'warning' | 'neutral' | 'error'> = {
    completed: 'success',
    in_progress: 'accent' as 'success',
    pending: 'warning',
    no_answer: 'warning',
    failed: 'error',
  };

  return (
    <div className="space-y-4">
      {/* Research Status */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--status-info-surface)] p-3">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-[var(--text-accent)]" />
          <span className="font-medium text-[var(--text-primary)]" style={{ fontSize: 'var(--text-body-small)' }}>
            Research Status: {contactCount > 0 ? `${contactCount} contacts found` : 'No contacts found yet'}
          </span>
        </div>
        {contactCount > 0 && (
          <p className="mt-1 text-[var(--text-secondary)] pl-5" style={{ fontSize: 'var(--text-caption)' }}>
            {calledCount} of {contactCount} contacted
          </p>
        )}
      </div>

      {/* Contact List */}
      <div>
        <OverlineHeading>Contact List</OverlineHeading>
        <div className="mt-2 space-y-2">
          {contacts && contacts.length > 0 ? (
            contacts.map((contact) => {
              const call = callsByPhone.get(contact.phone_number);
              return (
                <div
                  key={contact.id}
                  className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--text-primary)]" style={{ fontSize: 'var(--text-body-small)' }}>
                      {contact.name || contact.company || 'Unknown'}
                    </span>
                    <Badge variant={call ? (callStatusVariant[call.status] || 'neutral') : 'neutral'}>
                      {call ? titleCase(call.status) : 'Not Called'}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)' }}>
                    {contact.phone_number && (
                      <span className="inline-flex items-center gap-1">
                        <Phone size={11} /> {contact.phone_number}
                      </span>
                    )}
                    {contact.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail size={11} /> {contact.email}
                      </span>
                    )}
                    {contact.company && (
                      <span className="inline-flex items-center gap-1">
                        <Globe size={11} /> {contact.company}
                      </span>
                    )}
                  </div>

                  {contact.notes && (
                    <p className="text-[var(--text-tertiary)]" style={{ fontSize: 'var(--text-caption)' }}>
                      {contact.notes}
                    </p>
                  )}

                  {call && call.summary && (
                    <div className="mt-1 rounded-[var(--radius-sm)] bg-[var(--surface-primary)] border border-[var(--border-subtle)] p-2">
                      <span className="text-[var(--text-tertiary)] uppercase tracking-wider" style={{ fontSize: '10px' }}>
                        Call Summary
                      </span>
                      <p className="mt-0.5 text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)', lineHeight: '1.4' }}>
                        {call.summary}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-6 text-center">
              <Search size={20} className="mx-auto mb-2 text-[var(--text-tertiary)]" />
              <p className="text-[var(--text-tertiary)]" style={{ fontSize: 'var(--text-body-small)' }}>
                No contacts found yet for this task. The agent will find contacts during research.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Modal: Edit Captured Info ─── */
function CapturedInfoEditModal({
  open,
  onClose,
  call,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  call: Call | null;
  onSave: (callId: string, capturedInfo: Record<string, string>) => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>({});

  // Reset fields when call changes
  const callId = call?.id;
  const existingInfo = call?.captured_info;
  useState(() => {
    if (existingInfo) {
      setFields({ ...existingInfo });
    } else {
      setFields({});
    }
  });

  // Sync when opening
  if (open && callId) {
    const currentKeys = Object.keys(fields).join(',');
    const infoKeys = existingInfo ? Object.keys(existingInfo).join(',') : '';
    if (currentKeys !== infoKeys && !currentKeys) {
      // Only set on first open, avoid infinite loop
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (call) {
      // Filter out empty values
      const filtered: Record<string, string> = {};
      Object.entries(fields).forEach(([k, v]) => {
        if (v.trim()) filtered[k] = v.trim();
      });
      onSave(call.id, filtered);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Captured Information" maxWidth="560px">
      <form onSubmit={handleSubmit} className="space-y-3">
        {call && (
          <div className="rounded-[var(--radius-sm)] bg-[var(--surface-secondary)] border border-[var(--border-subtle)] p-2 mb-3">
            <span className="text-[var(--text-secondary)] font-medium" style={{ fontSize: 'var(--text-caption)' }}>
              {call.caller_name || call.phone_number} — {formatDateTime(call.created_at)}
            </span>
          </div>
        )}

        {CAPTURED_INFO_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              {field.icon} {field.label}
            </label>
            {field.key === 'notes' ? (
              <textarea
                value={fields[field.key] || ''}
                onChange={(e) => setFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                rows={2}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] text-sm px-3 py-2 focus:outline-none focus:border-[var(--border-focus)] focus:shadow-[var(--shadow-focus)]"
                placeholder={`Enter ${field.label.toLowerCase()}...`}
              />
            ) : (
              <input
                type="text"
                value={fields[field.key] || ''}
                onChange={(e) => setFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] text-sm px-3 focus:outline-none focus:border-[var(--border-focus)] focus:shadow-[var(--shadow-focus)]"
                placeholder={`Enter ${field.label.toLowerCase()}...`}
              />
            )}
          </div>
        ))}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose} size="sm">
            Cancel
          </Button>
          <Button variant="primary" type="submit" size="sm">
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Modal: Transcript Viewer ─── */
function TranscriptViewModal({
  open,
  onClose,
  call,
}: {
  open: boolean;
  onClose: () => void;
  call: Call | null;
}) {
  if (!call) return null;

  return (
    <Modal open={open} onClose={onClose} title="Call Transcript" maxWidth="640px">
      <div className="space-y-4">
        {/* Call meta */}
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] bg-[var(--surface-secondary)] border border-[var(--border-subtle)] p-3">
          <span className="font-medium text-[var(--text-primary)]" style={{ fontSize: 'var(--text-body-small)' }}>
            {call.caller_name || call.phone_number}
          </span>
          <Badge variant={call.status === 'completed' ? 'success' : 'neutral'}>{call.status}</Badge>
          <span className="text-[var(--text-tertiary)]" style={{ fontSize: 'var(--text-caption)' }}>
            {formatDateTime(call.created_at)} · {formatDuration(call.duration_seconds)}
          </span>
        </div>

        {/* Audio Player */}
        {call.recording_url && (
          <div>
            <OverlineHeading>Audio Recording</OverlineHeading>
            <div className="mt-2">
              <audio controls className="w-full" preload="metadata">
                <source src={call.recording_url} />
              </audio>
            </div>
          </div>
        )}

        {/* Transcript */}
        <div>
          <OverlineHeading>Transcript</OverlineHeading>
          {call.transcript ? (
            <pre
              className="mt-2 max-h-[40vh] overflow-y-auto rounded-[var(--radius-md)] bg-[var(--surface-primary)] border border-[var(--border-subtle)] p-3 text-[var(--text-secondary)] whitespace-pre-wrap"
              style={{ fontSize: 'var(--text-caption)', lineHeight: '1.6' }}
            >
              {call.transcript}
            </pre>
          ) : (
            <p className="mt-2 text-[var(--text-tertiary)] text-center py-4" style={{ fontSize: 'var(--text-caption)' }}>
              No transcript available for this call
            </p>
          )}
        </div>

        {/* Extracted Data Summary */}
        {call.captured_info && Object.keys(call.captured_info).length > 0 && (
          <div>
            <OverlineHeading>Extracted Data</OverlineHeading>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(call.captured_info).map(([key, value]) =>
                value ? (
                  <div key={key} className="rounded-[var(--radius-sm)] bg-[var(--surface-secondary)] border border-[var(--border-subtle)] p-2">
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
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ─── Tab: Calls ─── */
function CallsTab({
  calls,
  onEditCapturedInfo,
  onViewTranscript,
}: {
  calls: Call[] | undefined;
  onEditCapturedInfo: (call: Call) => void;
  onViewTranscript: (call: Call) => void;
}) {
  const connectedCount = calls?.filter((c) => c.status === 'completed').length ?? 0;
  const noAnswerCount = calls?.filter((c) => c.status === 'no_answer').length ?? 0;
  const totalCount = calls?.length ?? 0;

  return (
    <div>
      {/* Call Summary */}
      {totalCount > 0 && (
        <div className="mb-3 rounded-[var(--radius-md)] bg-[var(--surface-secondary)] border border-[var(--border-subtle)] p-2.5">
          <span className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)' }}>
            {totalCount} call{totalCount !== 1 ? 's' : ''} made · {connectedCount} connected · {noAnswerCount} no answer
          </span>
        </div>
      )}

      <OverlineHeading>Linked Calls ({totalCount})</OverlineHeading>
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

              {/* Action buttons */}
              <div className="flex items-center gap-2 pl-7 mt-2">
                {(call.transcript || call.recording_url) && (
                  <button
                    onClick={() => onViewTranscript(call)}
                    className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-primary)] px-2 py-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                    style={{ fontSize: '11px' }}
                  >
                    <FileText size={11} /> View Transcript
                  </button>
                )}
                <button
                  onClick={() => onEditCapturedInfo(call)}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-primary)] px-2 py-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  style={{ fontSize: '11px' }}
                >
                  <Pencil size={11} /> Edit Info
                </button>
              </div>
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
  // Fetch contacts for this task to show in call approval previews
  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ['contacts-for-approval', task.id],
    queryFn: () => fetch(`/api/contacts?task_id=${task.id}`).then((r) => r.json()),
    enabled: !!approvals?.some((a) => a.action_type === 'make_call' && a.status === 'pending'),
  });

  return (
    <div className="space-y-5">
      {/* Approvals */}
      <div>
        <OverlineHeading>Approvals ({approvals?.length ?? 0})</OverlineHeading>
        <div className="mt-2 space-y-3">
          {approvals && approvals.length > 0 ? (
            approvals.map((approval) => {
              const isCallApproval = approval.action_type === 'make_call';
              const isPending = approval.status === 'pending';

              // For call approvals, show enhanced detail card
              if (isCallApproval && isPending) {
                return (
                  <div
                    key={approval.id}
                    className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-secondary)] overflow-hidden"
                  >
                    {/* Header */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--status-warning-surface)]">
                      <StatusDot color="warning" size="sm" />
                      <span className="font-medium text-[var(--text-primary)]" style={{ fontSize: 'var(--text-body-small)' }}>
                        Call Approval Required
                      </span>
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Task & Action Info */}
                      <div>
                        <p className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)' }}>
                          <span className="font-medium text-[var(--text-primary)]">Action:</span> Place outbound call{contacts && contacts.length > 1 ? 's' : ''} to {contacts?.length || 1} contact{contacts && contacts.length !== 1 ? 's' : ''}
                        </p>
                        {approval.notes && (
                          <p className="mt-1 text-[var(--text-tertiary)]" style={{ fontSize: 'var(--text-caption)' }}>
                            {approval.notes}
                          </p>
                        )}
                      </div>

                      {/* Contacts to Call */}
                      {contacts && contacts.length > 0 && (
                        <div>
                          <p className="font-medium text-[var(--text-secondary)] mb-2" style={{ fontSize: 'var(--text-caption)' }}>Contacts to call:</p>
                          <div className="space-y-1.5">
                            {contacts.map((c, i) => (
                              <div key={c.id} className="flex items-center gap-2 text-[var(--text-primary)]" style={{ fontSize: 'var(--text-caption)' }}>
                                <span className="text-[var(--text-tertiary)]">{i + 1}.</span>
                                <span className="font-medium">{c.name}</span>
                                <span className="text-[var(--text-tertiary)]">({c.phone_number})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Call Script Preview */}
                      <div>
                        <p className="font-medium text-[var(--text-secondary)] mb-1.5" style={{ fontSize: 'var(--text-caption)' }}>Call Script Preview:</p>
                        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-primary)] px-3 py-2">
                          <p className="text-[var(--text-secondary)] italic" style={{ fontSize: 'var(--text-caption)', lineHeight: '1.6' }}>
                            &ldquo;Hello, I&apos;m calling on behalf of Ivan Korn regarding {task.title.toLowerCase()}. I&apos;d like to inquire about availability, pricing, and services...&rdquo;
                          </p>
                        </div>
                      </div>

                      {/* What AI Will Collect */}
                      <div>
                        <p className="font-medium text-[var(--text-secondary)] mb-1.5" style={{ fontSize: 'var(--text-caption)' }}>The AI will collect:</p>
                        <div className="flex flex-wrap gap-2">
                          {['Price', 'Availability', 'Scope', 'Warranty', 'Payment Methods'].map((item) => (
                            <span
                              key={item}
                              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-primary)] border border-[var(--border-subtle)] px-2 py-0.5 text-[var(--text-secondary)]"
                              style={{ fontSize: '10px' }}
                            >
                              <CheckCircle size={10} className="text-success" />
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--border-subtle)]">
                      <button
                        onClick={() => approvalMutation.mutate({ id: approval.id, status: 'rejected' })}
                        disabled={approvalMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--surface-hover)] px-3 py-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-active)] disabled:opacity-50"
                        style={{ fontSize: 'var(--text-caption)' }}
                      >
                        <XCircle size={12} /> Reject
                      </button>
                      <button
                        onClick={() => approvalMutation.mutate({ id: approval.id, status: 'approved' })}
                        disabled={approvalMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--interactive-primary)] px-3 py-1.5 text-[var(--text-inverse)] transition-colors hover:bg-[var(--interactive-primary-hover)] disabled:opacity-50"
                        style={{ fontSize: 'var(--text-caption)' }}
                      >
                        <CheckCircle size={12} /> Approve Calls
                      </button>
                    </div>
                  </div>
                );
              }

              // Default card for non-call approvals or resolved ones
              return (
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
                      {titleCase(approval.action_type)}
                    </span>
                    <span className="ml-2 text-[var(--text-tertiary)]" style={{ fontSize: 'var(--text-caption)' }}>
                      — {titleCase(approval.status)}
                    </span>
                    {approval.notes && (
                      <p className="mt-0.5 text-[var(--text-tertiary)] truncate" style={{ fontSize: '10px' }}>
                        {approval.notes}
                      </p>
                    )}
                  </div>
                  {isPending && (
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
              );
            })
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
  const [editingCall, setEditingCall] = useState<Call | null>(null);
  const [viewingTranscript, setViewingTranscript] = useState<Call | null>(null);

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

  const capturedInfoMutation = useMutation({
    mutationFn: (data: { callId: string; captured_info: Record<string, string> }) =>
      fetch(`/api/calls/${data.callId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captured_info: data.captured_info }),
      }).then((r) => {
        if (!r.ok) throw new Error('Failed to update');
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-calls', taskId] });
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      setEditingCall(null);
      toast.success('Captured information updated');
    },
    onError: () => toast.error('Failed to update captured information'),
  });

  return (
    <>
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
              {activeTab === 'research' && <ResearchTab taskId={taskId} calls={calls} />}
              {activeTab === 'calls' && (
                <CallsTab
                  calls={calls}
                  onEditCapturedInfo={(call) => setEditingCall(call)}
                  onViewTranscript={(call) => setViewingTranscript(call)}
                />
              )}
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

      {/* Modals */}
      <CapturedInfoEditModal
        open={!!editingCall}
        onClose={() => setEditingCall(null)}
        call={editingCall}
        onSave={(callId, capturedInfo) => capturedInfoMutation.mutate({ callId, captured_info: capturedInfo })}
      />
      <TranscriptViewModal
        open={!!viewingTranscript}
        onClose={() => setViewingTranscript(null)}
        call={viewingTranscript}
      />
    </>
  );
}
