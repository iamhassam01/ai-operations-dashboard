'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Toggle } from '@/components/ui/Toggle';
import { useState, useEffect } from 'react';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export function Greeting() {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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

  const dndMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'do_not_disturb', value: enabled }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings-map'] });
    },
  });

  // Greeting: use user_name → business_name → "there"
  const fullName = (settings?.user_name as string) || (settings?.business_name as string) || 'there';
  const firstName = fullName.split(' ')[0];
  const isDnd = settings?.do_not_disturb === true || settings?.do_not_disturb === 'true';

  if (!mounted) {
    return (
      <div className="flex items-start justify-between">
        <div>
          <div className="h-8 w-48 rounded-[var(--radius-md)] skeleton" />
          <div className="mt-1 h-4 w-64 rounded-[var(--radius-sm)] skeleton" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-0">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1
            className="font-bold text-[var(--text-primary)]"
            style={{ fontSize: 'var(--text-heading)', lineHeight: '1.2' }}
          >
            {getGreeting()}, {firstName}
          </h1>
          <p
            className="mt-1 text-[var(--text-secondary)]"
            style={{ fontSize: 'var(--text-body-small)' }}
          >
            {formatDate()}
          </p>
        </div>

        <div className="shrink-0">
          <Toggle
            label="Do Not Disturb"
            checked={isDnd}
            onChange={(val) => dndMutation.mutate(val)}
            disabled={dndMutation.isPending}
          />
        </div>
      </div>
    </div>
  );
}
