# Heartbeat Checklist

1. Check pending tasks: `db.sh get-pending-tasks` — if urgent tasks exist, escalate immediately
2. Check pending approvals: `db.sh get-pending-approvals` — if waiting >2 hours, send gentle reminder
3. Check recent calls (if voice enabled): `db.sh query "SELECT id, phone_number, direction, status, summary FROM calls WHERE created_at > NOW() - INTERVAL '30 minutes' ORDER BY created_at DESC"` — process any needing follow-up
4. Check upcoming calendar events (when available) — look 2 hours ahead, prepare reminders
5. System health: verify DB connectivity, note any errors in recent agent_logs
6. Log completion: `db.sh log-activity "heartbeat_complete" '{}' "success"`

<!-- Keep this file tiny. Heartbeats run full agent turns — shorter = fewer tokens. -->
<!-- Remove a line to skip that check. Add lines for new periodic checks. -->
