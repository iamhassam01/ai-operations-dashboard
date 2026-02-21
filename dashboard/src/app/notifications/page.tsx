'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { FilterPills } from '@/components/ui/FilterPills';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { OverlineHeading } from '@/components/ui/OverlineHeading';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  related_task_id: string | null;
  related_call_id: string | null;
}

const typeBadgeVariant: Record<string, 'info' | 'error' | 'warning' | 'success' | 'accent'> = {
  system: 'info',
  error: 'error',
  approval_required: 'warning',
  call_completed: 'success',
  task_update: 'accent',
};

const typeLabel: Record<string, string> = {
  system: 'System',
  error: 'Error',
  approval_required: 'Approval',
  call_completed: 'Call',
  task_update: 'Task',
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  if (date >= weekAgo) return 'This Week';
  return 'Older';
}

function groupByDate(notifications: Notification[]): Record<string, Notification[]> {
  const groups: Record<string, Notification[]> = {};
  const order = ['Today', 'Yesterday', 'This Week', 'Older'];

  for (const notif of notifications) {
    const group = getDateGroup(notif.created_at);
    if (!groups[group]) groups[group] = [];
    groups[group].push(notif);
  }

  // Return in chronological order
  const ordered: Record<string, Notification[]> = {};
  for (const key of order) {
    if (groups[key]) ordered[key] = groups[key];
  }
  return ordered;
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications-page', filter],
    queryFn: () => {
      let url = '/api/notifications?limit=50';
      if (filter === 'unread') url += '&unread=true';
      // Type filters
      if (['approval_required', 'system', 'task_update', 'call_completed', 'error'].includes(filter)) {
        url = `/api/notifications?limit=50&type=${filter}`;
      }
      return fetch(url).then((r) => r.json());
    },
    refetchInterval: 15000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_read: true }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-page'] });
      queryClient.invalidateQueries({ queryKey: ['notification-count'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-page'] });
      queryClient.invalidateQueries({ queryKey: ['notification-count'] });
      toast.success('All notifications marked as read');
    },
  });

  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0;
  const grouped = notifications ? groupByDate(notifications) : {};

  const filterOptions = [
    { value: 'all', label: 'All', count: notifications?.length },
    { value: 'unread', label: 'Unread', count: unreadCount },
    { value: 'approval_required', label: 'Approvals' },
    { value: 'system', label: 'System' },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="font-bold text-[var(--text-primary)]"
            style={{ fontSize: 'var(--text-heading)' }}
          >
            Notifications
          </h1>
          <p
            className="mt-0.5 text-[var(--text-secondary)]"
            style={{ fontSize: 'var(--text-body-small)' }}
          >
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => markAllReadMutation.mutate()}
            loading={markAllReadMutation.isPending}
          >
            <CheckCheck size={14} />
            Mark all read
          </Button>
        )}
      </div>

      {/* Filter Pills */}
      <FilterPills options={filterOptions} value={filter} onChange={setFilter} />

      {/* Notification List — Grouped by Date */}
      <div className="space-y-6">
        {isLoading && <SkeletonList count={5} />}

        {Object.entries(grouped).map(([dateGroup, items]) => (
          <div key={dateGroup}>
            <OverlineHeading>{dateGroup}</OverlineHeading>

            <div className="mt-2 space-y-2">
              {items.map((notif) => (
                <div
                  key={notif.id}
                  className={`rounded-[var(--radius-lg)] border bg-[var(--surface-primary)] p-4 transition-all duration-[var(--duration-fast)] hover:border-[var(--border-hover)] ${
                    !notif.is_read
                      ? 'border-l-[3px] border-l-[var(--interactive-primary)] border-[var(--border-default)]'
                      : 'border-[var(--border-default)]'
                  }`}
                >
                  <div className="flex gap-3">
                    {/* Unread indicator */}
                    <div className="mt-1.5 shrink-0">
                      {!notif.is_read ? (
                        <div className="h-2.5 w-2.5 rounded-full bg-[var(--interactive-primary)]" />
                      ) : (
                        <div className="h-2.5 w-2.5 rounded-full border border-[var(--border-default)]" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`${!notif.is_read ? 'font-semibold' : 'font-medium'} text-[var(--text-primary)]`}
                          style={{ fontSize: 'var(--text-body-small)' }}
                        >
                          {notif.title}
                        </p>
                        <span
                          className="shrink-0 text-[var(--text-tertiary)] tabular-nums"
                          style={{ fontSize: 'var(--text-caption)' }}
                        >
                          {formatTime(notif.created_at)}
                        </span>
                      </div>

                      <p
                        className="mt-0.5 text-[var(--text-secondary)]"
                        style={{ fontSize: 'var(--text-body-small)' }}
                      >
                        {notif.message}
                      </p>

                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <Badge variant={typeBadgeVariant[notif.type] || 'neutral'}>
                          {typeLabel[notif.type] || notif.type}
                        </Badge>

                        {!notif.is_read && (
                          <button
                            onClick={() => markReadMutation.mutate(notif.id)}
                            disabled={markReadMutation.isPending}
                            className="inline-flex items-center gap-1 text-[var(--text-accent)] transition-colors duration-[var(--duration-fast)] hover:underline disabled:opacity-50"
                            style={{ fontSize: 'var(--text-caption)' }}
                          >
                            <Check size={12} />
                            Mark read
                          </button>
                        )}

                        {notif.related_task_id && (
                          <a
                            href={`/tasks?task=${notif.related_task_id}`}
                            className="inline-flex items-center gap-1 text-[var(--text-accent)] transition-colors duration-[var(--duration-fast)] hover:underline"
                            style={{ fontSize: 'var(--text-caption)' }}
                          >
                            View Task
                            <ArrowRight size={10} />
                          </a>
                        )}

                        {notif.type === 'approval_required' && notif.related_task_id && (
                          <a
                            href={`/tasks?task=${notif.related_task_id}`}
                            className="inline-flex items-center gap-1 text-[var(--text-accent)] transition-colors duration-[var(--duration-fast)] hover:underline"
                            style={{ fontSize: 'var(--text-caption)' }}
                          >
                            View Approval
                            <ArrowRight size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {!isLoading && (!notifications || notifications.length === 0) && (
          <EmptyState
            icon={Bell}
            title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            description="Notifications from the AI agent will appear here"
          />
        )}
      </div>
    </div>
  );
}
