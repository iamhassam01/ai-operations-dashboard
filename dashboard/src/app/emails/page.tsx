'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { FilterPills } from '@/components/ui/FilterPills';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { OverlineHeading } from '@/components/ui/OverlineHeading';

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

export default function EmailsPage() {
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: emails, isLoading } = useQuery<Email[]>({
    queryKey: ['emails'],
    queryFn: () => fetch('/api/emails?limit=50').then((r) => r.json()),
    refetchInterval: 15000,
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
