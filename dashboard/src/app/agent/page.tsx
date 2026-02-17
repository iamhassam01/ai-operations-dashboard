'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Plus,
  MessageSquare,
  Bot,
  User,
  CheckCircle2,
  XCircle,
  Phone,
  ListTodo,
  Clock,
  Brain,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'action' | 'system';
  content: string;
  action_type: string | null;
  action_data: ActionResult[] | null;
  related_task_id: string | null;
  related_call_id: string | null;
  created_at: string;
}

interface ActionResult {
  action_type: string;
  success: boolean;
  data?: { task_id?: string; title?: string; approval_id?: string };
  error?: string;
}

interface Conversation {
  id: string;
  title: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_message: string | null;
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

const actionIcons: Record<string, typeof CheckCircle2> = {
  task_created: ListTodo,
  approval_requested: Clock,
  memory_stored: Brain,
  task_updated: CheckCircle2,
  call_initiated: Phone,
};

const actionLabels: Record<string, string> = {
  task_created: 'Task created',
  approval_requested: 'Approval requested',
  memory_stored: 'Memory saved',
  task_updated: 'Task updated',
  call_initiated: 'Call started',
};

function ActionCard({ result }: { result: ActionResult }) {
  const Icon = actionIcons[result.action_type] || CheckCircle2;
  const label = actionLabels[result.action_type] || result.action_type;

  return (
    <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-secondary)] px-3 py-2 mt-2">
      <div className={`mt-0.5 ${result.success ? 'text-success' : 'text-error'}`}>
        {result.success ? <Icon size={15} /> : <XCircle size={15} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[var(--text-primary)]">{label}</p>
        {result.data?.title && (
          <p className="text-xs text-[var(--text-secondary)] truncate">{result.data.title}</p>
        )}
        {result.error && (
          <p className="text-xs text-error">{result.error}</p>
        )}
      </div>
      {result.success && (
        <Badge variant="success" dot>Done</Badge>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === 'action') {
    let parsedData: ActionResult | null = null;
    try {
      const raw = message.action_data;
      if (raw && Array.isArray(raw) && raw.length > 0) {
        parsedData = raw[0];
      } else if (raw && !Array.isArray(raw)) {
        parsedData = raw as unknown as ActionResult;
      }
    } catch {
      // not parseable
    }

    if (!parsedData) return null;

    return (
      <div className="flex justify-start px-4 py-1">
        <div className="max-w-[85%] md:max-w-[70%]">
          <ActionCard result={parsedData} />
        </div>
      </div>
    );
  }

  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-4 py-1.5`}>
      <div className={`flex items-start gap-2.5 max-w-[85%] md:max-w-[70%] ${isUser ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5 ${
          isUser
            ? 'bg-[var(--interactive-primary)] text-white'
            : 'bg-[var(--surface-accent)] text-[var(--text-accent)]'
        }`}>
          {isUser ? <User size={14} /> : <Bot size={14} />}
        </div>

        {/* Content */}
        <div className={`space-y-1 ${isUser ? 'items-end' : 'items-start'}`}>
          <div className={`rounded-[var(--radius-lg)] px-3.5 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-[var(--interactive-primary)] text-white rounded-br-[var(--radius-sm)]'
              : 'bg-[var(--surface-secondary)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-bl-[var(--radius-sm)]'
          }`}>
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </div>

          {/* Action results */}
          {message.action_data && Array.isArray(message.action_data) && message.action_data.length > 0 && (
            <div className="space-y-1.5">
              {message.action_data.map((result: ActionResult, i: number) => (
                <ActionCard key={i} result={result} />
              ))}
            </div>
          )}

          <p className={`text-[10px] text-[var(--text-tertiary)] px-1 ${isUser ? 'text-right' : ''}`}>
            {timeAgo(message.created_at)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex h-full flex-col border-r border-[var(--border-default)] bg-[var(--surface-primary)]">
      <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conversations</h2>
        <button
          onClick={onNew}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          title="New conversation"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {conversations.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[var(--text-tertiary)]">
            No conversations yet
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`w-full text-left px-4 py-3 border-b border-[var(--border-subtle)] transition-colors ${
                activeId === conv.id
                  ? 'bg-[var(--surface-accent)] border-l-2 border-l-[var(--interactive-primary)]'
                  : 'hover:bg-[var(--surface-hover)]'
              }`}
            >
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                {conv.title || 'New conversation'}
              </p>
              {conv.last_message && (
                <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
                  {conv.last_message}
                </p>
              )}
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                {timeAgo(conv.updated_at)}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start px-4 py-1.5">
      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5 bg-[var(--surface-accent)] text-[var(--text-accent)]">
          <Bot size={14} />
        </div>
        <div className="rounded-[var(--radius-lg)] rounded-bl-[var(--radius-sm)] bg-[var(--surface-secondary)] border border-[var(--border-subtle)] px-4 py-3">
          <div className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)] animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)] animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)] animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgentChatPage() {
  const queryClient = useQueryClient();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch conversations
  const { data: conversations = [], isLoading: loadingConvos } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: () => fetch('/api/chat').then((r) => r.json()),
    refetchInterval: 10000,
  });

  // Fetch messages for active conversation
  const { data: messages = [], isLoading: loadingMessages } = useQuery<Message[]>({
    queryKey: ['chat-messages', activeConversationId],
    queryFn: () =>
      activeConversationId
        ? fetch(`/api/chat/${activeConversationId}/messages`).then((r) => r.json())
        : Promise.resolve([]),
    enabled: !!activeConversationId,
    refetchInterval: 5000,
  });

  // Create new conversation
  const createConversation = useMutation({
    mutationFn: () => fetch('/api/chat', { method: 'POST' }).then((r) => r.json()),
    onSuccess: (data: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setActiveConversationId(data.id);
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    onError: () => toast.error('Could not start a new conversation'),
  });

  // Send message
  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || !activeConversationId || isSending) return;

    const text = inputValue.trim();
    setInputValue('');
    setIsSending(true);

    // Optimistic update — add user message immediately
    queryClient.setQueryData<Message[]>(['chat-messages', activeConversationId], (old = []) => [
      ...old,
      {
        id: `temp-${Date.now()}`,
        role: 'user' as const,
        content: text,
        action_type: null,
        action_data: null,
        related_task_id: null,
        related_call_id: null,
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const response = await fetch(`/api/chat/${activeConversationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        throw new Error('Send failed');
      }

      // Refetch to get the actual saved messages
      queryClient.invalidateQueries({ queryKey: ['chat-messages', activeConversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      // Also refresh sidebar stats since actions may have created tasks/approvals
      queryClient.invalidateQueries({ queryKey: ['sidebar-stats'] });
    } catch {
      toast.error('Failed to send message');
      // Remove optimistic message
      queryClient.invalidateQueries({ queryKey: ['chat-messages', activeConversationId] });
    } finally {
      setIsSending(false);
    }
  }, [inputValue, activeConversationId, isSending, queryClient]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Auto-select the most recent conversation on load, or create one
  useEffect(() => {
    if (!activeConversationId && conversations.length > 0 && !loadingConvos) {
      setActiveConversationId(conversations[0].id);
    }
  }, [conversations, activeConversationId, loadingConvos]);

  // Keyboard handler for textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Auto-resize textarea
  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  return (
    <div className="flex h-[calc(100vh-73px)] -m-4 md:-m-6">
      {/* Conversation sidebar — desktop */}
      <div className={`hidden md:block transition-all duration-200 ${showSidebar ? 'w-72' : 'w-0 overflow-hidden'}`}>
        {showSidebar && (
          <ConversationList
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={setActiveConversationId}
            onNew={() => createConversation.mutate()}
          />
        )}
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col bg-[var(--surface-ground)]">
        {/* Chat header */}
        <div className="flex items-center gap-3 border-b border-[var(--border-default)] bg-[var(--surface-primary)] px-4 py-2.5">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="hidden md:flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <ChevronRight size={16} className={`transition-transform ${showSidebar ? 'rotate-180' : ''}`} />
          </button>

          {/* Mobile conversation picker */}
          <button
            onClick={() => {
              // On mobile, cycle through creating new or show a simple dropdown
              if (conversations.length === 0) {
                createConversation.mutate();
              } else {
                // Toggle between conversations on mobile
                const currentIdx = conversations.findIndex((c) => c.id === activeConversationId);
                const nextIdx = (currentIdx + 1) % conversations.length;
                setActiveConversationId(conversations[nextIdx].id);
              }
            }}
            className="md:hidden flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          >
            <MessageSquare size={16} />
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-accent)]">
              <Bot size={16} className="text-[var(--text-accent)]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">Bob</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">AI Operations Agent</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={15} />}
            onClick={() => createConversation.mutate()}
            className="md:hidden"
          >
            New
          </Button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto scrollbar-hide py-4">
          {!activeConversationId ? (
            <EmptyState
              icon={MessageSquare}
              title="Start a conversation"
              description="Talk to Bob, your AI operations agent. He can create tasks, make calls, do research, and manage your operations."
            />
          ) : loadingMessages ? (
            <div className="flex justify-center py-12">
              <Spinner size={24} />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-accent)] mb-4">
                <Bot size={28} className="text-[var(--text-accent)]" />
              </div>
              <p className="text-base font-medium text-[var(--text-primary)] mb-1">Hi, I'm Bob</p>
              <p className="text-sm text-[var(--text-secondary)] max-w-md">
                I can help you manage tasks, make calls, book services, and handle your day-to-day operations.
                Everything I do needs your approval first. What can I help with?
              </p>
              <div className="flex flex-wrap gap-2 mt-6 justify-center">
                {[
                  'Order food delivery',
                  'Find a plumber',
                  'Book a hotel',
                  'Check my tasks',
                  'What are you working on?',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInputValue(suggestion);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    className="rounded-full border border-[var(--border-default)] bg-[var(--surface-primary)] px-3.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {isSending && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input area */}
        {activeConversationId && (
          <div className="border-t border-[var(--border-default)] bg-[var(--surface-primary)] px-4 py-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={handleTextareaInput}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Bob..."
                  rows={1}
                  disabled={isSending}
                  className="w-full resize-none rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-ground)] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] text-sm px-4 py-2.5 pr-10 focus:outline-none focus:border-[var(--border-focus)] focus:shadow-[var(--shadow-focus)] transition-colors disabled:opacity-50 max-h-40 scrollbar-hide"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!inputValue.trim() || isSending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--interactive-primary)] text-white hover:bg-[var(--interactive-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1.5 px-1">
              Press Enter to send, Shift+Enter for new line. Bob will ask for your approval before taking actions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
