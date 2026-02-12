-- Seed initial data for the AI Operations Dashboard (v2 - fixed for actual schema)
-- This populates the dashboard with initial activity so it doesn't look empty

-- Notifications (is_read not read, no user_id required)
INSERT INTO notifications (type, title, message, is_read) VALUES
  ('system', 'System Online', 'AI Operations Agent dashboard is now live and monitoring.', false),
  ('system', 'OpenClaw Gateway Active', 'Gateway is running and accepting connections on port 18789.', false);

-- Settings: value column is JSONB, so values must be valid JSON
INSERT INTO settings (key, value, description) VALUES
  ('agent_name', '"Bob"', 'Display name for the AI agent')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('timezone', '"Europe/Prague"', 'Primary timezone for operations')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('heartbeat_interval', '30', 'Heartbeat check interval in minutes')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('notification_email', '"ivankorn.assistant@gmail.com"', 'Email for agent notifications')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('escalation_email', '"ivan.korn@insead.edu"', 'Email for escalation alerts')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('operating_hours_start', '"09:00"', 'Start of outbound operating hours')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('operating_hours_end', '"18:00"', 'End of outbound operating hours')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('auto_approve_threshold', '"low"', 'Tasks at or below this priority auto-approve')
ON CONFLICT (key) DO NOTHING;

-- Sample task (created_by is UUID FK, leave NULL for system-generated)
INSERT INTO tasks (type, title, description, priority, status) VALUES
  ('other', 'System Health Check', 'Verify all services are running correctly after initial deployment', 'medium', 'new');

-- Sample task pending approval
INSERT INTO tasks (type, title, description, priority, status) VALUES
  ('call', 'Follow up with potential client', 'Outbound call to discuss service offerings', 'high', 'pending_approval');

-- Create an approval for the pending task
INSERT INTO approvals (task_id, action_type, notes, status)
SELECT id, 'make_call', 'High priority outbound call requires human approval before execution', 'pending'
FROM tasks WHERE title = 'Follow up with potential client' LIMIT 1;

SELECT 'Seed data inserted successfully' AS result;
