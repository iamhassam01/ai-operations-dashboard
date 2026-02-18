'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  PhoneIncoming,
  PhoneOutgoing,
  Phone,
  PhoneCall,
  Search,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FilterPills } from '@/components/ui/FilterPills';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { OverlineHeading } from '@/components/ui/OverlineHeading';

interface Call {
  id: string;
  direction: string;
  phone_number: string;
  caller_name: string;
  status: string;
  duration_seconds: number;
  summary: string;
  transcript: string;
  recording_url: string;
  task_title: string;
  task_id: string;
  created_at: string;
}

const statusBadgeVariant: Record<string, 'success' | 'info' | 'error' | 'warning' | 'neutral'> = {
  completed: 'success',
  in_progress: 'info',
  failed: 'error',
  no_answer: 'warning',
  pending: 'neutral',
};

const filterOptions = [
  { value: 'all', label: 'All' },
  { value: 'inbound', label: 'Inbound' },
  { value: 'outbound', label: 'Outbound' },
];

const statusFilterOptions = [
  { value: 'all', label: 'Any Status' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'pending', label: 'Pending' },
];

function formatDuration(seconds: number): string {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function CallsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showTestCallModal, setShowTestCallModal] = useState(false);
  const [testCallNumber, setTestCallNumber] = useState('');
  const [testCallLoading, setTestCallLoading] = useState(false);
  const [testCallResult, setTestCallResult] = useState<{ success: boolean; callSid?: string; error?: string } | null>(null);

  const transcribeMutation = useMutation({
    mutationFn: (callId: string) =>
      fetch(`/api/calls/${callId}/transcribe`, { method: 'POST' }).then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Transcription failed'); });
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      toast.success('Transcription complete');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleTestCall = async () => {
    if (!testCallNumber.trim()) { toast.error('Enter a phone number'); return; }
    setTestCallLoading(true);
    setTestCallResult(null);
    try {
      const res = await fetch('/api/calls/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testCallNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Call failed');
      setTestCallResult({ success: true, callSid: data.callSid });
      toast.success('Test call placed successfully!');
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to place call';
      setTestCallResult({ success: false, error: msg });
      toast.error(msg);
    } finally {
      setTestCallLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: calls, isLoading } = useQuery<Call[]>({
    queryKey: ['calls'],
    queryFn: () => fetch('/api/calls?limit=50').then((r) => r.json()),
    refetchInterval: 10000,
  });

  const handleExpand = (id: string) => {
    setExpanded(expanded === id ? null : id);
  };

  const filteredCalls = calls?.filter((c) => {
    if (directionFilter !== 'all' && c.direction !== directionFilter) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (
      debouncedSearch &&
      !c.phone_number?.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
      !c.caller_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
      !c.summary?.toLowerCase().includes(debouncedSearch.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1
            className="font-bold text-[var(--text-primary)]"
            style={{ fontSize: 'var(--text-heading)' }}
          >
            Call History
          </h1>
          <p
            className="mt-0.5 text-[var(--text-secondary)]"
            style={{ fontSize: 'var(--text-body-small)' }}
          >
            View and manage all phone calls — Twilio connected
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<PhoneCall size={15} />}
          onClick={() => { setShowTestCallModal(true); setTestCallResult(null); }}
        >
          Make Test Call
        </Button>
      </div>

      {/* Test Call Modal */}
      {showTestCallModal && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-accent)] bg-[var(--surface-accent)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PhoneCall size={16} className="text-[var(--text-accent)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">Place a Test Call</span>
            </div>
            <button onClick={() => setShowTestCallModal(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <X size={16} />
            </button>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Enter a phone number in E.164 format to receive a test call from your Twilio number (+12272637593).
          </p>
          <div className="flex gap-2">
            <input
              type="tel"
              value={testCallNumber}
              onChange={(e) => setTestCallNumber(e.target.value)}
              placeholder="+1234567890"
              className="flex-1 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-primary)] text-[var(--text-primary)] py-2 px-3 text-sm placeholder:text-[var(--text-placeholder)] focus-ring"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleTestCall}
              loading={testCallLoading}
              icon={testCallLoading ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
            >
              Call Now
            </Button>
          </div>
          {testCallResult && (
            <div className={`flex items-center gap-2 text-xs rounded-[var(--radius-md)] px-3 py-2 ${
              testCallResult.success
                ? 'bg-[var(--status-success-surface)] text-success'
                : 'bg-[var(--status-error-surface)] text-error'
            }`}>
              {testCallResult.success ? <CheckCircle2 size={14} /> : <X size={14} />}
              {testCallResult.success
                ? `Call placed! SID: ${testCallResult.callSid}`
                : testCallResult.error}
            </div>
          )}
        </div>
      )}

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-placeholder)]"
            size={16}
          />
          <input
            type="text"
            placeholder="Search calls..."
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
            options={filterOptions}
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

      {/* Call List */}
      <div className="space-y-2 stagger-children">
        {isLoading && <SkeletonList count={5} />}

        {filteredCalls?.map((call) => (
          <div
            key={call.id}
            className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-primary)] overflow-hidden transition-all duration-[var(--duration-fast)] hover:border-[var(--border-hover)]"
          >
            {/* Collapsed Row */}
            <button
              className="flex w-full items-center gap-2 sm:gap-3 p-3 sm:p-4 text-left cursor-pointer"
              onClick={() => handleExpand(call.id)}
            >
              <div
                className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${
                  call.direction === 'inbound'
                    ? 'bg-[var(--status-success-surface)]'
                    : 'bg-[var(--status-info-surface)]'
                }`}
              >
                {call.direction === 'inbound' ? (
                  <PhoneIncoming size={14} className="text-[var(--text-primary)] sm:hidden" />
                ) : (
                  <PhoneOutgoing size={14} className="text-[var(--text-accent)] sm:hidden" />
                )}
                {call.direction === 'inbound' ? (
                  <PhoneIncoming size={16} className="text-[var(--text-primary)] hidden sm:block" />
                ) : (
                  <PhoneOutgoing size={16} className="text-[var(--text-accent)] hidden sm:block" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="font-medium text-[var(--text-primary)] truncate"
                    style={{ fontSize: 'var(--text-body-small)' }}
                  >
                    {call.caller_name || call.phone_number}
                  </span>
                  <Badge variant={statusBadgeVariant[call.status] || 'neutral'}>
                    {call.status}
                  </Badge>
                </div>
                <p
                  className="mt-0.5 text-[var(--text-tertiary)] truncate"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  {call.task_title || 'No linked task'} · {call.direction}
                </p>
              </div>

              <div className="text-right shrink-0">
                <span
                  className="font-medium text-[var(--text-primary)] tabular-nums"
                  style={{ fontSize: 'var(--text-body-small)' }}
                >
                  {formatDuration(call.duration_seconds)}
                </span>
                <p
                  className="text-[var(--text-tertiary)] hidden sm:block"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  {new Date(call.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              <div className="shrink-0 text-[var(--text-tertiary)]">
                {expanded === call.id ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </div>
            </button>

            {/* Expanded Detail */}
            {expanded === call.id && (
              <div
                className="border-t border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4 space-y-4"
                style={{
                  animation: `fadeInUp var(--duration-moderate) var(--ease-default)`,
                }}
              >
                {call.summary && (
                  <div>
                    <OverlineHeading>Summary</OverlineHeading>
                    <p
                      className="mt-1.5 text-[var(--text-primary)]"
                      style={{ fontSize: 'var(--text-body-small)', lineHeight: '1.6' }}
                    >
                      {call.summary}
                    </p>
                  </div>
                )}

                {call.transcript && (
                  <div>
                    <OverlineHeading>Transcript</OverlineHeading>
                    <pre
                      className="mt-1.5 whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-3 max-h-48 overflow-y-auto text-[var(--text-secondary)]"
                      style={{ fontSize: 'var(--text-caption)', lineHeight: '1.6' }}
                    >
                      {call.transcript}
                    </pre>
                  </div>
                )}

                {call.recording_url && (
                  <div>
                    <OverlineHeading>Recording</OverlineHeading>
                    <audio controls className="mt-1.5 w-full h-8">
                      <source src={call.recording_url} />
                    </audio>
                  </div>
                )}

                {/* Transcribe button for calls with recording but no transcript */}
                {call.recording_url && !call.transcript && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={transcribeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                    onClick={() => transcribeMutation.mutate(call.id)}
                    loading={transcribeMutation.isPending}
                  >
                    Transcribe Recording
                  </Button>
                )}

                {call.task_id && call.task_title && (
                  <div>
                    <OverlineHeading>Linked Task</OverlineHeading>
                    <a
                      href={`/tasks?task=${call.task_id}`}
                      className="mt-1.5 inline-flex items-center gap-1 text-[var(--text-accent)] transition-colors duration-[var(--duration-fast)] hover:underline"
                      style={{ fontSize: 'var(--text-body-small)' }}
                    >
                      View Task: &ldquo;{call.task_title}&rdquo; →
                    </a>
                  </div>
                )}

                {!call.summary && !call.transcript && !call.recording_url && (
                  <p
                    className="text-center py-2 text-[var(--text-tertiary)]"
                    style={{ fontSize: 'var(--text-body-small)' }}
                  >
                    No additional details available
                  </p>
                )}
              </div>
            )}
          </div>
        ))}

        {!isLoading && (!filteredCalls || filteredCalls.length === 0) && (
          <EmptyState
            icon={Phone}
            title="No calls yet"
            description="Twilio is connected and ready. Place a test call or wait for incoming calls."
            tip="Click 'Make Test Call' above to verify the connection"
          />
        )}
      </div>
    </div>
  );
}
