'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, ExternalLink, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ['notification-count'],
    queryFn: () => fetch('/api/notifications/unread-count').then((r) => r.json()),
    refetchInterval: 15000,
  });

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/notifications?limit=10').then((r) => r.json()),
    refetchInterval: 15000,
    enabled: isOpen,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_read: true }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
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
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-count'] });
    },
  });

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const unreadCount = countData?.count ?? 0;

  const typeIcon: Record<string, string> = {
    system: 'bg-[var(--status-info-surface)] text-[var(--text-accent)]',
    error: 'bg-[var(--status-error-surface)] text-[var(--interactive-destructive)]',
    approval_required: 'bg-[var(--status-warning-surface)] text-[var(--text-primary)]',
    call_completed: 'bg-[var(--status-success-surface)] text-[var(--text-primary)]',
    task_update: 'bg-[var(--surface-accent)] text-[var(--text-accent)]',
  };

  const formatTime = (dateStr: string) => {
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
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors duration-[var(--duration-fast)] focus-ring"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--interactive-destructive)] px-1 text-[10px] font-bold text-[var(--text-inverse)]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-xl z-50 overflow-hidden animate-[fadeInUp_var(--duration-normal)_var(--ease-default)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  className="text-xs text-[var(--text-accent)] hover:underline transition-colors duration-[var(--duration-fast)]"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors duration-[var(--duration-fast)]"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications && notifications.length > 0 ? (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`flex gap-3 px-4 py-3 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--surface-hover)] transition-colors duration-[var(--duration-fast)] cursor-pointer ${
                    !notif.is_read ? 'bg-[var(--surface-accent)]' : ''
                  }`}
                  onClick={() => {
                    if (!notif.is_read) markReadMutation.mutate(notif.id);
                  }}
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-xs font-medium ${
                      typeIcon[notif.type] || 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {notif.type === 'system' && 'SYS'}
                    {notif.type === 'error' && 'ERR'}
                    {notif.type === 'approval_required' && 'APR'}
                    {notif.type === 'call_completed' && 'CAL'}
                    {notif.type === 'task_update' && 'TSK'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notif.is_read ? 'font-semibold' : 'font-medium'} text-[var(--text-primary)] truncate`}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-0.5">
                      {notif.message}
                    </p>
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                      {formatTime(notif.created_at)}
                    </p>
                  </div>
                  {!notif.is_read && (
                    <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--interactive-primary)]" />
                  )}
                </div>
              ))
            ) : (
              <div className="py-8 text-center">
                <Bell className="mx-auto text-[var(--text-tertiary)] mb-2" size={24} />
                <p className="text-sm text-[var(--text-secondary)]">No notifications</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--border-default)] px-4 py-2.5">
            <a
              href="/notifications"
              className="flex items-center justify-center gap-1.5 text-xs font-medium text-[var(--text-accent)] hover:underline transition-colors duration-[var(--duration-fast)]"
              onClick={() => setIsOpen(false)}
            >
              View all notifications
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
