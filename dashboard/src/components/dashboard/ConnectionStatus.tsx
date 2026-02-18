'use client';

import { useQuery } from '@tanstack/react-query';
import { Phone, Calendar, Mic, Wifi, ArrowRight, Activity } from 'lucide-react';
import { StatusDot } from '@/components/ui/Badge';
import { OverlineHeading } from '@/components/ui/OverlineHeading';

interface HealthData {
  status: string;
  services: Record<string, { status: string; detail: string }>;
}

interface ConnectionItem {
  label: string;
  icon: React.ElementType;
  status: 'connected' | 'pending' | 'error';
  detail: string;
}

const statusDotColor: Record<string, 'success' | 'warning' | 'error'> = {
  connected: 'success',
  pending: 'warning',
  error: 'error',
};

export function ConnectionStatus() {
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

  const { data: health } = useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: () => fetch('/api/health').then((r) => r.json()),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const inboundPhone = settings?.inbound_phone_country as string | undefined;

  // Build dynamic connections from health check data
  const connections: ConnectionItem[] = [
    {
      label: 'AI Agent',
      icon: Wifi,
      status: (health?.services?.openclaw?.status as 'connected' | 'pending' | 'error') || 'pending',
      detail: health?.services?.openclaw?.detail || 'Checking...',
    },
    {
      label: 'Telephony',
      icon: Phone,
      status: (health?.services?.twilio?.status as 'connected' | 'pending' | 'error') || 'pending',
      detail: health?.services?.twilio?.detail || 'Checking...',
    },
    {
      label: 'Calendar',
      icon: Calendar,
      status: 'pending',
      detail: 'Not configured',
    },
    {
      label: 'Recording',
      icon: Mic,
      status: (health?.services?.twilio?.status as 'connected' | 'pending' | 'error') || 'pending',
      detail: health?.services?.twilio?.status === 'connected' ? 'Via Twilio' : 'Requires Twilio',
    },
  ];

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-transparent p-5">
      <OverlineHeading>System Status</OverlineHeading>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
        {connections.map((conn) => (
          <div key={conn.label} className="flex items-center gap-3">
            <StatusDot
              color={statusDotColor[conn.status]}
              size="md"
              pulse={conn.status === 'connected'}
            />
            <div>
              <p
                className="font-medium text-[var(--text-primary)]"
                style={{ fontSize: 'var(--text-body-small)' }}
              >
                {conn.label}
              </p>
              <p
                className="text-[var(--text-tertiary)]"
                style={{ fontSize: 'var(--text-caption)' }}
              >
                {conn.detail}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Phone number display — R14/R15 */}
      <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Phone size={14} className="text-[var(--text-tertiary)]" />
          <span
            className="text-[var(--text-secondary)]"
            style={{ fontSize: 'var(--text-body-small)' }}
          >
            Inbound:
          </span>
          {inboundPhone ? (
            <span
              className="font-medium text-[var(--text-primary)]"
              style={{ fontSize: 'var(--text-body-small)' }}
            >
              {inboundPhone}
            </span>
          ) : (
            <span
              className="text-[var(--text-placeholder)]"
              style={{ fontSize: 'var(--text-body-small)' }}
            >
              Not configured
            </span>
          )}
        </div>
        {!inboundPhone && (
          <a
            href="/settings"
            className="inline-flex items-center gap-1 text-[var(--text-accent)] transition-colors duration-[var(--duration-fast)] hover:underline"
            style={{ fontSize: 'var(--text-caption)' }}
          >
            Set up Twilio
            <ArrowRight size={12} />
          </a>
        )}
      </div>
    </div>
  );
}
