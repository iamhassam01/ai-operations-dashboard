'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot, Brain, BookOpen, Wrench, MessageSquare, LayoutGrid,
  Hash, Shield, Zap, Activity, Clock, Server, Cpu, ChevronRight, Eye
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterPills } from '@/components/ui/FilterPills';

interface AgentStatus {
  sessions: number;
  memory_facts: number;
  active_tools: number;
  recent_activity: { action: string; count: string }[];
  recent_conversations: { id: string; title: string; updated_at: string }[];
  agent: { name: string; identity: string; model: string; version: string };
}

interface AgentTool {
  id: number;
  name: string;
  description: string;
  tool_type: string;
  is_enabled: boolean;
  usage_count: number;
  last_used_at: string | null;
}

interface Session {
  id: string;
  title: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const toolTypeIcons: Record<string, typeof Wrench> = {
  builtin: Cpu,
  mcp: Server,
  custom: Zap,
  memory: Brain,
};

const toolTypeBadge: Record<string, 'neutral' | 'accent' | 'success' | 'info'> = {
  builtin: 'neutral',
  mcp: 'accent',
  custom: 'success',
  memory: 'info',
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Behavioral Principles (from AGENTS.md) ─────────────────────────
const PRINCIPLES = [
  { title: 'Proactive Memory', description: 'Save important user information without being asked. Categorize by preference, context, workflow, or contact.' },
  { title: 'Approval First', description: 'Always seek human approval before taking actions like making calls, sending emails, or creating tasks.' },
  { title: 'Cross-Channel Triage', description: 'Aggregate urgent items across tasks, calls, emails, and notifications for unified priority view.' },
  { title: 'Context Loading', description: 'Check stored memories before responding to avoid asking the user to repeat known information.' },
];

export default function AgentOverviewTab() {
  const { data: status, isLoading } = useQuery<AgentStatus>({
    queryKey: ['agent-status'],
    queryFn: () => fetch('/api/agent-status').then(r => r.json()),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-24" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        <SkeletonList count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 stagger-children">
      {/* Agent Identity Card */}
      <Card className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-accent)]">
          <Bot size={28} className="text-[var(--text-accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{status?.agent.name ?? 'Bob'}</h2>
            <StatusDot color="success" pulse />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{status?.agent.identity ?? 'Mr. Ermakov'} &middot; Gloura Agent</p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <Badge variant="accent">{status?.agent.model ?? 'openai/gpt-4o'}</Badge>
            <Badge variant="neutral">v{status?.agent.version ?? '2026.3.1'}</Badge>
          </div>
        </div>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="text-center">
          <div className="flex h-9 w-9 mx-auto items-center justify-center rounded-full bg-[var(--surface-accent)] mb-2">
            <MessageSquare size={16} className="text-[var(--text-accent)]" />
          </div>
          <p className="text-xl font-bold text-[var(--text-primary)]">{status?.sessions ?? 0}</p>
          <p className="text-xs text-[var(--text-secondary)]">Sessions</p>
        </Card>
        <Card className="text-center">
          <div className="flex h-9 w-9 mx-auto items-center justify-center rounded-full bg-error/10 mb-2">
            <Brain size={16} className="text-error" />
          </div>
          <p className="text-xl font-bold text-[var(--text-primary)]">{status?.memory_facts ?? 0}</p>
          <p className="text-xs text-[var(--text-secondary)]">Memory Facts</p>
        </Card>
        <Card className="text-center">
          <div className="flex h-9 w-9 mx-auto items-center justify-center rounded-full bg-success/10 mb-2">
            <Wrench size={16} className="text-success" />
          </div>
          <p className="text-xl font-bold text-[var(--text-primary)]">{status?.active_tools ?? 0}</p>
          <p className="text-xs text-[var(--text-secondary)]">Active Tools</p>
        </Card>
        <Card className="text-center">
          <div className="flex h-9 w-9 mx-auto items-center justify-center rounded-full bg-warning/10 mb-2">
            <Shield size={16} className="text-warning" />
          </div>
          <p className="text-xl font-bold text-[var(--text-primary)]">8</p>
          <p className="text-xs text-[var(--text-secondary)]">Sub-agents</p>
        </Card>
      </div>

      {/* Two-column: Recent Activity + Behavioral Principles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Activity */}
        <Card>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Recent Activity (24h)</h3>
          {(status?.recent_activity ?? []).length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">No recent activity</p>
          ) : (
            <div className="space-y-2">
              {status!.recent_activity.map((act, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <Activity size={14} className="text-[var(--text-accent)]" />
                    <span className="text-sm text-[var(--text-primary)]">{titleCase(act.action)}</span>
                  </div>
                  <Badge variant="neutral">{act.count}x</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Behavioral Principles */}
        <Card>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Agent Principles</h3>
          <div className="space-y-3">
            {PRINCIPLES.map((p, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-accent)] mt-0.5">
                  <span className="text-[10px] font-bold text-[var(--text-accent)]">{i + 1}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{p.title}</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent Conversations */}
      <Card>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Recent Conversations</h3>
        {(status?.recent_conversations ?? []).length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">No conversations yet</p>
        ) : (
          <div className="space-y-0 divide-y divide-[var(--border-subtle)]">
            {status!.recent_conversations.map(conv => (
              <div key={conv.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare size={14} className="text-[var(--text-tertiary)] shrink-0" />
                  <span className="text-sm text-[var(--text-primary)] truncate">{conv.title || 'Untitled'}</span>
                </div>
                <span className="text-xs text-[var(--text-tertiary)] shrink-0 ml-2">{timeAgo(conv.updated_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Tools Tab ─────────────────────────────────────────────────────

export function AgentToolsTab() {
  const { data: tools = [], isLoading } = useQuery<AgentTool[]>({
    queryKey: ['agent-tools'],
    queryFn: () => fetch('/api/agent-tools').then(r => r.json()),
    refetchInterval: 30000,
  });

  const [filter, setFilter] = useState('all');
  const types = ['all', ...new Set(tools.map(t => t.tool_type))];
  const filtered = filter === 'all' ? tools : tools.filter(t => t.tool_type === filter);

  if (isLoading) {
    return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Tools & Capabilities</h2>
          <p className="text-sm text-[var(--text-secondary)]">{tools.filter(t => t.is_enabled).length} of {tools.length} tools active</p>
        </div>
      </div>

      <FilterPills
        options={types.map(t => ({ value: t, label: t === 'all' ? 'All' : titleCase(t) }))}
        value={filter}
        onChange={setFilter}
      />

      {filtered.length === 0 ? (
        <EmptyState icon={Wrench} title="No tools found" description="No tools match the current filter." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger-children">
          {filtered.map(tool => {
            const Icon = toolTypeIcons[tool.tool_type] || Wrench;
            return (
              <Card key={tool.id} className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] ${
                      tool.is_enabled ? 'bg-[var(--surface-accent)]' : 'bg-[var(--surface-secondary)]'
                    }`}>
                      <Icon size={18} className={tool.is_enabled ? 'text-[var(--text-accent)]' : 'text-[var(--text-disabled)]'} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{tool.name}</p>
                      <Badge variant={toolTypeBadge[tool.tool_type] || 'neutral'}>{titleCase(tool.tool_type)}</Badge>
                    </div>
                  </div>
                  <StatusDot color={tool.is_enabled ? 'success' : 'neutral'} />
                </div>
                {tool.description && (
                  <p className="text-sm text-[var(--text-secondary)] line-clamp-2">{tool.description}</p>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]">
                  <span className="text-xs text-[var(--text-tertiary)]">Used {tool.usage_count}x</span>
                  {tool.last_used_at && (
                    <span className="text-xs text-[var(--text-tertiary)]">{timeAgo(tool.last_used_at)}</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sessions Tab ──────────────────────────────────────────────────

export function AgentSessionsTab() {
  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ['conversations'],
    queryFn: () => fetch('/api/chat').then(r => r.json()),
    refetchInterval: 15000,
  });

  if (isLoading) return <SkeletonList count={6} />;

  if (sessions.length === 0) {
    return <EmptyState icon={MessageSquare} title="No sessions" description="Start a conversation with the agent to create a session." />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Conversation Sessions</h2>
        <p className="text-sm text-[var(--text-secondary)]">{sessions.length} total sessions</p>
      </div>

      {/* Desktop: Table */}
      <div className="hidden sm:block">
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Title</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Started</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {sessions.map(s => (
                  <tr key={s.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-[var(--text-primary)]">{s.title || 'Untitled'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={s.is_active ? 'success' : 'neutral'} dot>{s.is_active ? 'Active' : 'Closed'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-tertiary)]">{timeAgo(s.created_at)}</td>
                    <td className="px-4 py-3 text-[var(--text-tertiary)]">{timeAgo(s.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Mobile: Cards */}
      <div className="sm:hidden space-y-2 stagger-children">
        {sessions.map(s => (
          <Card key={s.id} className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-accent)]">
              <MessageSquare size={16} className="text-[var(--text-accent)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">{s.title || 'Untitled'}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant={s.is_active ? 'success' : 'neutral'} dot>{s.is_active ? 'Active' : 'Closed'}</Badge>
                <span className="text-[10px] text-[var(--text-tertiary)]">{timeAgo(s.updated_at)}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
