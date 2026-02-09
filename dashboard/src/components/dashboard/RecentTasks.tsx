'use client';

import { useQuery } from '@tanstack/react-query';
import { ListTodo, ArrowRight, AlertTriangle } from 'lucide-react';
import { StatusDot } from '@/components/ui/Badge';
import { Badge } from '@/components/ui/Badge';
import { OverlineHeading } from '@/components/ui/OverlineHeading';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';

interface Task {
  id: string;
  type: string;
  priority: string;
  title: string;
  status: string;
  created_at: string;
}

const priorityDotColor: Record<string, 'error' | 'warning' | 'accent' | 'neutral'> = {
  urgent: 'error',
  high: 'warning',
  medium: 'accent',
  low: 'neutral',
};

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

function titleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

export function RecentTasks() {
  const { data: tasks, isLoading, isError } = useQuery<Task[]>({
    queryKey: ['recent-tasks'],
    queryFn: () => fetch('/api/tasks?limit=5').then((r) => r.json()),
    refetchInterval: 10000,
  });

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-primary)] p-5">
      <OverlineHeading
        action={
          <a
            href="/tasks"
            className="inline-flex items-center gap-1 text-[var(--text-accent)] transition-colors duration-[var(--duration-fast)] hover:underline"
            style={{ fontSize: 'var(--text-caption)' }}
          >
            View All Tasks
            <ArrowRight size={12} />
          </a>
        }
      >
        Recent Tasks
      </OverlineHeading>

      <div className="mt-3 space-y-2 stagger-children">
        {isLoading && <SkeletonList count={3} />}

        {isError && (
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--status-error-surface)] p-3">
            <AlertTriangle size={14} className="shrink-0 text-[var(--interactive-destructive)]" />
            <p className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)' }}>Unable to load tasks</p>
          </div>
        )}

        {tasks?.map((task) => (
          <a
            key={task.id}
            href={`/tasks?task=${task.id}`}
            className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 transition-all duration-[var(--duration-fast)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)] cursor-pointer"
          >
            <StatusDot
              color={priorityDotColor[task.priority] || 'neutral'}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <p
                className="font-medium text-[var(--text-primary)] line-clamp-2"
                style={{ fontSize: 'var(--text-body-small)' }}
              >
                {task.title}
              </p>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <Badge variant={statusBadgeVariant[task.status] || 'neutral'}>
                  {titleCase(task.status)}
                </Badge>
                <span
                  className="text-[var(--text-tertiary)]"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  {timeAgo(task.created_at)}
                </span>
              </div>
            </div>
          </a>
        ))}

        {!isLoading && (!tasks || tasks.length === 0) && (
          <EmptyState
            icon={ListTodo}
            title="No tasks yet"
            description="Create your first task to get started"
            action={
              <a
                href="/tasks"
                className="inline-flex items-center gap-1 text-[var(--text-accent)] font-medium transition-colors hover:underline"
                style={{ fontSize: 'var(--text-body-small)' }}
              >
                Go to Tasks
                <ArrowRight size={14} />
              </a>
            }
          />
        )}
      </div>
    </div>
  );
}
