'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  Send,
  Inbox,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ExternalLink,
  Plus,
  Bot,
  PenLine,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FilterPills } from '@/components/ui/FilterPills';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { OverlineHeading } from '@/components/ui/OverlineHeading';
import { Modal } from '@/components/ui/Modal';
import { toast } from 'sonner';

interface Email {
  id: string;
  task_id: string;
  direction: string;
  from_address: string;
  to_address: string;
  subject: string;
  body_text: string;
  body_html: string;
  status: string;
  ai_drafted: boolean;
  task_title: string;
  contact_name: string;
  created_at: string;
  updated_at: string;
}

const statusBadgeVariant: Record<string, 'success' | 'info' | 'error' | 'warning' | 'neutral' | 'accent'> = {
  draft: 'neutral',
  pending_approval: 'warning',
  sent: 'info',
  delivered: 'success',
  failed: 'error',
  received: 'accent',
};

const directionFilterOptions = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
];

const statusFilterOptions = [
  { value: 'all', label: 'Any Status' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'received', label: 'Received' },
];

function titleCase(str: string): string {
  return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── Email Compose Modal ─── */
function EmailComposeModal({
  open,
  onClose,
  tasks,
  onSend,
  onSendNow,
  isSending,
}: {
  open: boolean;
  onClose: () => void;
  tasks: { id: string; title: string }[] | undefined;
  onSend: (data: {
    task_id: string;
    to_address: string;
    subject: string;
    body_text: string;
    ai_drafted: boolean;
    status: string;
  }) => void;
  onSendNow: (data: {
    task_id: string;
    to_address: string;
    subject: string;
    body_text: string;
    ai_drafted: boolean;
  }) => void;
  isSending: boolean;
}) {
  const [taskId, setTaskId] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [mode, setMode] = useState<'manual' | 'ai'>('manual');
  const [aiGenerating, setAiGenerating] = useState(false);

  function handleAiDraft() {
    if (!taskId) {
      toast.error('Select a task first for AI to generate context');
      return;
    }
    setAiGenerating(true);
    // Simulate AI draft generation via agent hook
    fetch('/api/emails/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, to_address: toAddress }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.subject) setSubject(data.subject);
        if (data.body_text) setBodyText(data.body_text);
        if (data.to_address && !toAddress) setToAddress(data.to_address);
        setMode('ai');
        toast.success('AI draft generated');
      })
      .catch(() => {
        toast.error('Failed to generate AI draft. You can write manually.');
      })
      .finally(() => setAiGenerating(false));
  }

  function handleSubmit(action: 'draft' | 'approval' | 'send') {
    if (!toAddress || !subject) {
      toast.error('To address and subject are required');
      return;
    }
    if (action === 'send') {
      onSendNow({
        task_id: taskId || '',
        to_address: toAddress,
        subject,
        body_text: bodyText,
        ai_drafted: mode === 'ai',
      });
    } else {
      onSend({
        task_id: taskId || '',
        to_address: toAddress,
        subject,
        body_text: bodyText,
        ai_drafted: mode === 'ai',
        status: action === 'approval' ? 'pending_approval' : 'draft',
      });
    }
  }

  function resetForm() {
    setTaskId('');
    setToAddress('');
    setSubject('');
    setBodyText('');
    setMode('manual');
  }

  return (
    <Modal
      open={open}
      onClose={() => { resetForm(); onClose(); }}
      title="Compose Email"
      maxWidth="600px"
      footer={
        <div className="flex items-center gap-2 w-full">
          <p className="flex-1 text-[var(--text-tertiary)]" style={{ fontSize: '11px' }}>
            This email will be sent on your behalf by the AI assistant.
          </p>
          <Button variant="secondary" size="sm" onClick={() => handleSubmit('draft')} loading={isSending}>
            Save Draft
          </Button>
          <Button variant="primary" size="sm" icon={<Send size={13} />} onClick={() => handleSubmit('send')} loading={isSending}>
            Send
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Link to Task */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Link to Task</label>
          <select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className="w-full h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-primary)] text-[var(--text-primary)] text-sm px-3 focus:outline-none focus:border-[var(--border-focus)]"
          >
            <option value="">No task linked</option>
            {tasks?.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>

        {/* To Address */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[var(--text-secondary)]">To</label>
          <input
            type="email"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            className="w-full h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-primary)] text-[var(--text-primary)] text-sm px-3 focus:outline-none focus:border-[var(--border-focus)]"
            placeholder="recipient@example.com"
          />
        </div>

        {/* Subject */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-primary)] text-[var(--text-primary)] text-sm px-3 focus:outline-none focus:border-[var(--border-focus)]"
            placeholder="Email subject..."
          />
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--surface-secondary)] border border-[var(--border-subtle)] p-1">
          <button
            onClick={handleAiDraft}
            disabled={aiGenerating}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 transition-colors text-sm ${
              mode === 'ai'
                ? 'bg-[var(--surface-primary)] text-[var(--text-accent)] font-medium shadow-[var(--shadow-xs)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {aiGenerating ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
            AI Draft
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 transition-colors text-sm ${
              mode === 'manual'
                ? 'bg-[var(--surface-primary)] text-[var(--text-primary)] font-medium shadow-[var(--shadow-xs)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <PenLine size={13} />
            Write Manually
          </button>
        </div>

        {/* Message Body */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Message</label>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={8}
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-primary)] text-[var(--text-primary)] text-sm px-3 py-2 focus:outline-none focus:border-[var(--border-focus)] placeholder:text-[var(--text-placeholder)]"
            placeholder="Write your email message..."
          />
        </div>
      </div>
    </Modal>
  );
}

export default function EmailsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const { data: emails, isLoading } = useQuery<Email[]>({
    queryKey: ['emails'],
    queryFn: () => fetch('/api/emails?limit=50').then((r) => r.json()),
    refetchInterval: 15000,
  });

  // Fetch tasks for compose modal's task linking dropdown
  const { data: tasks } = useQuery<{ id: string; title: string }[]>({
    queryKey: ['tasks-for-compose'],
    queryFn: () => fetch('/api/tasks?limit=100').then((r) => r.json()),
    enabled: composeOpen,
  });

  // Compose email mutation (save draft)
  const composeMutation = useMutation({
    mutationFn: (data: {
      task_id: string;
      to_address: string;
      subject: string;
      body_text: string;
      ai_drafted: boolean;
      status: string;
    }) =>
      fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: 'sent',
          from_address: 'assistant',
          ...data,
        }),
      }).then((r) => {
        if (!r.ok) throw new Error('Failed to save email');
        return r.json();
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      setComposeOpen(false);
      toast.success(
        variables.status === 'pending_approval'
          ? 'Email submitted for approval'
          : 'Email saved as draft'
      );
    },
    onError: () => toast.error('Failed to save email'),
  });

  // Send email mutation (actually sends via SMTP)
  const sendMutation = useMutation({
    mutationFn: (data: {
      task_id: string;
      to_address: string;
      subject: string;
      body_text: string;
      ai_drafted: boolean;
    }) =>
      fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok && r.status !== 207) throw new Error('Failed to send email');
        return r.json();
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      setComposeOpen(false);
      if (data.warning) {
        toast.warning(data.warning);
      } else {
        toast.success('Email sent successfully');
      }
    },
    onError: () => toast.error('Failed to send email'),
  });

  const filteredEmails = emails?.filter((e) => {
    if (directionFilter !== 'all' && e.direction !== directionFilter) return false;
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.subject?.toLowerCase().includes(q) ||
        e.to_address?.toLowerCase().includes(q) ||
        e.from_address?.toLowerCase().includes(q) ||
        e.body_text?.toLowerCase().includes(q) ||
        e.task_title?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="font-bold text-[var(--text-primary)]"
            style={{ fontSize: 'var(--text-heading)' }}
          >
            Emails
          </h1>
          <p
            className="mt-0.5 text-[var(--text-secondary)]"
            style={{ fontSize: 'var(--text-body-small)' }}
          >
            Emails sent and received by the AI agent on your behalf
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={15} />}
          onClick={() => setComposeOpen(true)}
        >
          Compose
        </Button>
      </div>

      {/* Compose Modal */}
      <EmailComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        tasks={tasks}
        onSend={(data) => composeMutation.mutate(data)}
        onSendNow={(data) => sendMutation.mutate(data)}
        isSending={composeMutation.isPending || sendMutation.isPending}
      />

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-placeholder)]"
            size={16}
          />
          <input
            type="text"
            placeholder="Search emails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-primary)] text-[var(--text-primary)] py-2 pl-9 pr-8 placeholder:text-[var(--text-placeholder)] focus-ring transition-colors duration-[var(--duration-fast)]"
            style={{ fontSize: 'var(--text-body-small)' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <FilterPills
            options={directionFilterOptions}
            value={directionFilter}
            onChange={setDirectionFilter}
          />
          <FilterPills
            options={statusFilterOptions}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
      </div>

      {/* Email List */}
      <div className="space-y-2 stagger-children">
        {isLoading && <SkeletonList count={5} />}

        {!isLoading && (!filteredEmails || filteredEmails.length === 0) && (
          <EmptyState
            icon={Mail}
            title="No emails yet"
            description="Emails will appear here as the AI agent sends and receives them on your behalf."
          />
        )}

        {filteredEmails?.map((email) => (
          <div
            key={email.id}
            className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-primary)] overflow-hidden transition-all duration-[var(--duration-fast)] hover:border-[var(--border-hover)]"
          >
            {/* Collapsed Row */}
            <button
              className="flex w-full items-center gap-2 sm:gap-3 p-3 sm:p-4 text-left cursor-pointer"
              onClick={() => setExpanded(expanded === email.id ? null : email.id)}
            >
              <div
                className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${
                  email.direction === 'received'
                    ? 'bg-[var(--status-success-surface)]'
                    : 'bg-[var(--status-info-surface)]'
                }`}
              >
                {email.direction === 'received' ? (
                  <Inbox size={16} className="text-[var(--text-primary)]" />
                ) : (
                  <Send size={16} className="text-[var(--text-accent)]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="font-medium text-[var(--text-primary)] truncate"
                    style={{ fontSize: 'var(--text-body-small)' }}
                  >
                    {email.subject}
                  </span>
                  <Badge variant={statusBadgeVariant[email.status] || 'neutral'}>
                    {titleCase(email.status)}
                  </Badge>
                  {email.ai_drafted && (
                    <span className="inline-flex items-center gap-0.5 text-[var(--text-accent)]">
                      <Sparkles size={10} />
                      <span style={{ fontSize: '10px' }}>AI</span>
                    </span>
                  )}
                </div>
                <p
                  className="mt-0.5 text-[var(--text-tertiary)] truncate"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  {email.direction === 'sent' ? `To: ${email.to_address}` : `From: ${email.from_address}`}
                  {email.task_title ? ` · ${email.task_title}` : ''}
                </p>
              </div>

              <div className="text-right shrink-0 hidden sm:block">
                <p
                  className="text-[var(--text-tertiary)]"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  {new Date(email.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              <div className="shrink-0 text-[var(--text-tertiary)]">
                {expanded === email.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {/* Expanded Detail */}
            {expanded === email.id && (
              <div
                className="border-t border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4 space-y-4"
                style={{ animation: `fadeInUp var(--duration-moderate) var(--ease-default)` }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <OverlineHeading>From</OverlineHeading>
                    <p className="mt-1 text-[var(--text-primary)]" style={{ fontSize: 'var(--text-body-small)' }}>
                      {email.from_address}
                    </p>
                  </div>
                  <div>
                    <OverlineHeading>To</OverlineHeading>
                    <p className="mt-1 text-[var(--text-primary)]" style={{ fontSize: 'var(--text-body-small)' }}>
                      {email.to_address}
                    </p>
                  </div>
                </div>

                {email.task_title && (
                  <div>
                    <OverlineHeading>Linked Task</OverlineHeading>
                    <a
                      href={`/tasks?task=${email.task_id}`}
                      className="mt-1 inline-flex items-center gap-1 text-[var(--text-accent)] hover:underline"
                      style={{ fontSize: 'var(--text-body-small)' }}
                    >
                      {email.task_title} <ExternalLink size={12} />
                    </a>
                  </div>
                )}

                {email.body_text && (
                  <div>
                    <OverlineHeading>Message</OverlineHeading>
                    <pre
                      className="mt-1.5 whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-3 max-h-48 overflow-y-auto text-[var(--text-secondary)]"
                      style={{ fontSize: 'var(--text-caption)', lineHeight: '1.6' }}
                    >
                      {email.body_text}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
