'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, X, MessageSquare, FolderPlus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useSidebar } from '@/contexts/SidebarContext';
import { dashboardConfig } from '@/config/dashboard';

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, isMobileOpen, toggleCollapsed, setMobileOpen } = useSidebar();

  const { data: stats } = useQuery({
    queryKey: ['sidebar-stats'],
    queryFn: async () => {
      const [tasksRes, notifRes, emailsRes] = await Promise.all([
        fetch('/api/stats').then((r) => r.json()),
        fetch('/api/notifications/unread-count').then((r) => r.json()),
        fetch('/api/emails?status=received&unread=true&count_only=true').then((r) => r.json()).catch(() => ({ count: 0 })),
      ]);
      return {
        pending_tasks: (tasksRes?.pending_approvals ?? 0) + (tasksRes?.escalated ?? 0),
        unread_notifications: notifRes?.count ?? 0,
        pending_emails: emailsRes?.count ?? 0,
      };
    },
    refetchInterval: 15000,
  });

  const { data: recentChats } = useQuery({
    queryKey: ['sidebar-chats'],
    queryFn: async () => {
      const res = await fetch('/api/chat?limit=8');
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
  });

  const badges: Record<string, number> = {
    pending_tasks: stats?.pending_tasks ?? 0,
    unread_notifications: stats?.unread_notifications ?? 0,
    pending_emails: stats?.pending_emails ?? 0,
  };

  const sidebarContent = (
    <>
      {/* Logo / Brand + Agent Identity + Collapse Toggle */}
      <div className={`flex items-center border-b border-[var(--sidebar-border)] ${isCollapsed ? 'justify-center px-3 py-5' : 'justify-between px-5 py-5'}`}>
        <div className={`flex items-center ${isCollapsed ? '' : 'gap-3'}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-white overflow-hidden">
            <Image src="/gloura-logo.jpeg" alt="Gloura" width={36} height={36} className="object-contain" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-[var(--sidebar-text-active)] truncate">Gloura</h1>
              <p className="text-[10px] text-[var(--sidebar-text)] truncate">Agent: {dashboardConfig.agent.name}</p>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <button
            onClick={toggleCollapsed}
            className="hidden md:flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-active)] transition-colors"
            title="Collapse sidebar"
          >
            <ChevronsLeft size={16} />
          </button>
        )}
      </div>

      {/* Primary Navigation */}
      <nav className={`flex-1 overflow-y-auto py-4 space-y-0.5 ${isCollapsed ? 'px-2' : 'px-3'}`}>
        {dashboardConfig.nav.main.map((item) => {
          const isSubItem = 'parent' in item && item.parent;
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href) && !isSubItem);
          const isSubActive = isSubItem && pathname === item.href;
          const badgeCount = ('badgeKey' in item && item.badgeKey) ? badges[item.badgeKey] : 0;

          // Hide sub-items when sidebar is collapsed
          if (isSubItem && isCollapsed) return null;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              title={isCollapsed ? item.title : undefined}
              className={`group relative flex items-center rounded-[var(--radius-md)] text-sm font-medium
                transition-all duration-150
                ${isCollapsed ? 'justify-center px-2 py-2.5' : isSubItem ? 'gap-3 px-3 py-2 ml-5' : 'gap-3 px-3 py-2.5'}
                ${
                  (isActive || isSubActive)
                    ? isSubItem
                      ? 'text-[var(--sidebar-text-active)] bg-[var(--sidebar-hover)]'
                      : 'bg-[var(--sidebar-active)] text-[var(--sidebar-text-active)]'
                    : 'text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-active)]'
                }`}
            >
              {/* Active indicator bar */}
              {(isActive || isSubActive) && !isSubItem && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-[var(--sidebar-accent)]" />
              )}
              <item.icon
                size={isSubItem ? 15 : 18}
                className={`shrink-0 ${
                  (isActive || isSubActive)
                    ? 'text-[var(--sidebar-accent)]'
                    : 'text-[var(--sidebar-text)] group-hover:text-[var(--sidebar-text-active)]'
                }`}
              />
              {!isCollapsed && <span className={`truncate ${isSubItem ? 'text-[13px]' : ''}`}>{item.title}</span>}
              {badgeCount > 0 && (
                <span
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-error text-[10px] font-bold text-white
                  ${isCollapsed ? 'absolute -right-0.5 -top-0.5' : 'ml-auto'} px-1`}
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}

              {/* Tooltip for collapsed mode */}
              {isCollapsed && (
                <div className="pointer-events-none absolute left-full ml-2 hidden rounded-[var(--radius-md)] bg-[var(--surface-elevated)] border border-[var(--border-default)] px-2 py-1 text-xs text-[var(--text-primary)] shadow-[var(--shadow-sm)] group-hover:block z-50">
                  {item.title}
                </div>
              )}
            </Link>
          );
        })}

        {/* CHATS Section */}
        {!isCollapsed && recentChats && recentChats.length > 0 && (
          <div className="pt-4 mt-4 border-t border-[var(--sidebar-border)]">
            <div className="flex items-center justify-between px-3 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sidebar-text)]">
                Chats
              </span>
              <Link
                href="/agent"
                onClick={() => setMobileOpen(false)}
                className="flex h-5 w-5 items-center justify-center rounded text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-active)] transition-colors"
                title="New chat"
              >
                <FolderPlus size={12} />
              </Link>
            </div>
            <div className="space-y-0.5">
              {recentChats.slice(0, 8).map((chat: { id: string; title: string; updated_at: string }) => (
                <Link
                  key={chat.id}
                  href={`/agent?conversation=${chat.id}`}
                  onClick={() => setMobileOpen(false)}
                  className="group flex items-center gap-2.5 px-3 py-1.5 rounded-[var(--radius-md)] text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-active)] transition-colors"
                >
                  <MessageSquare size={13} className="shrink-0 opacity-50" />
                  <span className="text-[12px] truncate">{chat.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Footer — Only expand toggle when collapsed */}
      {isCollapsed && (
        <div className="border-t border-[var(--sidebar-border)] px-2 py-3 flex justify-center">
          <button
            onClick={toggleCollapsed}
            className="hidden md:flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-active)] transition-colors"
            title="Expand sidebar"
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] transition-all duration-300 ease-[var(--ease-default)] ${
          isCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[var(--overlay-backdrop)] md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(16rem,85vw)] flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] transition-transform duration-300 ease-[var(--ease-default)] md:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-active)]"
        >
          <X size={18} />
        </button>
        {sidebarContent}
      </aside>
    </>
  );
}
