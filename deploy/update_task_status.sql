ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('new','in_progress','pending_approval','approved','completed','cancelled','closed','failed'));
