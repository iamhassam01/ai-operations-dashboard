#!/bin/bash
# Database helper script for AI Operations Agent
# Location: ~/.openclaw/workspace/scripts/db.sh
# Usage: ./db.sh <command> [args...]

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-ai_operations_agent}"
DB_USER="${DB_USER:-openclaw_user}"
DB_PASS="${DB_PASSWORD:?DB_PASSWORD environment variable is required}"

export PGPASSWORD="$DB_PASS"

PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -A"

case "$1" in
  "query")
    # Run a custom SQL query
    # Usage: ./db.sh query "SELECT * FROM tasks"
    $PSQL -c "$2"
    ;;

  "insert-task")
    # Insert a new task
    # Usage: ./db.sh insert-task "type" "title" "description"
    $PSQL -c "INSERT INTO tasks (type, title, description, status) VALUES ('$2', '$3', '$4', 'new') RETURNING id, title, status, created_at;"
    ;;

  "get-pending-tasks")
    # Get tasks awaiting action
    $PSQL -c "SELECT id, type, priority, title, status, created_at FROM tasks WHERE status IN ('new', 'pending_approval', 'approved', 'in_progress') ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END, created_at ASC LIMIT 20;"
    ;;

  "get-pending-approvals")
    # Get approvals waiting for human decision
    $PSQL -c "SELECT a.id, a.action_type, a.status, a.created_at, t.title AS task_title, c.phone_number FROM approvals a LEFT JOIN tasks t ON a.task_id = t.id LEFT JOIN calls c ON a.call_id = c.id WHERE a.status = 'pending' ORDER BY a.created_at ASC LIMIT 20;"
    ;;

  "approve-task")
    # Mark a task as approved
    # Usage: ./db.sh approve-task "task-uuid"
    $PSQL -c "UPDATE tasks SET status = 'approved', updated_at = NOW() WHERE id = '$2' RETURNING id, title, status;"
    ;;

  "complete-task")
    # Mark a task as completed
    # Usage: ./db.sh complete-task "task-uuid"
    $PSQL -c "UPDATE tasks SET status = 'completed', updated_at = NOW() WHERE id = '$2' RETURNING id, title, status;"
    ;;

  "log-call")
    # Log a call record
    # Usage: ./db.sh log-call "task_id" "direction" "phone" "caller_name" "status" "duration_secs" "summary"
    $PSQL -c "INSERT INTO calls (task_id, direction, phone_number, caller_name, status, duration_seconds, summary, started_at, ended_at) VALUES ($([ -z \"$2\" ] && echo 'NULL' || echo \"'$2'\"), '$3', '$4', '$5', '$6', $7, '$8', NOW() - INTERVAL '$7 seconds', NOW()) RETURNING id, phone_number, direction, status;"
    ;;

  "get-recent-calls")
    # Get recent calls
    # Usage: ./db.sh get-recent-calls [limit]
    LIMIT=${2:-10}
    $PSQL -c "SELECT c.id, c.direction, c.phone_number, c.caller_name, c.status, c.duration_seconds, c.summary, c.created_at FROM calls c ORDER BY c.created_at DESC LIMIT $LIMIT;"
    ;;

  "add-contact")
    # Add or update a contact
    # Usage: ./db.sh add-contact "phone" "name" "email" "company"
    $PSQL -c "INSERT INTO contacts (phone_number, name, email, company) VALUES ('$2', '$3', '$4', '$5') ON CONFLICT (phone_number) DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name), email = COALESCE(EXCLUDED.email, contacts.email), company = COALESCE(EXCLUDED.company, contacts.company), updated_at = NOW() RETURNING id, phone_number, name;"
    ;;

  "lookup-contact")
    # Look up a contact by phone number
    # Usage: ./db.sh lookup-contact "+420123456789"
    $PSQL -c "SELECT * FROM contacts WHERE phone_number = '$2';"
    ;;

  "create-notification")
    # Create a notification
    # Usage: ./db.sh create-notification "user_id" "type" "title" "message" "task_id" "call_id"
    $PSQL -c "INSERT INTO notifications (user_id, type, title, message, related_task_id, related_call_id) VALUES ($([ -z \"$2\" ] && echo 'NULL' || echo \"'$2'\"), '$3', '$4', '$5', $([ -z \"$6\" ] && echo 'NULL' || echo \"'$6'\"), $([ -z \"$7\" ] && echo 'NULL' || echo \"'$7'\")) RETURNING id, title, type;"
    ;;

  "get-unread-notifications")
    # Get unread notifications for a user
    # Usage: ./db.sh get-unread-notifications "user_id"
    $PSQL -c "SELECT id, type, title, message, created_at FROM notifications WHERE user_id = '$2' AND is_read = false ORDER BY created_at DESC LIMIT 20;"
    ;;

  "get-setting")
    # Get a setting value
    # Usage: ./db.sh get-setting "business_name"
    $PSQL -c "SELECT value FROM settings WHERE key = '$2';"
    ;;

  "set-setting")
    # Set a setting value
    # Usage: ./db.sh set-setting "key" "value"
    $PSQL -c "INSERT INTO settings (key, value, updated_at) VALUES ('$2', '$3', NOW()) ON CONFLICT (key) DO UPDATE SET value = '$3', updated_at = NOW() RETURNING key, value;"
    ;;

  "log-activity")
    # Log agent activity
    # Usage: ./db.sh log-activity "action" '{"details":"json"}' "success|failure|pending" ["error_message"]
    $PSQL -c "INSERT INTO agent_logs (action, details, status, error_message) VALUES ('$2', '$3'::jsonb, '${4:-success}', $([ -z \"$5\" ] && echo 'NULL' || echo \"'$5'\")) RETURNING id, action, status, created_at;"
    ;;

  "stats")
    # Get dashboard statistics
    echo "=== Task Stats ==="
    $PSQL -c "SELECT status, COUNT(*) as count FROM tasks GROUP BY status ORDER BY count DESC;"
    echo ""
    echo "=== Call Stats (Today) ==="
    $PSQL -c "SELECT direction, status, COUNT(*) as count FROM calls WHERE created_at::date = CURRENT_DATE GROUP BY direction, status ORDER BY count DESC;"
    echo ""
    echo "=== Pending Approvals ==="
    $PSQL -c "SELECT COUNT(*) as pending_approvals FROM approvals WHERE status = 'pending';"
    echo ""
    echo "=== Unread Notifications ==="
    $PSQL -c "SELECT COUNT(*) as unread FROM notifications WHERE is_read = false;"
    ;;

  "create-approval")
    # Create an approval request
    # Usage: ./db.sh create-approval "task_id" "call_id" "action_type" "notes"
    $PSQL -c "INSERT INTO approvals (task_id, call_id, action_type, notes) VALUES ($([ -z \"$2\" ] && echo 'NULL' || echo \"'$2'\"), $([ -z \"$3\" ] && echo 'NULL' || echo \"'$3'\"), '$4', '$5') RETURNING id, action_type, status, created_at;"
    ;;

  "approve")
    # Approve an approval request
    # Usage: ./db.sh approve "approval_id" "user_id" "notes"
    $PSQL -c "UPDATE approvals SET status = 'approved', approved_by = '$3', approved_at = NOW(), notes = COALESCE('$4', notes) WHERE id = '$2' RETURNING id, action_type, status, approved_at;"
    ;;

  "reject")
    # Reject an approval request
    # Usage: ./db.sh reject "approval_id" "user_id" "notes"
    $PSQL -c "UPDATE approvals SET status = 'rejected', approved_by = '$3', approved_at = NOW(), notes = COALESCE('$4', notes) WHERE id = '$2' RETURNING id, action_type, status;"
    ;;

  *)
    echo "AI Operations Agent - Database Helper"
    echo ""
    echo "Usage: $0 <command> [args...]"
    echo ""
    echo "Commands:"
    echo "  query <sql>                          - Run custom SQL query"
    echo "  insert-task <type> <title> <desc>     - Create a new task"
    echo "  get-pending-tasks                     - List pending tasks"
    echo "  get-pending-approvals                 - List pending approvals"
    echo "  approve-task <id>                     - Approve a task"
    echo "  complete-task <id>                    - Complete a task"
    echo "  log-call <task_id> <dir> <phone> <name> <status> <duration> <summary>"
    echo "  get-recent-calls [limit]              - List recent calls"
    echo "  add-contact <phone> <name> <email> <company>"
    echo "  lookup-contact <phone>                - Find contact by phone"
    echo "  create-notification <user_id> <type> <title> <message> [task_id] [call_id]"
    echo "  get-unread-notifications <user_id>    - Get unread notifications"
    echo "  get-setting <key>                     - Get a setting"
    echo "  set-setting <key> <value>             - Set a setting"
    echo "  log-activity <action> <details_json> <status> [error]"
    echo "  stats                                 - Get dashboard statistics"
    echo "  create-approval <task_id> <call_id> <action_type> <notes>"
    echo "  approve <approval_id> <user_id> [notes]"
    echo "  reject <approval_id> <user_id> [notes]"
    echo ""
    echo "Task types: call, booking, follow_up, cancellation, inquiry, other"
    echo "Approval actions: make_call, book, cancel, reschedule"
    ;;
esac
