-- AI Operations Agent - Database Schema
-- PostgreSQL 17 on Hostinger VPS
-- Uses gen_random_uuid() (native PG17, no extension needed)

-- Enable trigram extension for text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
  password_hash TEXT,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('call', 'booking', 'follow_up', 'cancellation', 'inquiry', 'other')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  title TEXT NOT NULL,
  description TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address TEXT,
  preferred_time_1 TIMESTAMPTZ,
  preferred_time_2 TIMESTAMPTZ,
  constraints TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'pending_approval', 'approved', 'in_progress', 'completed', 'cancelled', 'escalated', 'pending_user_input', 'scheduled', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id)
);

-- Calls Table
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id),
  openclaw_call_id TEXT UNIQUE,
  twilio_call_sid TEXT,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  phone_number TEXT NOT NULL,
  caller_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'no_answer')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  recording_url TEXT,
  transcript TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call Logs (for detailed event tracking)
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES calls(id),
  event_type TEXT NOT NULL,
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Approvals Table
CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id),
  call_id UUID REFERENCES calls(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('make_call', 'book', 'cancel', 'reschedule')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts Table (for caller identification)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  company TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar Events Table
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id),
  google_event_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  attendees JSONB,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('approval_required', 'call_completed', 'task_update', 'system', 'error')),
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  related_task_id UUID REFERENCES tasks(id),
  related_call_id UUID REFERENCES calls(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Activity Log
CREATE TABLE IF NOT EXISTS agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  details JSONB,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failure', 'pending')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings Table (key-value store for app config)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_direction ON calls(direction);
CREATE INDEX IF NOT EXISTS idx_calls_phone ON calls(phone_number);
CREATE INDEX IF NOT EXISTS idx_calls_created ON calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON agent_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_calendar_events_time ON calendar_events(start_time);

-- Insert default settings
INSERT INTO settings (key, value, description) VALUES
  ('business_name', '"Home"', 'Business/brand name'),
  ('agent_name', '"Bob"', 'AI agent display name'),
  ('agent_identity', '"Bob"', 'Name the agent introduces itself as on calls'),
  ('primary_email', '"ivankorn.assistant@gmail.com"', 'Primary email for calendar and notifications'),
  ('cc_email', '"ivan.korn@insead.edu"', 'CC email for all notifications'),
  ('inbound_phone_country', '"CZ"', 'Country for inbound phone number'),
  ('outbound_enabled', 'true', 'Whether outbound calling is permitted'),
  ('approval_required', 'true', 'Whether human approval is needed before actions'),
  ('do_not_disturb', 'false', 'DND mode - suppress non-critical notifications')
ON CONFLICT (key) DO NOTHING;

-- Insert default users
INSERT INTO users (email, name, role) VALUES
  ('ivankorn.assistant@gmail.com', 'Ivan', 'admin'),
  ('nikita@test.local', 'Nikita', 'user')
ON CONFLICT (email) DO NOTHING;

-- Grant permissions to openclaw_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO openclaw_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO openclaw_user;
GRANT USAGE ON SCHEMA public TO openclaw_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO openclaw_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO openclaw_user;
