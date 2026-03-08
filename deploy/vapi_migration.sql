-- Vapi Integration Migration
-- Adds vapi_call_id column + expands notification types for Vapi events
-- Run: psql -h 127.0.0.1 -U openclaw_user -d ai_operations_agent -f vapi_migration.sql

-- 1. Add vapi_call_id to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS vapi_call_id TEXT;

CREATE INDEX IF NOT EXISTS idx_calls_vapi_call_id
    ON calls(vapi_call_id)
    WHERE vapi_call_id IS NOT NULL;

-- 2. Expand notification types to include 'warning' and 'info' (used by Vapi webhook)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('approval_required', 'call_completed', 'task_update', 'system', 'error', 'warning', 'info', 'email_sent', 'email_received'));

-- 3. Add task type 'research' for research workflows
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_type_check
  CHECK (type IN ('call', 'booking', 'follow_up', 'cancellation', 'inquiry', 'research', 'other'));

-- 4. Add 'failed' to task statuses if not present (for escalation after max retries)
-- Already exists in base schema

SELECT 'Vapi migration complete' AS status;
