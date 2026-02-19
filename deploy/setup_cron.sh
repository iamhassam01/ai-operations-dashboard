#!/bin/bash
# Setup OpenClaw Cron Jobs for AI Operations Agent "Bob"
# Run this script on the VPS after deploying the updated OpenClaw config
# Usage: bash setup_cron.sh

set -e

echo "=== Setting up OpenClaw Cron Jobs ==="

# Morning status report at 09:00 CET
echo "Adding: Morning Status Report (09:00 CET)..."
openclaw cron add \
  --name "Morning Status Report" \
  --cron "0 9 * * *" \
  --tz "Europe/Prague" \
  --session isolated \
  --message "Morning status check. Run your heartbeat checklist:
1. Check pending tasks: query the database for tasks with status in ('new','pending_approval','approved','in_progress')
2. Check pending approvals waiting >2 hours — send gentle reminder notifications
3. Check for any failed calls that need retry
4. Summarize: count of pending tasks, pending approvals, recent calls
5. Post a brief morning status summary to the main session
6. If there are urgent tasks, escalate immediately" \
  --announce 2>/dev/null || echo "  (already exists or failed — check manually)"

# Evening summary at 18:00 CET
echo "Adding: Evening Summary (18:00 CET)..."
openclaw cron add \
  --name "Evening Summary" \
  --cron "0 18 * * *" \
  --tz "Europe/Prague" \
  --session isolated \
  --message "Evening summary. Compile today's activity:
1. Count tasks created, completed, and still pending today
2. Count calls made and their outcomes today
3. Count approvals processed today
4. Note any tasks that were stuck or failed
5. Create a notification with the daily summary
6. Log the summary to agent_logs with action 'daily_summary'" \
  --announce 2>/dev/null || echo "  (already exists or failed — check manually)"

# Process approved tasks every 15 minutes
echo "Adding: Process Approved Tasks (every 15 min)..."
openclaw cron add \
  --name "Process Approved Tasks" \
  --cron "*/15 * * * *" \
  --tz "Europe/Prague" \
  --session isolated \
  --message "Check for approved tasks that need action:
1. Query: SELECT a.id, a.action_type, a.notes, t.id as task_id, t.title, t.contact_phone FROM approvals a JOIN tasks t ON a.task_id = t.id WHERE a.status = 'approved' AND t.status = 'approved'
2. For each approved make_call action: initiate the voice call using voice_call tool
3. For each approved booking: proceed with the booking
4. Update task statuses to 'in_progress' once action is started
5. Log all actions to agent_logs" \
  --announce 2>/dev/null || echo "  (already exists or failed — check manually)"

# Hourly appointment/task reminders during business hours
echo "Adding: Hourly Task Reminders (business hours)..."
openclaw cron add \
  --name "Hourly Task Reminders" \
  --cron "0 10-17 * * 1-5" \
  --tz "Europe/Prague" \
  --session isolated \
  --message "Hourly reminder check:
1. Check for tasks with status 'pending_approval' that have been waiting >4 hours — create a reminder notification
2. Check for tasks with status 'in_progress' that have been in progress >24 hours — flag as potentially stuck
3. Check for upcoming scheduled calls or appointments in the next hour
4. Log the check to agent_logs with action 'hourly_reminder_check'" \
  --announce 2>/dev/null || echo "  (already exists or failed — check manually)"

echo ""
echo "=== Cron jobs setup complete ==="
echo "Verify with: openclaw cron list"
