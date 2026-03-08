# Vapi Integration Guide — Gloura AI Dashboard
## Complete Baby-Steps Setup to Replace OpenClaw Voice Calls

**Version:** 1.0  
**Status:** Ready to implement  
**Replaces:** OpenClaw voice-call plugin (catastrophically broken)

---

## PART 1 — WHY OPENCLAW VOICE CALLS ARE BROKEN (POST-MORTEM)

Before you touch a single line of code, you need to understand exactly what happened on those last calls. Here's the raw transcript from `/root/.openclaw/voice-calls/calls.jsonl`:

```
Bot: "Hello, this is Mr. Ermakov, calling on behalf of Ivan Korn.
      I'm reaching out regarding: Call +436765620919: Arrange delivery
      of 100 roses to Ivan Korn today."                              ← BUG #1

Contact: "はい。"   (Japanese: "Yes.")
Contact: "Hello."

Bot: "はい、何かお手伝いできますか？"   (Japanese: "How can I help you?") ← BUG #2 + BUG #3

Contact: "Не работает, Вася, посмотри."  (Russian: "It's not working, Vasya")

→ hangup-bot
```

The client was right to be furious. Here are the **4 root causes**, all unfixable in OpenClaw:

### BUG #1 — Phone Number Spoken Aloud
**Cause:** `callPurpose = approval.notes` and the notes field is literally `"Call +436765620919: Arrange delivery of 100 roses to Ivan Korn today."` — the phone number prefix is designed for humans reading the task, not for TTS.

**Result:** The bot literally reads `"Call +436765620919"` out loud. Completely unprofessional.

### BUG #2 — No System Prompt Control Per Call
**Cause:** OpenClaw's `voice-call` plugin config schema **rejects** the `responseSystemPrompt` field. Previous sessions tried adding it — the schema validation silently stripped it. The embedded GPT-4o model receives **zero** instructions about language, persona, or behavior after the initial message.

**Result:** After the first message, the bot becomes a generic assistant with no context.

### BUG #3 — Language Session Bleed (Unfixable Architecture Issue)
**Cause:** OpenClaw reuses a single LLM session across ALL calls made in a day. When a prior call or chat involved Japanese text, that context bleeds into the next call. When the contact said `"はい"` (Japanese for "yes"), the STT detected Japanese and the model switched entirely to Japanese for all subsequent responses.

**Result:** One Japanese word from the contact → bot responds 100% in Japanese for the rest of the call. No override is possible without per-call session isolation, which OpenClaw does not support.

### BUG #4 — "How Can I Help You?" Behavior
**Cause:** Without a system prompt, the default GPT-4o behavior for a conversational AI is to act as a helpful inbound service bot. After the scripted opening, it defaults to asking `"How can I help you?"` — the exact opposite of what an outbound caller should say.

**Result:** The bot states the purpose, then immediately asks how it can help — completely nonsensical for an outbound call.

### Why These Are Unfixable in OpenClaw

OpenClaw v2026.3.1 does not support:
- Per-call session isolation
- `responseSystemPrompt` injection via voice-call config
- Language locking per call
- Post-call webhook with transcript/recording

**Conclusion: Replace the voice layer entirely with Vapi.**

---

## PART 2 — WHY VAPI SOLVES ALL OF THIS

| Problem | OpenClaw | Vapi |
|---------|----------|------|
| System prompt per call | ❌ Schema rejects it | ✅ Full control via `assistant.model.messages` |
| Language locking | ❌ Follows user's language | ✅ Deepgram `language: 'en'` + explicit system prompt rule |
| Session isolation | ❌ Shared daily session | ✅ Every call is completely isolated |
| Post-call events | ❌ Requires OpenClaw callback (unreliable) | ✅ Native `end-of-call-report` webhook |
| Transcript/Recording | ❌ Manual JSONL parsing | ✅ `artifact.transcript` + `artifact.recording.url` in webhook |
| Call purpose injection | ❌ Static hook message | ✅ Dynamic `firstMessage` + `{{variable}}` injection |
| Voice quality | ❌ gpt-4o-mini-tts (robotic) | ✅ ElevenLabs or OpenAI `shimmer` |

**Vapi pricing:** $0.05/min Vapi hosting + provider costs at-cost.
- 100 calls × 2 min average = $10/mo Vapi + ~$20–30 STT+LLM+TTS = **~$30–40/mo total**
- Can import existing Twilio number `+12272637593` — no number change needed

---

## PART 3 — VAPI ACCOUNT SETUP (BABY STEPS)

### Step 1: Create Vapi Account

1. Go to [https://dashboard.vapi.ai](https://dashboard.vapi.ai)
2. Sign up with your email
3. Verify your email and log in

### Step 2: Get Your API Key

1. Click **Settings** (gear icon, bottom-left sidebar)
2. Click **API Keys** tab
3. Click **+ New Key**
4. Name it: `gloura-production`
5. Copy the key — it starts with `sk-` — **save it securely now, it's shown only once**

### Step 3: Import Your Existing Twilio Phone Number

This keeps the existing number `+12272637593` — no change for the business.

1. In Vapi dashboard, click **Phone Numbers** in the left sidebar
2. Click **Import** button (or `+` button → `Import from Twilio`)
3. Fill in the form:
   - **Account SID:** *(use the Twilio Account SID from your ecosystem.config.js — the `TWILIO_ACCOUNT_SID` value)*
   - **Auth Token:** *(use the Twilio Auth Token from your ecosystem.config.js — the `TWILIO_AUTH_TOKEN` value)*
   - **Phone Number:** `+12272637593`
4. Click **Import Phone Number**
5. After import, you'll see the number with a **Phone Number ID** — it's a UUID like `ph_xxxxxxxx`
   - **Copy this UUID** — this is your `VAPI_PHONE_NUMBER_ID` environment variable

### Step 4: Configure the Server URL (Webhook)

This tells Vapi where to send call events (transcript, recording, status).

1. In Vapi dashboard → **Settings** → **Server URL**
2. Set the **Server URL** to: `https://gloura.me/api/vapi/webhook`
3. Set a **Webhook Secret** (optional but recommended for security):
   - Generate a random 32-char string: `openssl rand -hex 16`
   - Example: `a3f8d291bc04e1a7f6c2d9b4e5f03827`
   - **Copy this** — this is your `VAPI_WEBHOOK_SECRET` environment variable
4. Save settings

### Step 5: (Optional) Create a Persistent Base Assistant

You can either use a persistent assistant (managed in Vapi dashboard) or transient per-call config (built into code). **The code implementation below uses transient** — skip this step if you proceed with just code changes.

If you want a dashboard-managed assistant:
1. Click **Assistants** → **+ New Assistant**
2. Set the name: `Gloura AI Outbound`
3. Copy the **Assistant ID** (UUID) — this is your `VAPI_ASSISTANT_ID`
4. You can test the assistant from the Vapi playground before live calls

---

## PART 4 — THE SYSTEM PROMPT (Designed for Human-Quality Outbound Calls)

This is the most critical part. Every word is intentional. **Do not simplify this.**

```
You are {{agentName}}, a professional AI executive assistant calling on behalf of {{ownerName}}.

You have placed an OUTBOUND call to {{contactName}}.
Your specific reason for this call: {{callPurpose}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR ROLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You made this call. You are the CALLER with a known, specific purpose.
You represent {{ownerName}} professionally. You have full authority to schedule,
confirm, arrange, and communicate on their behalf.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE — THIS IS A STRICT RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST speak ONLY in English for the ENTIRE call.
This applies regardless of what language the contact uses.
Do NOT switch to Japanese, Russian, German, or any other language — not even to be polite.
If the contact does not speak English, say exactly:
"I apologize, I'm only able to assist in English. Is there someone available who speaks English? No? Thank you, have a great day." — then end the call.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✗ NEVER say "How can I help you?" or "How may I assist you?" — you know exactly why you called.
✗ NEVER read phone numbers, order IDs, or internal references aloud.
✗ NEVER make up information or fabricate commitments you're not sure about.
✗ NEVER keep the call going unnecessarily — be concise and purposeful.
✓ Speak in 1–3 short sentences per turn — like a real professional, not a monologue.
✓ Be warm, natural, and human. Not robotic. Not stiff.
✓ Pause naturally after asking a question. Let them respond.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION FLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — OPENING (firstMessage handles this automatically):
Your opening line is already handled. After they respond, move to Step 2.

STEP 2 — CONFIRM AND STATE PURPOSE:
Once you know you're speaking with {{contactName}} or the right person:
"Hi there, this is {{agentName}} calling on behalf of {{ownerName}}. I'm
calling about [state the callPurpose in clear, natural language]. [State
the specific ask or action needed — 1 sentence]."

STEP 3 — ENGAGE:
Listen carefully. Answer questions. Confirm details. Be helpful.
Your goal: accomplish the stated purpose.

STEP 4 — CONFIRM AND CLOSE:
Once the matter is addressed: "Perfect, thank you so much {{contactName}}.
Have a wonderful day! Goodbye."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIAL SITUATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VOICEMAIL DETECTED:
"Hi {{contactName}}, this is {{agentName}} calling on behalf of {{ownerName}}.
I'm calling regarding [brief 1-sentence summary of callPurpose]. Please call
us back at your convenience. Thank you! Have a great day."
→ End the call immediately after this.

WRONG NUMBER:
"Oh, I'm so sorry to have bothered you — I must have the wrong number. Have a great day!"
→ End the call immediately.

SOMEONE ELSE ANSWERS (not {{contactName}}):
"Hi, I'm trying to reach {{contactName}}. Is {{contactName}} available?
[If no:] I see — could you please let them know that {{agentName}} called
on behalf of {{ownerName}}? I'll try again later. Thank you, have a good day."
→ End the call.

HOSTILE OR REFUSAL TO ENGAGE:
"I completely understand, I won't take any more of your time. Have a good day. Goodbye."
→ End the call immediately.

CONTACT IS BUSY / BAD TIME:
"Of course, I'll call back at a better time. When would be convenient?
[Or:] No problem at all — I'll let {{ownerName}} know. Have a great day!"
→ End the call.

CONTACT ASKS TO SPEAK WITH {{ownerName}} DIRECTLY:
"Absolutely, I'll pass that request along to {{ownerName}} and they'll follow up with you directly. Is there a best time to reach you?"
```

### Why Each Rule Exists

- **Language lock**: Without the explicit English-only rule, GPT-4o will mirror the user's language. One word of Japanese → full Japanese response. This burned the client.
- **"How can I help you?" prohibition**: This is the DEFAULT behavior of an AI assistant model. Must be explicitly forbidden for outbound callers.
- **Phone numbers out loud**: The `callPurpose` was extracted directly from notes like `"Call +436765620919: Arrange delivery..."` — the phone number got spoken verbatim.
- **Concise turns**: Long AI monologues feel robotic and unnatural on a voice call.
- **Special situations**: Without these, the bot either freezes, hallucinates, or keeps talking after a wrong number.

---

## PART 5 — CODE CHANGES (COMPLETE IMPLEMENTATION)

### 5.1 — Environment Variables

#### On VPS: Edit `/opt/ai-dashboard/.env` (or update PM2 env)

SSH into `76.13.40.146` and add these:

```bash
ssh root@76.13.40.146

# Edit or create .env file
nano /opt/ai-dashboard/.env
```

Add these lines:
```env
VAPI_API_KEY=sk-your-api-key-from-step-2-here
VAPI_PHONE_NUMBER_ID=ph_your-phone-number-id-from-step-3-here
VAPI_WEBHOOK_SECRET=your-webhook-secret-from-step-4-here
NEXT_PUBLIC_BASE_URL=https://gloura.me
```

Then reload the PM2 app:
```bash
cd /opt/ai-dashboard
pm2 reload ai-dashboard
```

#### `dashboard/ecosystem.config.js` — Add variable references

```javascript
VAPI_API_KEY: process.env.VAPI_API_KEY,
VAPI_PHONE_NUMBER_ID: process.env.VAPI_PHONE_NUMBER_ID,
VAPI_WEBHOOK_SECRET: process.env.VAPI_WEBHOOK_SECRET,
NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || 'https://gloura.me',
```

---

### 5.2 — Database Migration

Run this migration on the VPS PostgreSQL instance:

```sql
-- File: deploy/vapi_migration.sql
-- Adds vapi_call_id column to calls table for tracking Vapi calls

ALTER TABLE calls ADD COLUMN IF NOT EXISTS vapi_call_id TEXT;
CREATE INDEX IF NOT EXISTS idx_calls_vapi_call_id ON calls(vapi_call_id) WHERE vapi_call_id IS NOT NULL;

-- Also ensure openclaw_call_id unique constraint is nullable-safe
-- (openclaw_call_id can remain but will be empty for Vapi calls)
```

Run it:
```bash
psql -h 127.0.0.1 -U openclaw_user -d ai_operations_agent -f /opt/deploy/vapi_migration.sql
```

---

### 5.3 — New File: `/api/vapi/webhook/route.ts`

This handles all events Vapi sends back — call status updates, transcripts, recordings.

File: `dashboard/src/app/api/vapi/webhook/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function POST(request: NextRequest) {
  // Validate Vapi webhook secret if configured
  const vapiSecret = process.env.VAPI_WEBHOOK_SECRET;
  if (vapiSecret) {
    const providedSecret = request.headers.get('x-vapi-secret');
    if (providedSecret !== vapiSecret) {
      console.warn('Vapi webhook rejected: invalid secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const message = body.message as Record<string, unknown> | undefined;
  if (!message) {
    // Some Vapi requests pass event at root level
    return NextResponse.json({ received: true });
  }

  const eventType = message.type as string | undefined;
  const call = message.call as Record<string, unknown> | undefined;
  const vapiCallId = call?.id as string | undefined;

  try {
    switch (eventType) {
      case 'status-update': {
        const status = message.status as string | undefined;
        if (!vapiCallId || !status) break;

        const statusMap: Record<string, string> = {
          queued: 'in_progress',
          ringing: 'in_progress',
          'in-progress': 'in_progress',
          forwarding: 'in_progress',
          ended: 'completed',
        };
        const dbStatus = statusMap[status] ?? 'in_progress';

        await pool.query(
          `UPDATE calls SET status = $1 WHERE vapi_call_id = $2`,
          [dbStatus, vapiCallId]
        );
        break;
      }

      case 'end-of-call-report': {
        if (!vapiCallId) break;

        const artifact = message.artifact as Record<string, unknown> | undefined;
        const analysis = message.analysis as Record<string, unknown> | undefined;
        const endedReason = message.endedReason as string | undefined;
        const durationSeconds = message.durationSeconds as number | undefined;

        const transcript = (artifact?.transcript as string | undefined) ?? '';
        const recording = artifact?.recording as Record<string, unknown> | undefined;
        const recordingUrl = (recording?.url as string | undefined) ?? '';
        const summary = (analysis?.summary as string | undefined) ?? '';

        // Map Vapi endedReason to our status values
        let finalStatus = 'completed';
        if (endedReason && ['no-answer', 'voicemail', 'busy', 'no-answer-machine'].includes(endedReason)) {
          finalStatus = 'no_answer';
        } else if (endedReason && ['failed', 'error', 'assistant-error'].includes(endedReason)) {
          finalStatus = 'failed';
        }

        await pool.query(
          `UPDATE calls
           SET status = $1,
               transcript = $2,
               summary = $3,
               recording_url = $4,
               duration_seconds = $5,
               ended_at = NOW()
           WHERE vapi_call_id = $6`,
          [finalStatus, transcript || null, summary || null, recordingUrl || null, durationSeconds ?? null, vapiCallId]
        );

        // Fetch associated task ID and phone for notification
        const callRes = await pool.query(
          `SELECT id, task_id, phone_number, caller_name FROM calls WHERE vapi_call_id = $1`,
          [vapiCallId]
        );

        if (callRes.rows.length > 0) {
          const { task_id, phone_number, caller_name } = callRes.rows[0];

          // Update linked task
          if (task_id) {
            const taskStatus = finalStatus === 'completed' ? 'completed' : finalStatus === 'no_answer' ? 'pending' : 'failed';
            await pool.query(
              `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2`,
              [taskStatus, task_id]
            );
          }

          // Notification
          const notifType = finalStatus === 'completed' ? 'call_completed' : finalStatus === 'no_answer' ? 'warning' : 'error';
          const notifTitle = finalStatus === 'completed'
            ? `Call completed — ${phone_number}`
            : finalStatus === 'no_answer'
            ? `Call unanswered — ${phone_number}`
            : `Call failed — ${phone_number}`;

          const notifMessage = summary
            ? summary
            : `Call to ${caller_name || phone_number} ended. Reason: ${endedReason || 'unknown'}. Duration: ${durationSeconds ?? 0}s.`;

          await pool.query(
            `INSERT INTO notifications (type, title, message, related_task_id)
             VALUES ($1, $2, $3, $4)`,
            [notifType, notifTitle, notifMessage, task_id || null]
          );

          // Agent log
          await pool.query(
            `INSERT INTO agent_logs (action, details, status)
             VALUES ($1, $2, $3)`,
            [
              'call_completed_vapi',
              JSON.stringify({
                vapi_call_id: vapiCallId,
                ended_reason: endedReason,
                duration_seconds: durationSeconds,
                has_transcript: transcript.length > 0,
                has_recording: recordingUrl.length > 0,
                task_id,
              }),
              finalStatus === 'completed' ? 'success' : 'failure',
            ]
          );
        }
        break;
      }

      case 'hang': {
        if (!vapiCallId) break;
        await pool.query(
          `UPDATE calls
           SET status = 'failed', ended_at = NOW(),
               summary = 'Call ended unexpectedly (hang)'
           WHERE vapi_call_id = $1 AND status = 'in_progress'`,
          [vapiCallId]
        );
        break;
      }

      // transcript and tool-calls events are informational — no DB action needed
      default:
        break;
    }
  } catch (error) {
    console.error('Vapi webhook processing error:', error);
    // Return 200 even on error so Vapi does not retry endlessly
  }

  return NextResponse.json({ received: true });
}
```

---

### 5.4 — Modified File: `approvals/route.ts`

Two changes are needed:

**Change A** — Fix `callPurpose` extraction (strip phone number prefix from notes):
```diff
-     callPurpose = approval.notes;
+     // Strip "Call +phone:" prefix — prevents phone number being spoken aloud by TTS
+     callPurpose = approval.notes
+       .replace(/^Call\s+\+?[\d\s\-()]{6,20}:\s*/i, '')
+       .trim() || 'Follow up on a business matter';
```

**Change B** — Replace OpenClaw voice block with Vapi:

The entire OpenClaw `if (hookToken)` block is replaced with a Vapi block. Key logic:
1. Insert call record first (to get our internal `callId`)
2. Query settings for agent name and owner name
3. Build the system prompt with call-specific variables
4. POST to `https://api.vapi.ai/call` with transient assistant config
5. Store the Vapi call ID (`vapi_call_id`) in the calls table
6. Twilio TwiML fallback remains as last resort (condition changes to `!vapiSuccess`)

The full function with both changes is implemented in the actual code files (see section 6 below).

---

## PART 6 — FULL CALL FLOW (END-TO-END)

```
User approves call in dashboard
       ↓
PATCH /api/approvals → executeApprovedCall()
       ↓
Extract phone number from notes regex
Fix callPurpose: strip "Call +xxx:" prefix
       ↓
POST https://api.vapi.ai/call
  - phoneNumberId: your imported +12272637593
  - customer: { number: "+436765620919", name: "Ivan Korn" }
  - assistant: {
      model: gpt-4o with system prompt
      transcriber: Deepgram nova-2, language: "en"  ← language LOCKED
      voice: OpenAI "shimmer"
      firstMessage: "Hello, may I speak with Ivan Korn?..."
      serverUrl: "https://gloura.me/api/vapi/webhook"
    }
       ↓
Vapi dials +436765620919 using Twilio +12272637593
       ↓
CALL HAPPENS (isolated session, English-only, purpose-driven)
       ↓
Call ends for any reason
       ↓
POST https://gloura.me/api/vapi/webhook
  type: "end-of-call-report"
  artifact.transcript: "Hello, may I speak with Ivan Korn?..."
  artifact.recording.url: "https://storage.vapi.ai/..."
  analysis.summary: "Successfully arranged delivery of 100 roses..."
  endedReason: "assistant-ended-call"
  durationSeconds: 47
       ↓
Webhook handler updates calls table:
  - status: "completed"
  - transcript: full conversation text
  - summary: AI-generated summary
  - recording_url: recording link
  - duration_seconds: 47
  - ended_at: NOW()
       ↓
Task status updated → "completed"
Notification created → "Call completed — +436765620919"
```

---

## PART 7 — VPS DEPLOYMENT CHECKLIST

After everything is merged and pushed to the VPS:

### Step 1: Run the DB Migration
```bash
ssh root@76.13.40.146
psql -h 127.0.0.1 -U openclaw_user -d ai_operations_agent -c "
  ALTER TABLE calls ADD COLUMN IF NOT EXISTS vapi_call_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_calls_vapi_call_id ON calls(vapi_call_id) WHERE vapi_call_id IS NOT NULL;
"
```

### Step 2: Set Environment Variables
```bash
# Create/update .env file (or set in PM2 directly)
cat >> /opt/ai-dashboard/.env << 'EOF'
VAPI_API_KEY=sk-your-key-here
VAPI_PHONE_NUMBER_ID=ph_your-phone-number-id-here
VAPI_WEBHOOK_SECRET=your-webhook-secret-here
NEXT_PUBLIC_BASE_URL=https://gloura.me
EOF
```

### Step 3: Pull Changes and Rebuild
```bash
cd /opt/ai-dashboard
git pull origin main
npm install
npm run build
pm2 reload ai-dashboard
```

### Step 4: Verify API Route Exists
```bash
curl -s https://gloura.me/api/vapi/webhook -X POST \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
# Expected: {"received":true}
```

### Step 5: Verify Vapi Configuration
```bash
# Test Vapi API key works
curl -s https://api.vapi.ai/phone-number \
  -H "Authorization: Bearer $VAPI_API_KEY" | jq .[0].id
# Should return your phone number ID
```

---

## PART 8 — TEST CALL CHECKLIST

Once deployed, place a test call using the dashboard approval flow:

| Test | Expected Result |
|------|----------------|
| Create a task with `contact_phone: +436765620919` | Task created, status: pending |
| Approve the make_call approval | Vapi call initiated within 3 seconds |
| Answer the call | Hear: "Hello, may I please speak with [name]?" |
| Confirm identity | Bot states the PURPOSE immediately — no "How can I help?" |
| Speak in Japanese or Russian | Bot STAYS IN ENGLISH |
| Let it go to voicemail | Bot leaves clean voicemail, hangs up |
| Check dashboard after call | Call record has transcript + summary + duration |
| Check notifications | "Call completed" notification appears |

---

## PART 9 — PRICING ESTIMATE FOR CLIENT

| Scenario | Calculation | Monthly Cost |
|----------|-------------|--------------|
| 100 calls × 1 min avg | 100 min × $0.05 Vapi | $5.00 |
| 100 calls × 2 min avg | 200 min × $0.05 Vapi | $10.00 |
| 100 calls × 2 min avg | STT: 200 min × $0.006 (Deepgram) | $1.20 |
| 100 calls × 2 min avg | LLM: ~$0.08/call (gpt-4o estimate) | $8.00 |
| 100 calls × 2 min avg | TTS: 200 min × $0.015 (OpenAI) | $3.00 |
| **Total per 100 calls × 2 min** | | **~$22/month** |
| **Total per 500 calls × 2 min** | | **~$110/month** |

**Phone number import from Twilio:** Free — you provide your own Twilio credentials
**Recording storage:** 14-day default in Vapi (free), or configure your own S3

---

## PART 10 — ROLLBACK PLAN (If Something Goes Wrong)

The Twilio TwiML fallback is preserved in the code. If Vapi fails:

1. `VAPI_API_KEY` missing → automatically falls through to Twilio TwiML
2. Vapi API error → logs the error, falls through to Twilio TwiML
3. Nuclear rollback: Remove `VAPI_API_KEY` from env vars → system reverts to Twilio TwiML one-way calls

The OpenClaw voice hook is **completely removed** from the call flow (it was doing more harm than good). OpenClaw continues running for:
- Agentic task processing (non-call actions)
- Chat interface
- Research and web searches
- All non-voice features

---

## SUMMARY

1. ✅ OpenClaw voice layer: **REMOVED** — 4 unfixable bugs, replaced entirely
2. ✅ Vapi: **Integrated** — per-call system prompt, English-locked, purpose-driven
3. ✅ Webhook: **New endpoint** `/api/vapi/webhook` — auto-syncs transcript/recording/status
4. ✅ callPurpose: **Fixed** — strips `"Call +phone:"` prefix before sending to Vapi
5. ✅ Fallback: **Preserved** — Twilio TwiML as last resort if Vapi is down
6. ✅ DB: **Migration added** — `vapi_call_id` column in `calls` table
