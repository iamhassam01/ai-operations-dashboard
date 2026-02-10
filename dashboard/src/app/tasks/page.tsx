'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, X, ChevronRight, ListTodo, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { StatusDot } from '@/components/ui/Badge';
import { FilterPills } from '@/components/ui/FilterPills';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { TaskDetailDrawer } from '@/components/dashboard/TaskDetailDrawer';
import { useSearchParams, useRouter } from 'next/navigation';

function titleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface Task {
  id: string;
  type: string;
  priority: string;
  title: string;
  description: string;
  contact_name: string;
  contact_phone: string;
  status: string;
  created_at: string;
}

const statusBadgeVariant: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info'> = {
  new: 'info',
  pending_approval: 'warning',
  approved: 'success',
  in_progress: 'accent',
  completed: 'neutral',
  cancelled: 'error',
  escalated: 'error',
  pending_user_input: 'warning',
  scheduled: 'info',
  closed: 'neutral',
};

const priorityDotColor: Record<string, 'error' | 'warning' | 'accent' | 'neutral'> = {
  urgent: 'error',
  high: 'warning',
  medium: 'accent',
  low: 'neutral',
};

const filterOptions = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'pending_approval', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'approved', label: 'Approved' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'pending_user_input', label: 'Needs Input' },
  { value: 'completed', label: 'Completed' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'closed', label: 'Closed' },
];

export default function TasksPage() {
  return (
    <Suspense fallback={<SkeletonList count={5} />}>
      <TasksPageInner />
    </Suspense>
  );
}

function TasksPageInner() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState(searchParams.get('status') || 'all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [focusIndex, setFocusIndex] = useState(-1);
  const selectedTaskId = searchParams.get('task') || null;

  // Debounce search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Persist filter to URL
  const handleFilterChange = (value: string) => {
    setFilter(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') params.delete('status');
    else params.set('status', value);
    router.push(`/tasks?${params.toString()}`, { scroll: false });
  };

  const handleTaskClick = (taskId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('task', taskId);
    router.push(`/tasks?${params.toString()}`, { scroll: false });
  };

  const handleDrawerClose = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('task');
    router.push(`/tasks?${params.toString()}`, { scroll: false });
  };

  const { data: tasks, isLoading, isError } = useQuery<Task[]>({
    queryKey: ['tasks', filter],
    queryFn: () => {
      const url = filter === 'all' ? '/api/tasks' : `/api/tasks?status=${filter}`;
      return fetch(url).then((r) => r.json());
    },
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, string>) =>
      fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) throw new Error('Failed to create task');
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setShowCreate(false);
      toast.success('Task created successfully');
    },
    onError: () => {
      toast.error('Failed to create task');
    },
  });

  const filteredTasks = tasks?.filter(
    (t) =>
      !debouncedSearch ||
      t.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      t.contact_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      t.description?.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  // Keyboard navigation for task list
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!filteredTasks || filteredTasks.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((prev) => Math.min(prev + 1, filteredTasks.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && focusIndex >= 0 && focusIndex < filteredTasks.length) {
        e.preventDefault();
        handleTaskClick(filteredTasks[focusIndex].id);
      } else if (e.key === 'Escape') {
        setFocusIndex(-1);
      }
    },
    [filteredTasks, focusIndex, handleTaskClick]
  );

  // Reset focus index on filter/search change
  useEffect(() => {
    setFocusIndex(-1);
  }, [filter, debouncedSearch]);

  // Build filter options with counts
  const filterOptionsWithCounts = filterOptions.map((opt) => ({
    ...opt,
    count:
      opt.value === 'all'
        ? tasks?.length
        : tasks?.filter((t) => t.status === opt.value).length,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="font-bold text-[var(--text-primary)]"
            style={{ fontSize: 'var(--text-heading)' }}
          >
            Tasks
          </h1>
          <p
            className="mt-0.5 text-[var(--text-secondary)]"
            style={{ fontSize: 'var(--text-body-small)' }}
          >
            Manage and track all tasks
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          <span className="hidden sm:inline">Create Task</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* Filters + Search */}
      <div className="space-y-3">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-placeholder)]"
            size={16}
          />
          <input
            type="text"
            placeholder="Search tasks..."
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

        <FilterPills
          options={filterOptionsWithCounts}
          value={filter}
          onChange={handleFilterChange}
        />
      </div>

      {/* Task List */}
      <div
        className="space-y-2 stagger-children"
        role="listbox"
        aria-label="Task list"
        tabIndex={0}
        onKeyDown={handleListKeyDown}
      >
        {isLoading && <SkeletonList count={5} />}

        {isError && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--status-error-surface)] p-6 flex flex-col items-center gap-2 text-center">
            <AlertTriangle size={24} className="text-[var(--interactive-destructive)]" />
            <p className="font-medium text-[var(--text-primary)]" style={{ fontSize: 'var(--text-body-small)' }}>
              Unable to load tasks
            </p>
            <p className="text-[var(--text-secondary)]" style={{ fontSize: 'var(--text-caption)' }}>
              Check your connection. Data will refresh automatically.
            </p>
          </div>
        )}

        {!isLoading && !isError && filteredTasks?.map((task, index) => (
          <button
            key={task.id}
            onClick={() => handleTaskClick(task.id)}
            role="option"
            aria-selected={selectedTaskId === task.id}
            className={`w-full text-left rounded-[var(--radius-lg)] border bg-[var(--surface-primary)] p-4 transition-all duration-[var(--duration-fast)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-hover)] hover:shadow-sm cursor-pointer ${
              focusIndex === index
                ? 'border-[var(--border-focus)] ring-2 ring-[var(--border-focus)]/30 bg-[var(--surface-hover)]'
                : selectedTaskId === task.id
                ? 'border-[var(--border-accent)] bg-[var(--surface-accent)]'
                : 'border-[var(--border-default)]'
            }`}
          >
            <div className="flex items-start gap-3">
              <StatusDot
                color={priorityDotColor[task.priority] || 'neutral'}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start sm:items-center gap-2 flex-col sm:flex-row">
                  <h3
                    className="font-semibold text-[var(--text-primary)] line-clamp-2 sm:truncate"
                    style={{ fontSize: 'var(--text-body)' }}
                  >
                    {task.title}
                  </h3>
                  <Badge variant={statusBadgeVariant[task.status] || 'neutral'}>
                    {titleCase(task.status)}
                  </Badge>
                </div>
                {task.description && (
                  <p
                    className="mt-0.5 text-[var(--text-secondary)] line-clamp-1"
                    style={{ fontSize: 'var(--text-body-small)' }}
                  >
                    {task.description}
                  </p>
                )}
                <div
                  className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--text-tertiary)]"
                  style={{ fontSize: 'var(--text-caption)' }}
                >
                  <span>{task.type}</span>
                  <span>{task.priority}</span>
                  {task.contact_name && <span>{task.contact_name}</span>}
                  <span>{timeAgo(task.created_at)}</span>
                </div>
              </div>
              <ChevronRight size={16} className="shrink-0 mt-1 text-[var(--text-tertiary)]" />
            </div>
          </button>
        ))}

        {!isLoading && !isError && (!filteredTasks || filteredTasks.length === 0) && (
          <EmptyState
            icon={ListTodo}
            title="No tasks found"
            description={search ? 'Try adjusting your search or filters' : 'Create your first task to get started'}
            action={
              !search ? (
                <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
                  <Plus size={14} />
                  Create Task
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      {/* Task Detail Drawer */}
      {selectedTaskId && (
        <TaskDetailDrawer taskId={selectedTaskId} onClose={handleDrawerClose} />
      )}

      {/* Create Task Modal */}
      {showCreate && (
        <CreateTaskModal
          onClose={() => setShowCreate(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
        />
      )}
    </div>
  );
}

function CreateTaskModal({
  onClose,
  onSubmit,
  isSubmitting,
}: {
  onClose: () => void;
  onSubmit: (data: Record<string, string>) => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState({
    type: 'inquiry',
    title: '',
    description: '',
    priority: 'medium',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    address: '',
    preferred_time_1: '',
    preferred_time_2: '',
    constraints: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const update = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal
      open
      onClose={onClose}
      title="Create New Task"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
            loading={isSubmitting}
            loadingText="Creating..."
            disabled={!form.title}
          >
            Create Task
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Type"
            required
            value={form.type}
            onChange={(e) => update('type', e.target.value)}
            options={[
              { value: 'call', label: 'Call' },
              { value: 'booking', label: 'Booking' },
              { value: 'follow_up', label: 'Follow Up' },
              { value: 'cancellation', label: 'Cancellation' },
              { value: 'inquiry', label: 'Inquiry' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <Select
            label="Priority"
            value={form.priority}
            onChange={(e) => update('priority', e.target.value)}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' },
            ]}
          />
        </div>

        <Input
          label="Title"
          required
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          placeholder="Task title..."
        />

        <Textarea
          label="Description"
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="Task description..."
          rows={3}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Contact Name"
            value={form.contact_name}
            onChange={(e) => update('contact_name', e.target.value)}
          />
          <Input
            label="Phone"
            value={form.contact_phone}
            onChange={(e) => update('contact_phone', e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={form.contact_email}
            onChange={(e) => update('contact_email', e.target.value)}
          />
        </div>

        {/* G1: Address field */}
        <Input
          label="Address"
          value={form.address}
          onChange={(e) => update('address', e.target.value)}
          placeholder="e.g., 123 Main St, Prague 1"
        />

        {/* G2: Preferred Time Windows */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Preferred Time 1"
            type="datetime-local"
            value={form.preferred_time_1}
            onChange={(e) => update('preferred_time_1', e.target.value)}
          />
          <Input
            label="Preferred Time 2"
            type="datetime-local"
            value={form.preferred_time_2}
            onChange={(e) => update('preferred_time_2', e.target.value)}
          />
        </div>

        <Input
          label="Constraints"
          value={form.constraints}
          onChange={(e) => update('constraints', e.target.value)}
          placeholder="e.g., Must be completed before Friday"
        />
      </form>
    </Modal>
  );
}
