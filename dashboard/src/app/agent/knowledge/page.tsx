'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, FolderOpen, Plus, Search, Pencil, Trash2, FileText, Layers, Tag, ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FilterPills } from '@/components/ui/FilterPills';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';

interface Collection {
  id: number;
  name: string;
  description: string | null;
  icon: string;
  created_at: string;
  categories_count: string;
  entries_count: string;
}

interface KnowledgeEntry {
  id: number;
  collection_id: number;
  category: string;
  title: string;
  content: string;
  collection_name: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

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

export default function KnowledgeLibraryPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showAddCollection, setShowAddCollection] = useState(false);
  const [entryForm, setEntryForm] = useState({ collection_id: 0, category: 'general', title: '', content: '' });
  const [collectionForm, setCollectionForm] = useState({ name: '', description: '' });

  // Fetch collections
  const { data: collections = [], isLoading: collectionsLoading } = useQuery<Collection[]>({
    queryKey: ['knowledge-collections'],
    queryFn: () => fetch('/api/knowledge').then(r => r.json()),
  });

  // Fetch entries
  const { data: entries = [], isLoading: entriesLoading } = useQuery<KnowledgeEntry[]>({
    queryKey: ['knowledge-entries', selectedCollectionId, searchQuery],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedCollectionId) params.set('collection_id', String(selectedCollectionId));
      if (searchQuery) params.set('search', searchQuery);
      return fetch(`/api/knowledge/entries?${params}`).then(r => r.json());
    },
    enabled: activeTab === 'browse',
  });

  // Fetch recent entries
  const { data: recentEntries = [] } = useQuery<KnowledgeEntry[]>({
    queryKey: ['knowledge-recent'],
    queryFn: () => fetch('/api/knowledge/entries?recent=5').then(r => r.json()),
    enabled: activeTab === 'overview',
  });

  // Summary stats
  const totalCollections = collections.length;
  const totalCategories = collections.reduce((sum, c) => sum + parseInt(c.categories_count || '0'), 0);
  const totalEntries = collections.reduce((sum, c) => sum + parseInt(c.entries_count || '0'), 0);

  // Create collection
  const createCollection = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-collections'] });
      toast.success('Collection created');
      setShowAddCollection(false);
      setCollectionForm({ name: '', description: '' });
    },
    onError: () => toast.error('Failed to create collection'),
  });

  // Create entry
  const createEntry = useMutation({
    mutationFn: async (data: typeof entryForm) => {
      const res = await fetch('/api/knowledge/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-entries'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-collections'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-recent'] });
      toast.success('Entry created');
      setShowAddEntry(false);
      setEntryForm({ collection_id: 0, category: 'general', title: '', content: '' });
    },
    onError: () => toast.error('Failed to create entry'),
  });

  // Delete entry
  const deleteEntry = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch('/api/knowledge/entries', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-entries'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-collections'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-recent'] });
      toast.success('Entry deleted');
    },
    onError: () => toast.error('Failed to delete entry'),
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-[var(--text-primary)]">Knowledge Library</h1>
          <p className="text-sm text-[var(--text-secondary)]">Curated collections of knowledge</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<FolderOpen size={16} />} onClick={() => setShowAddCollection(true)}>
            New Collection
          </Button>
          <Button icon={<Plus size={16} />} onClick={() => { setEntryForm(f => ({ ...f, collection_id: collections[0]?.id ?? 0 })); setShowAddEntry(true); }}>
            Add Entry
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <FilterPills
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'browse', label: 'Browse' },
        ]}
        value={activeTab}
        onChange={(v) => { setActiveTab(v); setSelectedCollectionId(null); setSearchQuery(''); }}
      />

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4 sm:space-y-6 stagger-children">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <Card className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-accent)]">
                <Layers size={20} className="text-[var(--text-accent)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{totalCollections}</p>
                <p className="text-xs text-[var(--text-secondary)]">Collections</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-success/10">
                <Tag size={20} className="text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{totalCategories}</p>
                <p className="text-xs text-[var(--text-secondary)]">Categories</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-warning/10">
                <FileText size={20} className="text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{totalEntries}</p>
                <p className="text-xs text-[var(--text-secondary)]">Entries</p>
              </div>
            </Card>
          </div>

          {/* Collections Breakdown + Recent Entries */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Collections Table */}
            <div className="lg:col-span-2">
              <Card>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Collections Breakdown</h3>
                {collectionsLoading ? (
                  <SkeletonList count={4} />
                ) : collections.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)]">No collections yet</p>
                ) : (
                  <div className="space-y-0 divide-y divide-[var(--border-subtle)]">
                    {collections.map(col => (
                      <button
                        key={col.id}
                        onClick={() => { setActiveTab('browse'); setSelectedCollectionId(col.id); }}
                        className="flex items-center justify-between w-full py-3 px-1 text-left hover:bg-[var(--surface-hover)] rounded-[var(--radius-sm)] transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FolderOpen size={16} className="text-[var(--text-accent)] shrink-0" />
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate">{col.name}</span>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 text-xs text-[var(--text-tertiary)]">
                          <span>{col.categories_count} categories</span>
                          <span>{col.entries_count} entries</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Recent Entries */}
            <Card>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Recent Entries</h3>
              {recentEntries.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)]">No entries yet</p>
              ) : (
                <div className="space-y-2">
                  {recentEntries.map(entry => (
                    <div key={entry.id} className="py-2 border-b border-[var(--border-subtle)] last:border-b-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{entry.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[var(--text-tertiary)]">{entry.collection_name}</span>
                        <span className="text-[var(--text-tertiary)]">&middot;</span>
                        <span className="text-xs text-[var(--text-tertiary)]">{titleCase(entry.category)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Browse Tab */}
      {activeTab === 'browse' && (
        <div className="space-y-3 sm:space-y-4">
          {/* Collection Filter + Search */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {selectedCollectionId && (
              <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => setSelectedCollectionId(null)}>
                All
              </Button>
            )}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                placeholder="Search entries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 sm:h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-ground)] text-[var(--text-primary)] text-sm pl-9 pr-3 focus:outline-none focus:border-[var(--border-focus)]"
              />
            </div>
            {!selectedCollectionId && (
              <div className="overflow-x-auto scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0">
                <FilterPills
                  options={[
                    { value: 'all', label: 'All' },
                    ...collections.map(c => ({ value: String(c.id), label: c.name })),
                  ]}
                  value={selectedCollectionId ? String(selectedCollectionId) : 'all'}
                  onChange={(v) => setSelectedCollectionId(v === 'all' ? null : parseInt(v))}
                />
              </div>
            )}
          </div>

          {/* Entries List */}
          {entriesLoading ? (
            <SkeletonList count={5} />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No entries found"
              description={searchQuery ? 'Try a different search term' : 'Add entries to your collections to build your knowledge base.'}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger-children">
              {entries.map(entry => (
                <Card key={entry.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1">{entry.title}</p>
                    <button
                      onClick={() => deleteEntry.mutate(entry.id)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:text-error transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] line-clamp-3">{entry.content}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant="neutral">{entry.collection_name}</Badge>
                    <Badge variant="info">{titleCase(entry.category)}</Badge>
                    <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">{timeAgo(entry.updated_at)}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Collection Modal */}
      <Modal
        open={showAddCollection}
        onClose={() => setShowAddCollection(false)}
        title="New Collection"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowAddCollection(false)}>Cancel</Button>
            <Button
              loading={createCollection.isPending}
              onClick={() => createCollection.mutate(collectionForm)}
              disabled={!collectionForm.name.trim()}
            >
              Create
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Name</label>
            <input
              value={collectionForm.name}
              onChange={(e) => setCollectionForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Collection name..."
              className="w-full h-10 sm:h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-ground)] text-[var(--text-primary)] text-sm px-3 focus:outline-none focus:border-[var(--border-focus)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Description</label>
            <textarea
              value={collectionForm.description}
              onChange={(e) => setCollectionForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional description..."
              rows={2}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-ground)] text-[var(--text-primary)] text-sm px-3 py-2 focus:outline-none focus:border-[var(--border-focus)] resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* Add Entry Modal */}
      <Modal
        open={showAddEntry}
        onClose={() => setShowAddEntry(false)}
        title="Add Knowledge Entry"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowAddEntry(false)}>Cancel</Button>
            <Button
              loading={createEntry.isPending}
              onClick={() => createEntry.mutate(entryForm)}
              disabled={!entryForm.title.trim() || !entryForm.content.trim() || !entryForm.collection_id}
            >
              Create
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Collection</label>
            <select
              value={entryForm.collection_id}
              onChange={(e) => setEntryForm(f => ({ ...f, collection_id: parseInt(e.target.value) }))}
              className="w-full h-10 sm:h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-ground)] text-[var(--text-primary)] text-sm px-3 focus:outline-none focus:border-[var(--border-focus)]"
            >
              <option value={0}>Select collection...</option>
              {collections.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Category</label>
            <input
              value={entryForm.category}
              onChange={(e) => setEntryForm(f => ({ ...f, category: e.target.value }))}
              placeholder="e.g. scripts, procedures, reference"
              className="w-full h-10 sm:h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-ground)] text-[var(--text-primary)] text-sm px-3 focus:outline-none focus:border-[var(--border-focus)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Title</label>
            <input
              value={entryForm.title}
              onChange={(e) => setEntryForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Entry title..."
              className="w-full h-10 sm:h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-ground)] text-[var(--text-primary)] text-sm px-3 focus:outline-none focus:border-[var(--border-focus)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Content</label>
            <textarea
              value={entryForm.content}
              onChange={(e) => setEntryForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Knowledge content..."
              rows={4}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-ground)] text-[var(--text-primary)] text-sm px-3 py-2 focus:outline-none focus:border-[var(--border-focus)] resize-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
