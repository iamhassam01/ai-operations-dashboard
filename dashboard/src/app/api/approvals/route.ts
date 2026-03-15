import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { notifyOwner } from '@/lib/email';
import { getAgentContext, formatContextForHook } from '@/lib/agent-context';

export async function GET(request: NextRequest) {
  try {
    const taskId = request.nextUrl.searchParams.get('task_id');

    let query: string;
    let queryParams: (string | null)[];

    if (taskId) {
      // When filtering by task, show ALL statuses (for task detail view)
      query = `SELECT a.*, t.title as task_title, c.phone_number
       FROM approvals a
       LEFT JOIN tasks t ON a.task_id = t.id
       LEFT JOIN calls c ON a.call_id = c.id
       WHERE a.task_id = $1
       ORDER BY a.created_at DESC`;
      queryParams = [taskId];
    } else {
      // Default: only pending approvals
      query = `SELECT a.*, t.title as task_title, c.phone_number
       FROM approvals a
       LEFT JOIN tasks t ON a.task_id = t.id
       LEFT JOIN calls c ON a.call_id = c.id
       WHERE a.status = 'pending'
       ORDER BY a.created_at ASC`;
      queryParams = [];
    }

    const result = await pool.query(query, queryParams);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Approvals API error:', error);
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 });
  }
}

// Initiate a voice call via Vapi (primary) or Twilio TwiML fallback
// Falls back to direct Twilio TwiML if Vapi is not configured or fails
async function executeApprovedCall(approval: { id: string; task_id: string | null; notes: string; original_request?: string; contact_name?: string }) {
  try {
    // Extract phone number from approval notes or task
    let phoneNumber: string | null = null;
    let callPurpose = 'Approved call';

    // Try to extract from notes (format: "Call +number: purpose")
    if (approval.notes) {
      const phoneMatch = approval.notes.match(/\+[1-9]\d{6,14}/);
      if (phoneMatch) phoneNumber = phoneMatch[0];
      // Strip "Call +phone:" prefix — prevents phone numbers being spoken aloud by TTS
      callPurpose = approval.notes
        .replace(/^Call\s+\+?[\d\s\-()]{6,20}:\s*/i, '')
        .trim() || 'Follow up on a business matter';
    }

    // Fallback: get from task contact_phone
    if (!phoneNumber && approval.task_id) {
      const taskRes = await pool.query('SELECT contact_phone, contact_name, title FROM tasks WHERE id = $1', [approval.task_id]);
      if (taskRes.rows[0]?.contact_phone) {
        phoneNumber = taskRes.rows[0].contact_phone;
      }
    }

    if (!phoneNumber) {
      await pool.query(
        `INSERT INTO agent_logs (action, details, status, error_message) VALUES ($1, $2, 'failure', $3)`,
        ['call_initiation', JSON.stringify({ approval_id: approval.id, task_id: approval.task_id }), 'No phone number found for approved call']
      );
      await pool.query(
        `INSERT INTO notifications (type, title, message, related_task_id)
         VALUES ('error', 'Call failed', $1, $2)`,
        [`Could not initiate call — no phone number found. Please add a contact phone number to the task.`, approval.task_id]
      );
      return;
    }

    // Get task info for the call context (may be null if no task linked)
    let task: { title?: string; contact_name?: string; description?: string } | null = null;
    if (approval.task_id) {
      const taskRes = await pool.query('SELECT title, contact_name, description FROM tasks WHERE id = $1', [approval.task_id]);
      task = taskRes.rows[0] || null;
    }

    // Extract contact name: priority order:
    // 1. approval.contact_name column (set during approval creation)
    // 2. task.contact_name
    // 3. Parse from approval notes or original_request
    let contactName = approval.contact_name || task?.contact_name || '';
    if (!contactName || contactName === 'the contact') {
      // Try parsing from approval notes AND the original user request
      const textSources = [approval.notes, approval.original_request].filter(Boolean).join(' ');
      if (textSources) {
        const nameMatch = textSources.match(/(?:Ask(?:\s+if)?|Call|Inform|Tell|Reach|Contact|Speak\s+(?:to|with)|Confirm|Check|Verify|Schedule|Book|Arrange|Follow|Discuss|Notify|Update|Remind|Coordinate|Meet|Review)\s+([A-Z][a-zA-Z]+)/i);
        if (nameMatch && nameMatch[1] && /^[A-Z]/.test(nameMatch[1])) {
          const falsePositives = ['him', 'her', 'them', 'the', 'this', 'that', 'about', 'regarding', 'for', 'if', 'and', 'both', 'back', 'up', 'with', 'on', 'availability', 'available', 'whether', 'when', 'what', 'how', 'why'];
          if (!falsePositives.includes(nameMatch[1].toLowerCase())) {
            contactName = nameMatch[1];
          }
        }
      }
    }
    if (!contactName) contactName = 'the contact';

    // ── Try Vapi Conversational Voice Call (primary) ──
    const vapiApiKey = process.env.VAPI_API_KEY;
    const vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
    let vapiSuccess = false;

    if (vapiApiKey && vapiPhoneNumberId) {
      try {
        // Create call record first to get our internal call ID
        const callInsertRes = await pool.query(
          `INSERT INTO calls (task_id, direction, phone_number, caller_name, status, summary, created_at)
           VALUES ($1, 'outbound', $2, $3, 'in_progress', $4, NOW()) RETURNING id`,
          [approval.task_id || null, phoneNumber, contactName, `Vapi outbound call: ${callPurpose}`]
        );
        const callId = callInsertRes.rows[0].id;

        // Fetch agent identity from settings
        const settingsRes = await pool.query(
          `SELECT key, value FROM settings WHERE key IN ('agent_name', 'owner_name', 'user_name')`
        );
        const settingsMap: Record<string, string> = {};
        for (const row of settingsRes.rows as { key: string; value: string }[]) {
          settingsMap[row.key] = typeof row.value === 'string' ? row.value.replace(/^"|"$/g, '') : String(row.value);
        }
        const agentName = settingsMap['agent_name'] || 'Alex';
        const ownerName = settingsMap['owner_name'] || settingsMap['user_name'] || 'the business owner';
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://gloura.me';

        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

        // Use the original user request if available (verbatim), otherwise fall back to approval notes
        const verbatimInstructions = approval.original_request || approval.notes || callPurpose;

        const systemPrompt = `You are ${agentName}, ${ownerName}'s personal assistant. You're making this call on ${ownerName}'s behalf, and you should sound like a real, friendly human — not a robot or a call center script.

Today's date is ${today}. Tomorrow is ${tomorrow}.

You're calling ${contactName}.
Why you're calling: ${callPurpose}

ORIGINAL REQUEST FROM ${ownerName.toUpperCase()} (WORD-FOR-WORD — follow these EXACTLY):
"${verbatimInstructions}"

You MUST follow these instructions EXACTLY as written. If ${ownerName} said a specific time, date, question, or amount — use those EXACT details. Do NOT paraphrase, generalize, or say "we're flexible" unless the instructions explicitly say so. If a question is about whether ${ownerName} should do something, ask it that way — do NOT reverse who is doing what.

YOUR PERSONALITY: You're warm, genuine, and easy to talk to. You can be lighthearted when the moment calls for it — a small joke, a friendly comment — but you know when to be all business. Think "helpful friend who's really good at their job."

LANGUAGE RULE: You are fluent in both ENGLISH and CZECH (Čeština). Detect which language the other person speaks and respond in THAT language seamlessly.
- If they speak English → you speak English.
- If they speak Czech → you speak Czech. Use proper Czech grammar, business-appropriate Czech, and address them politely (use "vy" form unless they switch to "ty").
- If they switch languages mid-call, follow their lead and switch too — naturally, without commenting on the switch.
- If they speak a language other than English or Czech: "I'm sorry, I can only assist in English or Czech. Is there someone nearby who speaks either? No? Thank you, have a great day!" Then end the call.

IMPORTANT RULES:
- You KNOW why you're calling. NEVER ask "How can I help you?" — you're the one who reached out.
- Don't read out phone numbers, order IDs, or reference codes.
- Don't make up information or promise things you're not sure about.
- Keep your turns short: 1-3 sentences. Sound natural, like you're actually talking to someone.
- Do NOT end the call until you have addressed ALL the points in ${ownerName}'s instructions above. If there are multiple questions or requests, make sure you cover EVERY single one before wrapping up.

HOW THE CALL SHOULD GO:
1. Your opening is handled automatically — jump right into the purpose once they confirm who they are.
2. Be clear about why you're calling, in plain conversational language. Use the EXACT details from ${ownerName}'s instructions.
3. Listen, respond naturally, confirm details. Have a real conversation.
4. Only after ALL points are covered, wrap up warmly: "Perfect, that's everything I needed. Thanks so much — have a great day!"

SPECIAL SITUATIONS:
VOICEMAIL: "Hey ${contactName}, it's ${agentName} calling for ${ownerName}. Just reaching out about ${callPurpose}. Give us a call back when you get a chance — thanks!" (If the voicemail greeting was in Czech, leave the voicemail in Czech instead.) Then end the call.
WRONG NUMBER: "Oh, I'm sorry about that — must have the wrong number! Have a good one!" Then end the call.
NOT AVAILABLE: "No worries! Could you just let ${contactName} know that ${agentName} called for ${ownerName}? I'll try again later. Thanks so much!" Then end the call.
HOSTILE/REFUSAL: "I totally understand. Won't take any more of your time — have a good day!" Then end the call.

MEETING BOOKING:
- If the conversation involves scheduling a meeting with ${ownerName}, use the book_meeting function.
- Use the EXACT date and time from ${ownerName}'s instructions if specified. "Tomorrow" means ${tomorrow}. Today is ${today}.
- You MUST convert relative dates: "tomorrow" = ${tomorrow}, "today" = ${today}.
- Confirm before booking: "So I'll set up [topic] for [date] at [time]. Sound right?"
- After booking: "Done! ${ownerName} will see it on the calendar."
- If booking fails, say: "I wasn't able to get that onto the calendar right now, but I'll make sure ${ownerName} gets all the details and sets it up."`;

        const vapiRes = await fetch('https://api.vapi.ai/call', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${vapiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phoneNumberId: vapiPhoneNumberId,
            customer: { number: phoneNumber, name: contactName },
            assistant: {
              name: `Outbound: ${contactName}`,
              model: {
                provider: 'openai',
                model: 'gpt-4o',
                temperature: 0.6,
                maxTokens: 200,
                messages: [{ role: 'system', content: systemPrompt }],
                functions: [
                  {
                    name: 'book_meeting',
                    description: 'Book a meeting or appointment on the calendar. Use when the person agrees to a meeting.',
                    parameters: {
                      type: 'object',
                      properties: {
                        title: { type: 'string', description: 'Brief title for the meeting' },
                        date: { type: 'string', description: 'Meeting date in YYYY-MM-DD format' },
                        time: { type: 'string', description: 'Start time in HH:MM format (24-hour)' },
                        duration_minutes: { type: 'number', description: 'Duration in minutes, default 60' },
                        attendee_name: { type: 'string', description: 'Name of the person' },
                        notes: { type: 'string', description: 'Meeting purpose or notes' },
                      },
                      required: ['title', 'date', 'time'],
                    },
                  },
                ],
              },
              transcriber: { provider: 'deepgram', model: 'nova-2', language: 'multi' },
              voice: { provider: 'vapi', voiceId: 'Elliot' },
              firstMessage: `Hi, this is ${agentName}, ${ownerName}'s personal assistant. Am I speaking with ${contactName}?`,
              serverUrl: `${baseUrl}/api/vapi/webhook`,
              recordingEnabled: true,
              endCallFunctionEnabled: true,
              analysisPlan: {
                summaryPlan: {
                  enabled: true,
                  messages: [{ role: 'system', content: 'Summarize this phone call in 2-3 concise sentences. Focus on: who was called, the purpose, key information exchanged, outcomes, and any follow-up actions needed.' }],
                },
              },
            },
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!vapiRes.ok) {
          const errData = await vapiRes.json().catch(() => ({}));
          throw new Error(`Vapi API error ${vapiRes.status}: ${JSON.stringify(errData)}`);
        }

        const vapiCallData = await vapiRes.json() as { id: string };

        // Store Vapi call ID so webhook events can match back to this record
        await pool.query(
          `UPDATE calls SET vapi_call_id = $1 WHERE id = $2`,
          [vapiCallData.id, callId]
        );

        if (approval.task_id) {
          await pool.query(
            `UPDATE tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
            [approval.task_id]
          );
        }

        await pool.query(
          `INSERT INTO notifications (type, title, message, related_task_id)
           VALUES ('call_completed', $1, $2, $3)`,
          [
            `Call initiated to ${phoneNumber}`,
            `Vapi voice call placed to ${contactName} at ${phoneNumber}: ${callPurpose}`,
            approval.task_id || null,
          ]
        );

        await pool.query(
          `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
          ['call_initiated_vapi', JSON.stringify({
            approval_id: approval.id,
            task_id: approval.task_id,
            phone: phoneNumber,
            call_id: callId,
            vapi_call_id: vapiCallData.id,
          })]
        );

        vapiSuccess = true;
      } catch (vapiError) {
        console.error('Vapi call failed, falling back to Twilio TwiML:', vapiError);
      }
    }

    // ── Fallback: Direct Twilio TwiML (one-way) if Vapi failed or not configured ──
    if (!vapiSuccess) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        throw new Error('Vapi is not configured and Twilio fallback credentials are missing');
      }

      // Use agent settings for identity (no hardcoded values)
      const fallbackSettingsRes = await pool.query(
        `SELECT key, value FROM settings WHERE key IN ('agent_identity', 'owner_name', 'user_name')`
      );
      const fbMap: Record<string, string> = {};
      for (const row of fallbackSettingsRes.rows as { key: string; value: string }[]) {
        fbMap[row.key] = typeof row.value === 'string' ? row.value.replace(/^"|"$/g, '') : String(row.value);
      }
      const agentIdentity = fbMap['agent_identity'] || 'the assistant';
      const fbOwnerName = fbMap['owner_name'] || fbMap['user_name'] || 'the business owner';
      const twiml = `<Response><Say voice="alice">Hello, this is ${agentIdentity}, calling on behalf of ${fbOwnerName}. ${callPurpose.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}. Thank you for your time. Goodbye.</Say><Pause length="1"/><Hangup/></Response>`;

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
      const params = new URLSearchParams();
      params.append('To', phoneNumber);
      params.append('From', fromNumber);
      params.append('Twiml', twiml);
      params.append('Record', 'true');
      params.append('StatusCallbackEvent', 'initiated ringing answered completed');
      params.append('StatusCallbackMethod', 'POST');

      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const callData = await response.json();

      if (!response.ok) {
        throw new Error(callData.message || `Twilio error: ${response.status}`);
      }

      // Create call record
      await pool.query(
        `INSERT INTO calls (twilio_call_sid, task_id, direction, phone_number, caller_name, status, summary, created_at)
         VALUES ($1, $2, 'outbound', $3, $4, 'pending', $5, NOW())`,
        [callData.sid, approval.task_id || null, phoneNumber, contactName, `Fallback TwiML call: ${callPurpose}`]
      );

      // Update task status if linked
      if (approval.task_id) {
        await pool.query(
          "UPDATE tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1",
          [approval.task_id]
        );
      }

      // Success notification
      await pool.query(
        `INSERT INTO notifications (type, title, message, related_task_id)
         VALUES ('call_completed', $1, $2, $3)`,
        [
          `Call initiated to ${phoneNumber}`,
          `Voice call placed to ${phoneNumber}: ${callPurpose}. Call SID: ${callData.sid}. (Twilio direct fallback)`,
          approval.task_id || null,
        ]
      );

      await pool.query(
        `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
        ['call_initiated_twilio_fallback', JSON.stringify({ approval_id: approval.id, task_id: approval.task_id, phone: phoneNumber, twilio_sid: callData.sid })]
      );
    }

  } catch (error) {
    console.error('Failed to execute approved call:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';

    // ── Retry logic: schedule retry if attempts remain ──
    try {
      const retryRes = await pool.query(
        `SELECT COALESCE((details->>'retry_count')::int, 0) as retry_count
         FROM agent_logs WHERE action = 'call_initiation' AND details->>'approval_id' = $1
         ORDER BY created_at DESC LIMIT 1`,
        [approval.id]
      );
      const retryCount = retryRes.rows[0]?.retry_count || 0;
      const maxRetries = 3;

      if (retryCount < maxRetries) {
        const retryDelays = [5 * 60000, 15 * 60000, 30 * 60000]; // 5min, 15min, 30min
        const delay = retryDelays[retryCount] || 30 * 60000;

        await pool.query(
          `INSERT INTO agent_logs (action, details, status, error_message) VALUES ($1, $2, 'pending', $3)`,
          ['call_retry_scheduled', JSON.stringify({ approval_id: approval.id, task_id: approval.task_id, retry_count: retryCount + 1, max_retries: maxRetries, retry_in_ms: delay }), errMsg]
        );

        await pool.query(
          `INSERT INTO notifications (type, title, message, related_task_id)
           VALUES ('warning', $1, $2, $3)`,
          [
            `Call failed — retry ${retryCount + 1}/${maxRetries} scheduled`,
            `Call to ${approval.notes || 'unknown'} failed: ${errMsg}. Retrying in ${delay / 60000} minutes.`,
            approval.task_id || null,
          ]
        );

        // Schedule retry via setTimeout (in-process)
        setTimeout(() => {
          executeApprovedCall(approval).catch(console.error);
        }, delay);
      } else {
        // Max retries exhausted — escalate to user
        await pool.query(
          `INSERT INTO notifications (type, title, message, related_task_id)
           VALUES ('error', $1, $2, $3)`,
          [
            `Call failed — all retries exhausted`,
            `Failed to place call after ${maxRetries} attempts. Last error: ${errMsg}. Please try manually or check the phone number.`,
            approval.task_id || null,
          ]
        );

        if (approval.task_id) {
          await pool.query(
            "UPDATE tasks SET status = 'failed', updated_at = NOW() WHERE id = $1",
            [approval.task_id]
          );
        }
      }
    } catch (retryError) {
      console.error('Retry scheduling failed:', retryError);
    }

    await pool.query(
      `INSERT INTO agent_logs (action, details, status, error_message) VALUES ($1, $2, 'failure', $3)`,
      ['call_initiation', JSON.stringify({ approval_id: approval.id, task_id: approval.task_id }), errMsg]
    ).catch(() => {});
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, status, notes } = await request.json();

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    // Get the admin user for approved_by
    const userResult = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );
    const approvedBy = userResult.rows[0]?.id || null;

    const result = await pool.query(
      `UPDATE approvals 
       SET status = $1, approved_at = NOW(), approved_by = $2, notes = COALESCE($3, notes)
       WHERE id = $4
       RETURNING *`,
      [status, approvedBy, notes || null, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
    }

    const approval = result.rows[0];

    // If approved, execute the action
    if (status === 'approved') {
      // Update linked task status if present
      if (approval.task_id) {
        await pool.query(
          "UPDATE tasks SET status = 'approved', updated_at = NOW() WHERE id = $1",
          [approval.task_id]
        );
      }

      // If this is a make_call approval, actually initiate the call
      if (approval.action_type === 'make_call') {
        // Fire-and-forget: initiate the call in the background
        executeApprovedCall(approval).catch((err) => {
          console.error('Background call initiation failed:', err);
        });
      }

      // Also trigger OpenClaw webhook for non-call actions with linked tasks
      if (approval.action_type !== 'make_call' && approval.task_id) {
        try {
          const taskResult = await pool.query('SELECT title FROM tasks WHERE id = $1', [approval.task_id]);
          const taskTitle = taskResult.rows[0]?.title || 'Unknown task';
          
          const hookToken = process.env.OPENCLAW_HOOK_TOKEN;
          if (hookToken) {
            const agentCtx = await getAgentContext();
            const contextBlock = formatContextForHook(agentCtx);

            await fetch(`${process.env.OPENCLAW_URL || 'http://127.0.0.1:18789'}/hooks/agent`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${hookToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: `Execute approved task: ${taskTitle}. Task ID: ${approval.task_id}. Action type: ${approval.action_type}.\n\n${contextBlock}`,
                name: `Approved: ${taskTitle}`,
                deliver: true,
              }),
            });
          }
        } catch (hookError) {
          console.error('Failed to trigger OpenClaw hook:', hookError);
        }
      }
    }

    // If rejected, update the related task status
    if (status === 'rejected' && approval.task_id) {
      await pool.query(
        "UPDATE tasks SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
        [approval.task_id]
      );
    }

    // Send email notification for approval status change
    try {
      let taskTitle = 'Call request';
      let taskType = approval.action_type;

      if (approval.task_id) {
        const taskResult = await pool.query('SELECT title, type FROM tasks WHERE id = $1', [approval.task_id]);
        taskTitle = taskResult.rows[0]?.title || taskTitle;
        taskType = taskResult.rows[0]?.type || taskType;
      } else if (approval.notes) {
        taskTitle = approval.notes;
      }

      await notifyOwner(
        `${status === 'approved' ? 'Approved' : 'Rejected'}: ${taskTitle}`,
        `"${taskTitle}" (${taskType}) has been ${status}.\n\nAction type: ${approval.action_type}\n${notes ? `Notes: ${notes}` : ''}\n\nView in dashboard: https://gloura.me/tasks`,
        `<h3>${status === 'approved' ? '✅ Approved' : '❌ Rejected'}: ${taskTitle}</h3>
         <p><strong>Type:</strong> ${taskType}</p>
         <p><strong>Action:</strong> ${approval.action_type}</p>
         ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
         <p><a href="https://gloura.me/tasks">View in Dashboard</a></p>`
      );
    } catch (emailErr) {
      console.error('Failed to send approval email:', emailErr);
    }

    return NextResponse.json(approval);
  } catch (error) {
    console.error('Update approval error:', error);
    return NextResponse.json({ error: 'Failed to update approval' }, { status: 500 });
  }
}
