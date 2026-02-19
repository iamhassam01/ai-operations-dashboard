# Heartbeat Checklist

1. Check pending tasks: `db.sh get-pending-tasks` — if urgent tasks exist, escalate immediately
2. Check pending approvals: `db.sh get-pending-approvals` — if waiting >2 hours, send gentle reminder notification
3. Check failed calls: `db.sh query "SELECT id, phone_number, status, summary FROM calls WHERE status IN ('failed','no-answer') AND created_at > NOW() - INTERVAL '4 hours' ORDER BY created_at DESC"` — schedule retries if needed
4. Check recent calls (voice active): `db.sh query "SELECT id, phone_number, direction, status, summary FROM calls WHERE created_at > NOW() - INTERVAL '30 minutes' ORDER BY created_at DESC"` — process any needing follow-up
5. Check approved tasks awaiting action: `db.sh query "SELECT t.id, t.title, a.action_type FROM tasks t JOIN approvals a ON a.task_id = t.id WHERE t.status = 'approved' AND a.status = 'approved' LIMIT 10"` — execute approved actions (calls, bookings)
6. System health: verify DB connectivity, note any errors in recent agent_logs
7. Log completion: `db.sh log-activity "heartbeat_complete" '{}' "success"`

<!-- Keep this file tiny. Heartbeats run full agent turns — shorter = fewer tokens. -->
<!-- Remove a line to skip that check. Add lines for new periodic checks. -->
