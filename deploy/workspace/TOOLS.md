# Tools — Environment Notes

## Database
- Helper script: `~/.openclaw/workspace/scripts/db.sh`
- Database: ai_operations_agent (PostgreSQL 17.7, localhost:5432)
- User: openclaw_user
- Run `db.sh help` for full command reference
- Available commands: query, insert-task, get-pending-tasks, approve-task, complete-task, get-pending-approvals, log-call, get-recent-calls, add-contact, lookup-contact, create-notification, get-unread-notifications, get-setting, set-setting, log-activity, stats, create-approval, approve, reject

## Voice Calls — ACTIVE
- Plugin: voice-call (ENABLED — Twilio provider configured)
- Phone number: +12272637593
- Provider: Twilio (account SID configured via environment)
- TTS: OpenAI (alloy voice)
- Outbound default mode: conversation (multi-turn)
- Inbound policy: allowlist (configure allowed numbers in config)
- Phone identity: Mr. Ermakov
- Greeting: "Hello! This is Mr. Ermakov, calling on behalf of Ivan Korn. How can I help you today?"

### Voice Call Tool Usage
Use the `voice_call` tool with these actions:
- `initiate_call` — Start a new outbound call (params: `to`, `message`, `mode`: "conversation" or "notify")
- `continue_call` — Send a follow-up message in an active call (params: `callId`, `message`)
- `speak_to_user` — Say something to the caller (params: `callId`, `message`)
- `end_call` — End an active call (params: `callId`)
- `get_status` — Check the status of a call (params: `callId`)

### Voice Call CLI
- `openclaw voicecall call --to "+number" --message "..."` — Quick outbound call
- `openclaw voicecall status --call-id "..."` — Check call status
- `openclaw voicecall tail` — Live call event stream

## Webhooks
- Dashboard webhook: POST http://127.0.0.1:3000/api/... (Next.js API routes)
- OpenClaw hooks: POST http://127.0.0.1:18789/hooks/agent (isolated agent run)
- OpenClaw wake: POST http://127.0.0.1:18789/hooks/wake (system event)

## Cron Jobs
- Morning Status Report: 09:00 CET daily
- Evening Summary: 18:00 CET daily
- Process Approved Tasks: every 15 minutes
- Hourly Task Reminders: 10:00-17:00 CET weekdays
- Manage with: `openclaw cron list`, `openclaw cron add`, `openclaw cron run`

## Email
- Notifications to: ivankorn.assistant@gmail.com
- CC: ivan.korn@insead.edu
- Configured via settings table in database
- Sent via Next.js dashboard API (nodemailer when SMTP configured)

## Calendar
- Pending: Google Calendar OAuth from Nikita
- Script: `~/.openclaw/workspace/scripts/calendar.sh` (when available)
- Calendar email: ivankorn.assistant@gmail.com

## Safety
- Always validate SQL inputs
- Never expose database credentials in responses
- Always require approval for destructive operations
- Use trash over rm when available
- Log all significant actions to agent_logs table
