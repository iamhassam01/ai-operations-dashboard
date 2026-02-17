-- Chat feature migration
-- Adds conversations and messages tables for agent chat

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  title TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'action')),
  content TEXT NOT NULL,
  action_type TEXT CHECK (action_type IN ('task_created', 'call_initiated', 'research_started', 'approval_requested', 'approval_result', 'call_completed', 'info_gathered', 'error', 'clarification')),
  action_data JSONB,
  related_task_id UUID REFERENCES tasks(id),
  related_call_id UUID REFERENCES calls(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memory table for long-term user context
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  category TEXT NOT NULL CHECK (category IN ('preference', 'fact', 'context', 'instruction')),
  content TEXT NOT NULL,
  source_message_id UUID REFERENCES messages(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_active ON conversations(is_active, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_user ON agent_memory(user_id, category);

GRANT ALL PRIVILEGES ON TABLE conversations TO openclaw_user;
GRANT ALL PRIVILEGES ON TABLE messages TO openclaw_user;
GRANT ALL PRIVILEGES ON TABLE agent_memory TO openclaw_user;
