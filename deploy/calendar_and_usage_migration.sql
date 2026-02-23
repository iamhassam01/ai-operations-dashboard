-- Google Calendar & API Usage Migration
-- Run this on the VPS database

-- API Usage tracking table
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service VARCHAR(50) NOT NULL,
  endpoint VARCHAR(200),
  method VARCHAR(10),
  model VARCHAR(100),
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  estimated_cost NUMERIC(10,6) DEFAULT 0,
  status_code INTEGER,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_service ON api_usage(service);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_service_created ON api_usage(service, created_at DESC);

-- Calendar events table already exists in schema.sql, ensure it's there
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

CREATE INDEX IF NOT EXISTS idx_calendar_events_time ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_google ON calendar_events(google_event_id);

-- Google Calendar OAuth settings (values will be populated by the app from environment variables)
INSERT INTO settings (key, value, description) VALUES
  ('google_client_id', '""', 'Google OAuth Client ID — set via env GOOGLE_CLIENT_ID'),
  ('google_client_secret', '""', 'Google OAuth Client Secret — set via env GOOGLE_CLIENT_SECRET'),
  ('google_calendar_connected', 'false', 'Whether Google Calendar is connected'),
  ('google_calendar_email', '""', 'Connected Google Calendar email')
ON CONFLICT (key) DO NOTHING;

-- Grant permissions
GRANT ALL PRIVILEGES ON api_usage TO openclaw_user;
