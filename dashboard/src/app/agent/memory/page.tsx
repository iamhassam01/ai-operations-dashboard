'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Brain, BookOpen, MessageSquare, Plus, Search, Pencil, Trash2, Check, X, Loader2, Tag
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FilterPills } from '@/components/ui/FilterPills';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';

interface MemoryFact {
  id: number;
  key: string;
  value: string;
  category: string;
  source: string;
  created_at: string;
  updated_at: string;
}

interface MemoryStyle {
  id: number;
  pattern: string;
  example: string | null;
  context: string | null;
  created_at: string;
}

interface MemoryStats {
  facts: number;
  styles: number;
  conversations: number;
}

const categoryVariant: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info'> = {
  personal_info: 'neutral',
  team_info: 'accent',
  business_metrics: 'success',
  social_media: 'info',
  preferences: 'warning',
  contacts: 'accent',
  workflow: 'info',
  general: 'neutral',
};

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

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

const CATEGORIES = ['all', 'personal_info', 'business_metrics', 'social_media', 'team_info', 'preferences', 'contacts', 'workflow', 'general'];
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'facts', label: 'Facts' },
  { id: 'style', label: 'Style' },
  { id: 'history', label: 'History' },
];

export default function MemoryBankPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('facts');
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingFact, setEditingFact] = useState<MemoryFact | null>(null);
  const [formData, setFormData] = useState({ key: '', value: '', category: 'general' });

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useQuery<MemoryStats>({
    queryKey: ['memory-stats'],
    queryFn: () => fetch('/api/agent-memory-facts?tab=stats').then(r => r.json()),
  });

  // Fetch facts
  const { data: facts = [], isLoading: factsLoading } = useQuery<MemoryFact[]>({
    queryKey: ['memory-facts', activeCategory, searchQuery],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeCategory !== 'all') params.set('category', activeCategory);
      if (searchQuery) params.set('search', searchQuery);
      return fetch(`/api/agent-memory-facts?${params}`).then(r => r.json());
    },
  });

  // Fetch styles
  const { data: styles = [] } = useQuery<MemoryStyle[]>({
    queryKey: ['memory-styles'],
    queryFn: () => fetch('/api/agent-memory-facts?tab=styles').then(r => r.json()),
    enabled: activeTab === 'style' || activeTab === 'overview',
  });

  // Fetch categories with counts
  const { data: categories = [] } = useQuery<{ category: string; count: string }[]>({
    queryKey: ['memory-categories'],
    queryFn: () => fetch('/api/agent-memory-facts?tab=categories').then(r => r.json()),
  });

  // Create / Update fact
  const saveFact = useMutation({
    mutationFn: async (data: { id?: number; key: string; value: string; category: string }) => {
      const method = data.id ? 'PATCH' : 'POST';
      const res = await fetch('/api/agent-memory-facts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory-facts'] });
      queryClient.invalidateQueries({ queryKey: ['memory-stats'] });
      queryClient.invalidateQueries({ queryKey: ['memory-categories'] });
      toast.success(editingFact ? 'Fact updated' : 'Fact created');
      setShowAddModal(false);
      setEditingFact(null);
      setFormData({ key: '', value: '', category: 'general' });
    },
    onError: () => toast.error('Failed to save fact'),
  });

  // Delete fact
  const deleteFact = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch('/api/agent-memory-facts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory-facts'] });
      queryClient.invalidateQueries({ queryKey: ['memory-stats'] });
      queryClient.invalidateQueries({ queryKey: ['memory-categories'] });
      toast.success('Fact deleted');
    },
    onError: () => toast.error('Failed to delete fact'),
  });

  const openEditModal = (fact: MemoryFact) => {
    setEditingFact(fact);
    setFormData({ key: fact.key, value: fact.value, category: fact.category });
    setShowAddModal(true);
  };

  const openAddModal = () => {
    setEditingFact(null);
    setFormData({ key: '', value: '', category: 'general' });
    setShowAddModal(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-[var(--text-primary)]">Memory Bank</h1>
          <p className="text-sm text-[var(--text-secondary)]">Structured insights and agent knowledge</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openAddModal}>Add Fact</Button>
      </div>

      {/* Tabs */}
      <FilterPills
        options={TABS.map(t => ({ value: t.id, label: t.label }))}
        value={activeTab}
        onChange={setActiveTab}
      />

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4 sm:space-y-6 stagger-children">
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {statsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)
            ) : (
              <>
                <Card className="flex items-center gap-3 sm:gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-error/10">
                    <Brain size={20} className="text-error" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{stats?.facts ?? 0}</p>
                    <p className="text-xs text-[var(--text-secondary)]">Facts</p>
                  </div>
                </Card>
                <Card className="flex items-center gap-3 sm:gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-accent)]">
                    <BookOpen size={20} className="text-[var(--text-accent)]" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{stats?.styles ?? 0}</p>
                    <p className="text-xs text-[var(--text-secondary)]">Style Patterns</p>
                  </div>
                </Card>
                <Card className="flex items-center gap-3 sm:gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-success/10">
                    <MessageSquare size={20} className="text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{stats?.conversations ?? 0}</p>
                    <p className="text-xs text-[var(--text-secondary)]">Conversations</p>
                  </div>
                </Card>
              </>
            )}
          </div>

          {/* Categories Breakdown */}
          <Card>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Categories Breakdown</h3>
            {categories.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)]">No facts stored yet</p>
            ) : (
              <div className="space-y-2">
                {categories.map(cat => (
                  <div key={cat.category} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant={categoryVariant[cat.category] || 'neutral'}>
                        {titleCase(cat.category)}
                      </Badge>
                    </div>
                    <span className="text-sm font-medium text-[var(--text-secondary)]">{cat.count}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Facts Tab */}
      {activeTab === 'facts' && (
        <div className="space-y-3 sm:space-y-4">
          {/* Search + Category Filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                placeholder="Search facts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 sm:h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-ground)] text-[var(--text-primary)] text-sm pl-9 pr-3 focus:outline-none focus:border-[var(--border-focus)]"
              />
            </div>
            <div className="overflow-x-auto scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0">
              <FilterPills
                options={CATEGORIES.map(c => ({ value: c, label: c === 'all' ? 'All' : titleCase(c) }))}
                value={activeCategory}
                onChange={setActiveCategory}
              />
            </div>
          </div>

          {factsLoading ? (
            <SkeletonList count={5} />
          ) : facts.length === 0 ? (
            <EmptyState
              icon={Brain}
              title="No facts stored"
              description="Add your first memory fact to help the agent remember important information."
            />
          ) : (
            <>
              {/* Desktop: Table view */}
              <div className="hidden sm:block">
                <Card padding={false}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border-default)]">
                          <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Key</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Value</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Category</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Updated</th>
                          <th className="w-20 px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {facts.map(fact => (
                          <tr key={fact.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                            <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{fact.key}</td>
                            <td className="px-4 py-3 text-[var(--text-secondary)] max-w-xs truncate">{fact.value}</td>
                            <td className="px-4 py-3">
                              <Badge variant={categoryVariant[fact.category] || 'neutral'} dot>
                                {titleCase(fact.category)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-[var(--text-tertiary)]">{timeAgo(fact.updated_at)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openEditModal(fact)}
                                  className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  onClick={() => deleteFact.mutate(fact.id)}
                                  className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--status-error-surface)] hover:text-error transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              {/* Mobile: Card view */}
              <div className="sm:hidden space-y-2 stagger-children">
                {facts.map(fact => (
                  <Card key={fact.id} className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{fact.key}</p>
                      <Badge variant={categoryVariant[fact.category] || 'neutral'}>
                        {titleCase(fact.category)}
                      </Badge>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">{fact.value}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-[var(--text-tertiary)]">{timeAgo(fact.updated_at)}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(fact)}
                          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => deleteFact.mutate(fact.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:text-error transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Style Tab */}
      {activeTab === 'style' && (
        <div className="space-y-3">
          {styles.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No style patterns"
              description="Style patterns help the agent match your communication preferences."
            />
          ) : (
            <div className="space-y-2 stagger-children">
              {styles.map(style => (
                <Card key={style.id} className="space-y-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{style.pattern}</p>
                  {style.example && (
                    <p className="text-sm text-[var(--text-secondary)] italic">&ldquo;{style.example}&rdquo;</p>
                  )}
                  {style.context && (
                    <p className="text-xs text-[var(--text-tertiary)]">{style.context}</p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <MemoryHistory />
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setEditingFact(null); }}
        title={editingFact ? 'Edit Fact' : 'Add New Fact'}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setShowAddModal(false); setEditingFact(null); }}>Cancel</Button>
            <Button
              loading={saveFact.isPending}
              onClick={() => saveFact.mutate({
                ...(editingFact ? { id: editingFact.id } : {}),
                key: formData.key,
                value: formData.value,
                category: formData.category,
              })}
              disabled={!formData.key.trim() || !formData.value.trim()}
            >
              {editingFact ? 'Update' : 'Create'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Key</label>
            <input
              value={formData.key}
              onChange={(e) => setFormData(d => ({ ...d, key: e.target.value }))}
              placeholder="e.g. birthday, dog_name, company"
              className="w-full h-10 sm:h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-ground)] text-[var(--text-primary)] text-sm px-3 focus:outline-none focus:border-[var(--border-focus)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Value</label>
            <textarea
              value={formData.value}
              onChange={(e) => setFormData(d => ({ ...d, value: e.target.value }))}
              placeholder="The value to remember..."
              rows={3}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-ground)] text-[var(--text-primary)] text-sm px-3 py-2 focus:outline-none focus:border-[var(--border-focus)] resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData(d => ({ ...d, category: e.target.value }))}
              className="w-full h-10 sm:h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-ground)] text-[var(--text-primary)] text-sm px-3 focus:outline-none focus:border-[var(--border-focus)]"
            >
              {CATEGORIES.filter(c => c !== 'all').map(c => (
                <option key={c} value={c}>{titleCase(c)}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Memory History sub-component
function MemoryHistory() {
  const { data: logs = [], isLoading } = useQuery<{ id: string; action: string; details: Record<string, unknown>; status: string; created_at: string }[]>({
    queryKey: ['agent-logs-memory'],
    queryFn: () => fetch('/api/agent-logs?action=memory').then(r => r.json()).catch(() => []),
  });

  if (isLoading) return <SkeletonList count={5} />;

  if (logs.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No memory history"
        description="Memory changes and access history will appear here."
      />
    );
  }

  return (
    <div className="space-y-2 stagger-children">
      {logs.map(log => (
        <Card key={log.id} className="flex items-center gap-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            log.status === 'success' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
          }`}>
            {log.status === 'success' ? <Check size={14} /> : <X size={14} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[var(--text-primary)]">{log.action}</p>
            <p className="text-xs text-[var(--text-tertiary)]">{timeAgo(log.created_at)}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
