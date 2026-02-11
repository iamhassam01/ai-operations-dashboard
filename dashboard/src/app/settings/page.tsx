'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Phone, Calendar, Bot, Check, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { OverlineHeading } from '@/components/ui/OverlineHeading';
import { Input, Select } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { Badge, StatusDot } from '@/components/ui/Badge';

interface Setting {
  key: string;
  value: unknown;
  description: string;
  updated_at: string;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

interface DaySchedule {
  enabled: boolean;
  start: string;
  end: string;
}

const DEFAULT_OFFICE_HOURS: Record<string, DaySchedule> = {
  monday: { enabled: true, start: '09:00', end: '18:00' },
  tuesday: { enabled: true, start: '09:00', end: '18:00' },
  wednesday: { enabled: true, start: '09:00', end: '18:00' },
  thursday: { enabled: true, start: '09:00', end: '18:00' },
  friday: { enabled: true, start: '09:00', end: '17:00' },
  saturday: { enabled: false, start: '10:00', end: '14:00' },
  sunday: { enabled: false, start: '10:00', end: '14:00' },
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [officeHours, setOfficeHours] = useState<Record<string, DaySchedule>>(DEFAULT_OFFICE_HOURS);

  const { data: settings, isLoading } = useQuery<Setting[]>({
    queryKey: ['settings'],
    queryFn: () => fetch('/api/settings').then((r) => r.json()),
  });

  useEffect(() => {
    if (settings && Array.isArray(settings)) {
      const map: Record<string, string> = {};
      settings.forEach((s) => {
        if (s.key === 'office_hours' && typeof s.value === 'object' && s.value !== null) {
          setOfficeHours(s.value as Record<string, DaySchedule>);
        } else {
          const val = typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
          map[s.key] = val.replace(/^"|"$/g, '');
        }
      });
      setEditedSettings(map);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (data: { key: string; value: unknown }) =>
      fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) throw new Error('Failed to save setting');
        return r.json();
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings-map'] });
      setSavedKeys((prev) => new Set(prev).add(variables.key));
      setTimeout(() => {
        setSavedKeys((prev) => {
          const next = new Set(prev);
          next.delete(variables.key);
          return next;
        });
      }, 2000);
      toast.success(`Saved`);
    },
    onError: () => {
      toast.error('Failed to save setting');
    },
  });

  const update = (key: string, value: string) => {
    setEditedSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveSection = (keys: string[]) => {
    keys.forEach((key) => {
      mutation.mutate({ key, value: editedSettings[key] || '' });
    });
  };

  const updateOfficeHours = (day: string, schedule: DaySchedule) => {
    setOfficeHours((prev) => ({ ...prev, [day]: schedule }));
  };

  const handleSaveOfficeHours = () => {
    mutation.mutate({ key: 'office_hours', value: officeHours });
  };

  const integrations = [
    {
      name: 'OpenClaw AI Agent',
      icon: Bot,
      status: 'connected' as const,
      detail: 'Gateway running on port 18789',
    },
    {
      name: 'Twilio Telephony',
      icon: Phone,
      status: 'pending' as const,
      detail: 'Awaiting Twilio credentials',
    },
    {
      name: 'Google Calendar',
      icon: Calendar,
      status: 'pending' as const,
      detail: 'Awaiting OAuth setup',
    },
  ];

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Page Header */}
      <div>
        <h1
          className="font-bold text-[var(--text-primary)]"
          style={{ fontSize: 'var(--text-heading)' }}
        >
          Settings
        </h1>
        <p
          className="mt-0.5 text-[var(--text-secondary)]"
          style={{ fontSize: 'var(--text-body-small)' }}
        >
          Manage integrations and configuration
        </p>
      </div>

      {/* Section: User Profile */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-transparent p-5">
        <OverlineHeading>Your Profile</OverlineHeading>
        <div className="mt-4 space-y-4">
          <Input
            label="Full Name"
            value={editedSettings.user_name || ''}
            onChange={(e) => update('user_name', e.target.value)}
            placeholder="e.g., Ivan Korn"
          />
          <Select
            label="Role"
            value={editedSettings.user_role || 'Admin'}
            onChange={(e) => update('user_role', e.target.value)}
            options={[
              { value: 'Admin', label: 'Admin' },
              { value: 'Manager', label: 'Manager' },
              { value: 'Viewer', label: 'Viewer' },
            ]}
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleSaveSection(['user_name', 'user_role'])}
              loading={mutation.isPending}
            >
              {savedKeys.has('user_name') ? (
                <>
                  <Check size={14} /> Saved
                </>
              ) : (
                <>
                  <Save size={14} /> Save Profile
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Section 1: Agent Identity */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-transparent p-5">
        <OverlineHeading>Agent Identity</OverlineHeading>
        <div className="mt-4 space-y-4">
          <Input
            label="Agent Name"
            value={editedSettings.agent_name || ''}
            onChange={(e) => update('agent_name', e.target.value)}
          />
          <Input
            label="Phone Identity"
            value={editedSettings.agent_identity || ''}
            onChange={(e) => update('agent_identity', e.target.value)}
          />
          <Input
            label="Business Name"
            value={editedSettings.business_name || ''}
            onChange={(e) => update('business_name', e.target.value)}
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                handleSaveSection(['agent_name', 'agent_identity', 'business_name'])
              }
              loading={mutation.isPending}
            >
              {savedKeys.has('agent_name') ? (
                <>
                  <Check size={14} /> Saved
                </>
              ) : (
                <>
                  <Save size={14} /> Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Section 2: Contact & Communication */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-transparent p-5">
        <OverlineHeading>Contact &amp; Communication</OverlineHeading>
        <div className="mt-4 space-y-4">
          <Input
            label="Primary Email"
            type="email"
            value={editedSettings.primary_email || ''}
            onChange={(e) => update('primary_email', e.target.value)}
          />
          <Input
            label="CC Email"
            type="email"
            value={editedSettings.cc_email || ''}
            onChange={(e) => update('cc_email', e.target.value)}
          />
          <Input
            label="Inbound Phone Country"
            value={editedSettings.inbound_phone_country || ''}
            onChange={(e) => update('inbound_phone_country', e.target.value)}
            placeholder="e.g., +420 xxx xxx xxx"
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                handleSaveSection([
                  'primary_email',
                  'cc_email',
                  'inbound_phone_country',
                ])
              }
              loading={mutation.isPending}
            >
              {savedKeys.has('primary_email') ? (
                <>
                  <Check size={14} /> Saved
                </>
              ) : (
                <>
                  <Save size={14} /> Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Section 3: Preferences */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-transparent p-5">
        <OverlineHeading>Preferences</OverlineHeading>
        <div className="mt-4 space-y-5">
          <Toggle
            label="Do Not Disturb"
            description="Pause all agent activity and notifications"
            checked={
              editedSettings.do_not_disturb === 'true' ||
              editedSettings.do_not_disturb === true.toString()
            }
            onChange={(val) => {
              update('do_not_disturb', val.toString());
              mutation.mutate({ key: 'do_not_disturb', value: val.toString() });
            }}
          />
          <Toggle
            label="Outbound Calls Enabled"
            description="Allow agent to make outbound phone calls"
            checked={
              editedSettings.outbound_enabled === 'true' ||
              editedSettings.outbound_enabled === true.toString()
            }
            onChange={(val) => {
              update('outbound_enabled', val.toString());
              mutation.mutate({ key: 'outbound_enabled', value: val.toString() });
            }}
          />
          <Toggle
            label="Approval Required"
            description="Require manual approval before agent takes actions"
            checked={
              editedSettings.approval_required === 'true' ||
              editedSettings.approval_required === true.toString()
            }
            onChange={(val) => {
              update('approval_required', val.toString());
              mutation.mutate({ key: 'approval_required', value: val.toString() });
            }}
          />
        </div>
      </section>

      {/* Section 4: Office Hours */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-transparent p-5">
        <OverlineHeading action={
          <div className="flex items-center gap-1 text-[var(--text-tertiary)]">
            <Clock size={12} />
            <span style={{ fontSize: 'var(--text-caption)' }}>Agent activity schedule</span>
          </div>
        }>Office Hours</OverlineHeading>
        <div className="mt-4 space-y-1">
          {DAYS.map((day) => {
            const schedule = officeHours[day] || DEFAULT_OFFICE_HOURS[day];
            return (
              <div
                key={day}
                className="flex items-center gap-3 rounded-[var(--radius-md)] py-2.5 px-3 hover:bg-[var(--surface-hover)] transition-colors"
              >
                <Toggle
                  checked={schedule.enabled}
                  onChange={(val) => updateOfficeHours(day, { ...schedule, enabled: val })}
                />
                <span
                  className={`w-12 font-medium ${
                    schedule.enabled ? 'text-[var(--text-primary)]' : 'text-[var(--text-disabled)]'
                  }`}
                  style={{ fontSize: 'var(--text-body-small)' }}
                >
                  {DAY_LABELS[day]}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={schedule.start}
                    disabled={!schedule.enabled}
                    onChange={(e) => updateOfficeHours(day, { ...schedule, start: e.target.value })}
                    className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-primary)] px-2 py-1 text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
                    style={{ fontSize: 'var(--text-body-small)' }}
                  />
                  <span className="text-[var(--text-tertiary)]">—</span>
                  <input
                    type="time"
                    value={schedule.end}
                    disabled={!schedule.enabled}
                    onChange={(e) => updateOfficeHours(day, { ...schedule, end: e.target.value })}
                    className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-primary)] px-2 py-1 text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
                    style={{ fontSize: 'var(--text-body-small)' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveOfficeHours}
            loading={mutation.isPending}
          >
            {savedKeys.has('office_hours') ? (
              <>
                <Check size={14} /> Saved
              </>
            ) : (
              <>
                <Save size={14} /> Save Hours
              </>
            )}
          </Button>
        </div>
      </section>

      {/* Section 5: Notification Preferences */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-transparent p-5">
        <OverlineHeading>Notification Preferences</OverlineHeading>
        <div className="mt-4 space-y-5">
          <Toggle
            label="Email Notifications"
            description="Receive email alerts for important events"
            checked={
              editedSettings.notification_email_enabled === 'true'
            }
            onChange={(val) => {
              update('notification_email_enabled', val.toString());
              mutation.mutate({ key: 'notification_email_enabled', value: val.toString() });
            }}
          />
          <Toggle
            label="Sound Alerts"
            description="Play a sound for new notifications"
            checked={
              editedSettings.notification_sound_enabled === 'true'
            }
            onChange={(val) => {
              update('notification_sound_enabled', val.toString());
              mutation.mutate({ key: 'notification_sound_enabled', value: val.toString() });
            }}
          />
        </div>
      </section>

      {/* Section 6: Integrations */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-transparent p-5">
        <OverlineHeading>Integrations</OverlineHeading>
        <div className="mt-4 space-y-3">
          {integrations.map((integration) => (
            <div
              key={integration.name}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4"
            >
              <div className="flex items-center gap-3">
                <StatusDot
                  color={integration.status === 'connected' ? 'success' : 'warning'}
                  size="md"
                  pulse={integration.status === 'connected'}
                />
                <div>
                  <p
                    className="font-medium text-[var(--text-primary)]"
                    style={{ fontSize: 'var(--text-body-small)' }}
                  >
                    {integration.name}
                  </p>
                  <p
                    className="text-[var(--text-tertiary)]"
                    style={{ fontSize: 'var(--text-caption)' }}
                  >
                    {integration.detail}
                  </p>
                </div>
              </div>
              <Badge
                variant={integration.status === 'connected' ? 'success' : 'warning'}
              >
                {integration.status === 'connected' ? 'Connected' : 'Pending'}
              </Badge>
            </div>
          ))}
        </div>
      </section>

      {/* Section 7: System Information */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-transparent p-5">
        <OverlineHeading>System Information</OverlineHeading>
        <div className="mt-4 space-y-3">
          {[
            { label: 'Dashboard Version', value: '1.0.0' },
            { label: 'OpenClaw Version', value: 'v2026.2.6-3' },
            { label: 'Database', value: 'PostgreSQL 17.7' },
            { label: 'Node.js', value: '22.22.0' },
            { label: 'Server IP', value: '76.13.40.146' },
            { label: 'Timezone', value: 'Europe/Prague' },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-1">
              <span
                className="text-[var(--text-secondary)]"
                style={{ fontSize: 'var(--text-body-small)' }}
              >
                {item.label}
              </span>
              <span
                className="font-mono text-[var(--text-primary)]"
                style={{ fontSize: 'var(--text-body-small)' }}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
