'use client';

import { Menu, ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useSidebar } from '@/contexts/SidebarContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationDropdown } from '@/components/NotificationDropdown';
import { StatusDot } from '@/components/ui/Badge';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/tasks': 'Tasks',
  '/calls': 'Call History',
  '/agent': 'Agent Chat',
  '/settings': 'Settings',
  '/notifications': 'Notifications',
};

export function Header() {
  const { setMobileOpen } = useSidebar();
  const pathname = usePathname();

  const { data: settings } = useQuery<Record<string, unknown>>({
    queryKey: ['settings-map'],
    queryFn: async () => {
      const rows = await fetch('/api/settings').then((r) => r.json());
      if (!Array.isArray(rows)) return {};
      const map: Record<string, unknown> = {};
      rows.forEach((s: { key: string; value: unknown }) => {
        map[s.key] = s.value;
      });
      return map;
    },
    staleTime: 30000,
  });

  const { data: health } = useQuery<{ status: string; services: Record<string, { status: string }> }>({
    queryKey: ['health'],
    queryFn: () => fetch('/api/health').then((r) => r.json()),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const agentOnline = health?.services?.openclaw?.status === 'connected' || health?.services?.database?.status === 'connected';
  const agentStatus = health ? (agentOnline ? 'Online' : 'Degraded') : 'Checking...';

  const pageTitle = pageTitles[pathname] || 'Dashboard';
  const userName = (settings?.user_name as string) || (settings?.business_name as string) || 'User';
  const userRole = (settings?.user_role as string) || 'Admin';
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <header className="flex items-center justify-between border-b border-[var(--border-default)] bg-[var(--surface-primary)] px-4 py-3 md:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors md:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm">
          <Link href="/" className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
            Gloura
          </Link>
          <ChevronRight size={14} className="text-[var(--text-tertiary)]" />
          <span className="font-medium text-[var(--text-primary)]">
            {pathname === '/' ? 'Overview' : pageTitle}
          </span>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        {/* Agent status — live from health check */}
        <div className="hidden sm:flex items-center gap-1.5 mr-1 px-2 py-1 rounded-full bg-[var(--surface-secondary)]">
          <StatusDot color={agentOnline ? 'success' : 'warning'} size="sm" pulse={agentOnline} />
          <span className="text-[10px] font-medium text-[var(--text-tertiary)]">Agent {agentStatus}</span>
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Notifications */}
        <NotificationDropdown />

        {/* Divider */}
        <div className="mx-1 h-6 w-px bg-[var(--border-default)]" />

        {/* User — dynamic from settings */}
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-1.5 hover:bg-[var(--surface-hover)] transition-colors"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--interactive-primary)] text-[var(--text-inverse)] text-xs font-semibold">
            {userInitial}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-[var(--text-primary)]">{userName}</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">{userRole}</p>
          </div>
        </Link>
      </div>
    </header>
  );
}
