# Tools — Environment Notes

## Database
- Helper script: `~/.openclaw/workspace/scripts/db.sh`
- Database: ai_operations_agent (PostgreSQL 17.7, localhost:5432)
- User: openclaw_user
- Run `db.sh help` for full command reference
- Available commands: query, insert-task, get-pending-tasks, approve-task, get-pending-approvals, log-call, stats, log-activity

## Voice Calls
- Plugin: voice-call (currently disabled — awaiting Twilio credentials)
- When enabled: inbound/outbound calling via Twilio, OpenAI TTS (alloy voice)
- Phone identity: Mr. Ermakov

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
