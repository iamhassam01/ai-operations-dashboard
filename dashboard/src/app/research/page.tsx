'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Users,
  Phone,
  MapPin,
  Star,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  X,
  Globe,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { FilterPills } from '@/components/ui/FilterPills';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { OverlineHeading } from '@/components/ui/OverlineHeading';

interface Task {
  id: string;
  title: string;
  type: string;
  status: string;
  description: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  created_at: string;
}

interface Contact {
  id: string;
  phone_number: string;
  name: string;
  email: string;
  company: string;
  notes: string;
  created_at: string;
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

const statusBadgeVariant: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info'> = {
  new: 'info',
  pending_approval: 'warning',
  approved: 'success',
  in_progress: 'accent',
  completed: 'success',
  cancelled: 'error',
  escalated: 'error',
  pending_user_input: 'warning',
  scheduled: 'info',
  closed: 'neutral',
};

const filterOptions = [
  { value: 'all', label: 'All Tasks' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'new', label: 'New' },
  { value: 'completed', label: 'Completed' },
];

function titleCase(str: string): string {
  return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ResearchTaskCard({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false);

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ['task-contacts', task.id],
    queryFn: async () => {
      // Look up contacts linked to this task via calls or task contact info
      const res = await fetch(`/api/contacts?search=${encodeURIComponent(task.contact_phone || task.contact_name || '')}`);
      return res.json();
    },
    enabled: expanded && !!(task.contact_phone || task.contact_name),
  });

  const { data: calls } = useQuery<Call[]>({
    queryKey: ['task-research-calls', task.id],
    queryFn: () => fetch(`/api/calls?task_id=${task.id}`).then((r) => r.json()),
    enabled: expanded,
  });

  const callCount = calls?.length ?? 0;
  const completedCalls = calls?.filter((c) => c.status === 'completed').length ?? 0;
  const hasResearch = callCount > 0 || (contacts && contacts.length > 0);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-primary)] overflow-hidden transition-all duration-[var(--duration-fast)] hover:border-[var(--border-hover)]">
      <button
        className="flex w-full items-center gap-3 p-3 sm:p-4 text-left cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--status-info-surface)]">
          <Search size={16} className="text-[var(--text-accent)]" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="font-medium text-[var(--text-primary)] truncate"
              style={{ fontSize: 'var(--text-body-small)' }}
            >
              {task.title}
            </span>
            <Badge variant={statusBadgeVariant[task.status] || 'neutral'}>
              {titleCase(task.status)}
            </Badge>
          </div>
          <p
            className="mt-0.5 text-[var(--text-tertiary)] truncate"
            style={{ fontSize: 'var(--text-caption)' }}
          >
            {task.contact_name && `Contact: ${task.contact_name}`}
            {task.contact_phone && ` · ${task.contact_phone}`}
            {callCount > 0 && ` · ${completedCalls}/${callCount} calls completed`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasResearch ? (
            <Badge variant="success">Researched</Badge>
          ) : (
            <Badge variant="neutral">No Research</Badge>
          )}
          {expanded ? <ChevronUp size={16} className="text-[var(--text-tertiary)]" /> : <ChevronDown size={16} className="text-[var(--text-tertiary)]" />}
        </div>
      </button>

      {expanded && (
        <div
          className="border-t border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 sm:p-4 space-y-4"
          style={{ animation: `fadeInUp var(--duration-moderate) var(--ease-default)` }}
        >
          {/* Task Description */}
          {task.description && (
            <div>
              <OverlineHeading>Task Description</OverlineHeading>
              <p
                className="mt-1.5 text-[var(--text-secondary)]"
                style={{ fontSize: 'var(--text-body-small)', lineHeight: '1.6' }}
              >
                {task.description.length > 300 ? task.description.slice(0, 300) + '...' : task.description}
              </p>
            </div>
          )}

          {/* Contacts Found */}
          {contacts && contacts.length > 0 && (
            <div>
              <OverlineHeading>Contacts Found ({contacts.length})</OverlineHeading>
              <div className="mt-2 space-y-2">
                {contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-hover)]">
                      <Users size={14} className="text-[var(--text-secondary)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--text-primary)]" style={{ fontSize: 'var(--text-body-small)' }}>
                        {contact.name || 'Unknown'}
                        {contact.company && <span className="text-[var(--text-tertiary)]"> · {contact.company}</span>}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {contact.phone_number && (
                          <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)' }}>
                            <Phone size={10} /> {contact.phone_number}
                          </span>
                        )}
                        {contact.email && (
                          <span className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)' }}>
                            {contact.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Call Results */}
          {calls && calls.length > 0 && (
            <div>
              <OverlineHeading>Call Results ({calls.length})</OverlineHeading>
              <div className="mt-2 space-y-2">
                {calls.map((call) => (
                  <div
                    key={call.id}
                    className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--text-primary)]" style={{ fontSize: 'var(--text-body-small)' }}>
                        {call.caller_name || call.phone_number}
                      </span>
                      <Badge variant={call.status === 'completed' ? 'success' : call.status === 'no_answer' ? 'warning' : 'neutral'}>
                        {call.status}
                      </Badge>
                    </div>
                    {call.summary && (
                      <p className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)', lineHeight: '1.5' }}>
                        {call.summary}
                      </p>
                    )}
                    {call.captured_info && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        {Object.entries(call.captured_info).map(([key, val]) => (
                          val && (
                            <div key={key}>
                              <span className="text-[var(--text-tertiary)]" style={{ fontSize: '10px' }}>{titleCase(key)}</span>
                              <p className="text-[var(--text-primary)]" style={{ fontSize: 'var(--text-caption)' }}>{val}</p>
                            </div>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasResearch && (
            <div className="text-center py-4">
              <Globe size={20} className="mx-auto mb-2 text-[var(--text-tertiary)]" />
              <p className="text-[var(--text-tertiary)]" style={{ fontSize: 'var(--text-body-small)' }}>
                No research data yet. Use the Agent chat to research contacts for this task.
              </p>
            </div>
          )}

          {/* Link to task */}
          <div className="pt-2 border-t border-[var(--border-subtle)]">
            <a
              href={`/tasks?task=${task.id}`}
              className="inline-flex items-center gap-1 text-[var(--text-accent)] hover:underline"
              style={{ fontSize: 'var(--text-body-small)' }}
            >
              View full task detail <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResearchPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ['research-tasks'],
    queryFn: () => fetch('/api/tasks?limit=50').then((r) => r.json()),
    refetchInterval: 15000,
  });

  const filteredTasks = tasks?.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.title?.toLowerCase().includes(q) ||
        t.contact_name?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
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
          Research
        </h1>
        <p
          className="mt-0.5 text-[var(--text-secondary)]"
          style={{ fontSize: 'var(--text-body-small)' }}
        >
          View research results, contacts found, and call outcomes per task
        </p>
      </div>

      {/* Search + Filter */}
      <div className="space-y-3">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-placeholder)]"
            size={16}
          />
          <input
            type="text"
            placeholder="Search tasks..."
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

        <FilterPills options={filterOptions} value={statusFilter} onChange={setStatusFilter} />
      </div>

      {/* Task Research Cards */}
      <div className="space-y-2 stagger-children">
        {isLoading && <SkeletonList count={4} />}

        {!isLoading && (!filteredTasks || filteredTasks.length === 0) && (
          <EmptyState
            icon={Search}
            title="No tasks to research"
            description="Create a task and use the Agent chat to research contacts."
          />
        )}

        {filteredTasks?.map((task) => (
          <ResearchTaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
