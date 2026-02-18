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
  Mic,
  Square,
  Trash2,
  Pencil,
  Check,
  X,
  MoreVertical,
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Markdown Renderer ───────────────────────────────────────────────

function renderMarkdown(text: string): string {
  if (!text) return '';
  let html = text;

  // Escape HTML entities for safety
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const label = lang ? `<span class="chat-code-lang">${lang}</span>` : '';
    return `<div class="chat-code-block">${label}<pre><code>${code.trim()}</code></pre></div>`;
  });

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code class="chat-inline-code">$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4 class="chat-h4">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="chat-h3">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="chat-h2">$1</h2>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="chat-hr"/>');

  // Ordered lists
  html = html.replace(/(?:^|\n)((?:\d+\.\s+.+\n?)+)/g, (_m, block) => {
    const items = block.trim().split('\n')
      .map((l: string) => l.replace(/^\d+\.\s+/, '').trim())
      .filter(Boolean)
      .map((item: string) => `<li>${item}</li>`).join('');
    return `<ol class="chat-ol">${items}</ol>`;
  });

  // Unordered lists
  html = html.replace(/(?:^|\n)((?:[-*]\s+.+\n?)+)/g, (_m, block) => {
    const items = block.trim().split('\n')
      .map((l: string) => l.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean)
      .map((item: string) => `<li>${item}</li>`).join('');
    return `<ul class="chat-ul">${items}</ul>`;
  });

  // Blockquotes
  html = html.replace(/(?:^|\n)((?:&gt;\s?.+\n?)+)/g, (_m, block) => {
    const content = block.trim().split('\n')
      .map((l: string) => l.replace(/^&gt;\s?/, '')).join('<br/>');
    return `<blockquote class="chat-blockquote">${content}</blockquote>`;
  });

  // Double newlines → paragraph breaks
  html = html.replace(/\n\n+/g, '</p><p class="chat-p">');
  // Single newlines → line breaks
  html = html.replace(/\n/g, '<br/>');

  if (!/^<(h[2-4]|div|ol|ul|blockquote|hr|p)/.test(html)) {
    html = `<p class="chat-p">${html}</p>`;
  }

  return html;
}

// ─── Voice Recording Hook ─────────────────────────────────────────────

function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = stream;
      chunks.current = [];
      setAudioBlob(null);
      setDuration(0);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: mimeType });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorder.start(250);
      setIsRecording(true);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      toast.error('Microphone access denied. Allow mic permissions and try again.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') mediaRecorder.current.stop();
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') mediaRecorder.current.stop();
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    setIsRecording(false);
    setAudioBlob(null);
    setDuration(0);
    chunks.current = [];
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const clearAudio = useCallback(() => { setAudioBlob(null); setDuration(0); chunks.current = []; }, []);

  return { isRecording, duration, audioBlob, startRecording, stopRecording, cancelRecording, clearAudio };
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
            {isUser ? (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            ) : (
              <div
                className="chat-content break-words"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
              />
            )}
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
  onRename,
  onDelete,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    if (menuOpenId) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpenId]);

  const toggleMenu = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenId(menuOpenId === id ? null : id);
    setConfirmDeleteId(null);
    setEditingId(null);
  };

  const startEditing = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditValue(conv.title || 'New conversation');
    setMenuOpenId(null);
    setConfirmDeleteId(null);
  };

  const saveEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const cancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(null);
  };

  const handleDeleteClick = (id: string) => {
    setConfirmDeleteId(id);
    setMenuOpenId(null);
    setEditingId(null);
  };

  const confirmDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(id);
    setConfirmDeleteId(null);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
  };

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
            <div
              key={conv.id}
              onClick={() => { if (editingId !== conv.id) onSelect(conv.id); }}
              className={`relative w-full text-left px-4 py-3 border-b border-[var(--border-subtle)] transition-colors cursor-pointer ${
                activeId === conv.id
                  ? 'bg-[var(--surface-accent)] border-l-2 border-l-[var(--interactive-primary)]'
                  : 'hover:bg-[var(--surface-hover)]'
              }`}
            >
              {/* Confirm delete overlay */}
              {confirmDeleteId === conv.id && (
                <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-[var(--status-error-surface)] border border-error/30 rounded-sm px-3">
                  <p className="text-xs text-error font-medium">Delete?</p>
                  <button
                    onClick={(e) => confirmDelete(conv.id, e)}
                    className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] bg-error text-white hover:bg-error/90 transition-colors"
                    title="Confirm delete"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    onClick={cancelDelete}
                    className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-primary)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--surface-hover)] transition-colors"
                    title="Cancel"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {editingId === conv.id ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 text-sm rounded-[var(--radius-sm)] border border-[var(--border-focus)] bg-[var(--surface-ground)] text-[var(--text-primary)] px-2 py-1 focus:outline-none"
                  />
                  <button onClick={saveEdit} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-success hover:bg-[var(--surface-hover)] transition-colors" title="Save">
                    <Check size={13} />
                  </button>
                  <button onClick={cancelEdit} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors" title="Cancel">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate flex-1">
                      {conv.title || 'New conversation'}
                    </p>
                    {/* 3-dot menu button — always visible and tappable */}
                    <div className="relative shrink-0" ref={menuOpenId === conv.id ? menuRef : undefined}>
                      <button
                        onClick={(e) => toggleMenu(conv.id, e)}
                        className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                        title="Options"
                      >
                        <MoreVertical size={14} />
                      </button>
                      {menuOpenId === conv.id && (
                        <div className="absolute right-0 top-7 z-20 w-32 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-md)] py-1 animate-in fade-in slide-in-from-top-1 duration-100">
                          <button
                            onClick={(e) => { e.stopPropagation(); startEditing(conv); }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                          >
                            <Pencil size={12} /> Rename
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(conv.id); }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-error hover:bg-[var(--status-error-surface)] transition-colors"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {conv.last_message && (
                    <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
                      {conv.last_message}
                    </p>
                  )}
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                    {timeAgo(conv.updated_at)}
                  </p>
                </>
              )}
            </div>
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

function VoiceRecordingBar({
  duration,
  onStop,
  onCancel,
}: {
  duration: number;
  onStop: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-error/40 bg-[var(--status-error-surface)] px-4 py-2.5 animate-in fade-in">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-error" />
      </span>
      <span className="text-sm font-medium text-error tabular-nums">{formatDuration(duration)}</span>
      <div className="flex gap-0.5 items-end h-5 flex-1 max-w-[120px]">
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full bg-error/60"
            style={{
              height: `${6 + Math.random() * 14}px`,
              animation: `waveform 0.5s ease-in-out ${i * 0.03}s infinite alternate`,
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5 ml-auto">
        <button
          onClick={onCancel}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
          title="Cancel"
        >
          <Trash2 size={15} />
        </button>
        <button
          onClick={onStop}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-error text-white hover:bg-error/90 transition-colors"
          title="Stop recording"
        >
          <Square size={13} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}

function VoicePreviewBar({
  audioBlob,
  onSend,
  onDiscard,
  sending,
}: {
  audioBlob: Blob;
  onSend: () => void;
  onDiscard: () => void;
  sending: boolean;
}) {
  const audioUrl = URL.createObjectURL(audioBlob);
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-secondary)] px-4 py-2.5 animate-in fade-in">
      <Mic size={16} className="text-[var(--text-accent)] shrink-0" />
      <audio src={audioUrl} controls className="h-8 flex-1 min-w-0" style={{ maxHeight: '32px' }} />
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onDiscard}
          disabled={sending}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-40"
          title="Discard"
        >
          <Trash2 size={15} />
        </button>
        <button
          onClick={onSend}
          disabled={sending}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--interactive-primary)] text-white hover:bg-[var(--interactive-primary-hover)] transition-colors disabled:opacity-40"
          title="Send voice message"
        >
          {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
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
  const { isRecording, duration, audioBlob, startRecording, stopRecording, cancelRecording, clearAudio } = useVoiceRecorder();

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

  // Rename conversation
  const renameConversation = useCallback((id: string, title: string) => {
    fetch('/api/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title }),
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        toast.success('Chat renamed');
      })
      .catch(() => toast.error('Failed to rename chat'));
  }, [queryClient]);

  // Delete conversation
  const deleteConversation = useCallback((id: string) => {
    fetch('/api/chat', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        if (activeConversationId === id) {
          setActiveConversationId(null);
        }
        toast.success('Chat deleted');
      })
      .catch(() => toast.error('Failed to delete chat'));
  }, [queryClient, activeConversationId]);

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

  // Send voice message
  const sendVoiceMessage = useCallback(async () => {
    if (!audioBlob || !activeConversationId || isSending) return;

    setIsSending(true);

    // Optimistic: show transcribing placeholder
    queryClient.setQueryData<Message[]>(['chat-messages', activeConversationId], (old = []) => [
      ...old,
      {
        id: `temp-voice-${Date.now()}`,
        role: 'user' as const,
        content: '🎙️ Transcribing voice message...',
        action_type: null,
        action_data: null,
        related_task_id: null,
        related_call_id: null,
        created_at: new Date().toISOString(),
      },
    ]);

    clearAudio();

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'voice.webm');

      const response = await fetch(`/api/chat/${activeConversationId}/voice`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Voice send failed');
      }

      queryClient.invalidateQueries({ queryKey: ['chat-messages', activeConversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar-stats'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send voice message');
      queryClient.invalidateQueries({ queryKey: ['chat-messages', activeConversationId] });
    } finally {
      setIsSending(false);
    }
  }, [audioBlob, activeConversationId, isSending, queryClient, clearAudio]);

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
            onRename={renameConversation}
            onDelete={deleteConversation}
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
            {isRecording ? (
              <VoiceRecordingBar duration={duration} onStop={stopRecording} onCancel={cancelRecording} />
            ) : audioBlob ? (
              <VoicePreviewBar audioBlob={audioBlob} onSend={sendVoiceMessage} onDiscard={clearAudio} sending={isSending} />
            ) : (
              <>
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
                  {inputValue.trim() ? (
                    <button
                      onClick={sendMessage}
                      disabled={isSending}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--interactive-primary)] text-white hover:bg-[var(--interactive-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  ) : (
                    <button
                      onClick={startRecording}
                      disabled={isSending}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--surface-secondary)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Record voice message"
                    >
                      <Mic size={16} />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-1.5 px-1">
                  Press Enter to send, Shift+Enter for new line. Tap the mic to record a voice message.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
