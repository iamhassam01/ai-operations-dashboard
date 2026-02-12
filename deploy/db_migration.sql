ALTER TABLE tasks ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('new', 'pending_approval', 'approved', 'in_progress', 'completed', 'cancelled', 'escalated', 'pending_user_input', 'scheduled', 'closed'));
INSERT INTO settings (key, value, description) VALUES ('do_not_disturb', 'false', 'DND mode - suppress non-critical notifications') ON CONFLICT (key) DO NOTHING;
