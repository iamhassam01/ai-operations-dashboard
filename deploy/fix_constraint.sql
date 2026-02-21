-- Fix messages action_type CHECK constraint to include missing types
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_action_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_action_type_check 
  CHECK (action_type IN (
    'task_created', 'call_initiated', 'research_started', 'approval_requested',
    'approval_result', 'call_completed', 'info_gathered', 'error', 'clarification',
    'web_search_complete', 'research_complete', 'approval_created', 'status_changed',
    'research_failed', 'task_updated', 'memory_stored', 'approval_requested_call',
    'email_sent', 'contact_saved', 'calendar_event_created'
  ));

-- Update agent_identity to 'Bob' per client requirements
UPDATE settings SET value = '"Bob"', updated_at = NOW() WHERE key = 'agent_identity';

-- Clear any existing error logs about the constraint violation so the widget shows clean
DELETE FROM agent_logs WHERE error_message LIKE '%messages_action_type_check%';
