import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// Max retry attempts for no-answer/busy outbound calls
const MAX_CALL_RETRIES = 3;

export async function POST(request: NextRequest) {
  // Validate Vapi webhook secret if configured
  const vapiSecret = process.env.VAPI_WEBHOOK_SECRET;
  if (vapiSecret) {
    const providedSecret = request.headers.get('x-vapi-secret');
    if (providedSecret !== vapiSecret) {
      console.warn('Vapi webhook rejected: invalid secret header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Vapi sends events nested under a `message` key
  const message = (body.message ?? body) as Record<string, unknown>;
  const eventType = message.type as string | undefined;
  const call = message.call as Record<string, unknown> | undefined;
  const vapiCallId = call?.id as string | undefined;

  if (!eventType) {
    return NextResponse.json({ received: true });
  }

  try {
    switch (eventType) {

      // ── Inbound call: Vapi asks us what assistant config to use ──
      case 'assistant-request': {
        const customer = call?.customer as Record<string, unknown> | undefined;
        const customerNumber = (customer?.number as string) || 'Unknown';

        // Look up caller in contacts table
        let callerName = 'Unknown Caller';
        let linkedTaskId: string | null = null;
        if (customerNumber && customerNumber !== 'Unknown') {
          const contactRes = await pool.query(
            'SELECT name FROM contacts WHERE phone_number = $1 LIMIT 1',
            [customerNumber]
          );
          if (contactRes.rows.length > 0 && contactRes.rows[0].name) {
            callerName = contactRes.rows[0].name;
          }
          // Auto-link to most recent active task with this phone number
          const taskRes = await pool.query(
            `SELECT id, title, description FROM tasks
             WHERE contact_phone = $1 AND status NOT IN ('completed', 'cancelled', 'closed')
             ORDER BY created_at DESC LIMIT 1`,
            [customerNumber]
          );
          if (taskRes.rows.length > 0) {
            linkedTaskId = taskRes.rows[0].id;
          }
        }

        // Create inbound call record in DB
        const callInsert = await pool.query(
          `INSERT INTO calls (task_id, direction, phone_number, caller_name, status, vapi_call_id, started_at, created_at)
           VALUES ($1, 'inbound', $2, $3, 'in_progress', $4, NOW(), NOW())
           RETURNING id`,
          [linkedTaskId, customerNumber, callerName, vapiCallId || null]
        );
        const inboundCallId = callInsert.rows[0]?.id;

        // Log event
        if (inboundCallId) {
          await pool.query(
            `INSERT INTO call_logs (call_id, event_type, event_data, created_at)
             VALUES ($1, 'inbound_received', $2, NOW())`,
            [inboundCallId, JSON.stringify({ from: customerNumber, caller_name: callerName, vapi_call_id: vapiCallId })]
          );
        }

        // Create notification
        await pool.query(
          `INSERT INTO notifications (type, title, message, related_call_id, related_task_id)
           VALUES ('call_completed', $1, $2, $3, $4)`,
          [
            `Inbound call from ${callerName}`,
            `Incoming call from ${customerNumber}. ${callerName !== 'Unknown Caller' ? `Contact: ${callerName}` : 'Unknown contact.'}`,
            inboundCallId || null,
            linkedTaskId,
          ]
        );

        // Fetch agent identity + office hours + task context for system prompt
        const settingsRes = await pool.query(
          `SELECT key, value FROM settings WHERE key IN ('agent_name', 'owner_name', 'agent_identity', 'business_name', 'operating_hours_start', 'operating_hours_end', 'timezone', 'office_hours')`
        );
        const sMap: Record<string, string> = {};
        for (const row of settingsRes.rows as { key: string; value: string }[]) {
          sMap[row.key] = typeof row.value === 'string' ? row.value.replace(/^"|"$/g, '') : String(row.value);
        }
        const agentName = sMap['agent_name'] || 'Alex';
        const ownerName = sMap['owner_name'] || 'the business owner';
        const agentIdentity = sMap['agent_identity'] || agentName;
        const businessName = sMap['business_name'] || '';

        // Build task context if linked
        let taskContext = '';
        if (linkedTaskId) {
          const taskRes = await pool.query('SELECT title, description, status FROM tasks WHERE id = $1', [linkedTaskId]);
          if (taskRes.rows[0]) {
            const t = taskRes.rows[0];
            taskContext = `\n\nCONTEXT: This caller has an active task: "${t.title}". Task description: ${t.description || 'N/A'}. Current status: ${t.status}. Use this context to understand why they may be calling and provide relevant assistance.`;
          }
        }

        const inboundSystemPrompt = `You are ${agentIdentity}, a professional AI executive assistant for ${ownerName}${businessName ? ` at ${businessName}` : ''}.

You are answering an INBOUND phone call from ${callerName !== 'Unknown Caller' ? callerName : 'an unknown caller'}.

YOUR ROLE: You are answering the phone on behalf of ${ownerName}. Be professional, warm, and helpful. Listen carefully to what the caller needs and collect all relevant information.${taskContext}

LANGUAGE - STRICT RULE: You MUST speak ONLY in English for the ENTIRE call, regardless of what language the caller uses. If the caller cannot speak English: "I apologize, I am only able to assist in English. Is there someone available who speaks English? No? Thank you, have a great day." Then end the call.

WHAT TO DO:
1. Greet the caller professionally.
2. Listen carefully to understand why they are calling.
3. Collect key information: their name (if unknown), purpose of call, any specific details (pricing, dates, availability, questions).
4. If they are a supplier or service provider calling back: collect their offer details (price, availability, scope, warranty, payment methods).
5. If they ask questions you cannot answer: note the questions and let them know someone will get back to them.
6. Thank them and end the call professionally.

ABSOLUTE RULES:
- NEVER make up information or commitments on behalf of ${ownerName}.
- NEVER share internal details, task IDs, or system information.
- Speak in 1-3 short sentences per turn. Warm, natural, professional.
- If a question is outside your knowledge, say: "I will make sure ${ownerName} gets your message and follows up with you."

CLOSING: "Thank you so much for calling. ${ownerName} will follow up with you shortly. Have a wonderful day! Goodbye."`;

        // Return assistant config for inbound call
        return NextResponse.json({
          assistant: {
            name: `Inbound: ${callerName}`,
            model: {
              provider: 'openai',
              model: 'gpt-4o',
              temperature: 0.6,
              maxTokens: 200,
              messages: [{ role: 'system', content: inboundSystemPrompt }],
            },
            transcriber: { provider: 'deepgram', model: 'nova-2', language: 'en' },
            voice: { provider: 'openai', voiceId: 'shimmer' },
            firstMessage: `Hello, thank you for calling${businessName ? ` ${businessName}` : ''}. This is ${agentIdentity} speaking. How can I help you today?`,
            recordingEnabled: true,
            endCallFunctionEnabled: true,
          },
        });
      }

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

        // For inbound calls, the record may already exist (from assistant-request).
        // For outbound calls, it was created in executeApprovedCall.
        // If no record exists yet (edge case), create one.
        const existingCall = await pool.query(
          `SELECT id FROM calls WHERE vapi_call_id = $1`,
          [vapiCallId]
        );
        if (existingCall.rows.length > 0) {
          await pool.query(
            `UPDATE calls SET status = $1 WHERE vapi_call_id = $2`,
            [dbStatus, vapiCallId]
          );
        } else {
          // Unknown call — create a record (inbound that bypassed assistant-request)
          const customer = call?.customer as Record<string, unknown> | undefined;
          const customerNumber = (customer?.number as string) || 'Unknown';
          const callType = call?.type as string | undefined;
          const direction = callType === 'inboundPhoneCall' ? 'inbound' : 'outbound';

          await pool.query(
            `INSERT INTO calls (direction, phone_number, caller_name, status, vapi_call_id, started_at, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
            [direction, customerNumber, 'Unknown', dbStatus, vapiCallId]
          );
        }
        break;
      }

      case 'end-of-call-report': {
        if (!vapiCallId) break;

        const artifact = message.artifact as Record<string, unknown> | undefined;
        const analysis = message.analysis as Record<string, unknown> | undefined;
        const endedReason = (message.endedReason as string | undefined) ?? '';
        const durationSeconds = message.durationSeconds as number | undefined;

        const transcript = (artifact?.transcript as string | undefined) ?? '';
        const recordingObj = artifact?.recording as Record<string, unknown> | undefined;
        const recordingUrl = (recordingObj?.url as string | undefined) ?? '';
        const summary = (analysis?.summary as string | undefined) ?? '';

        // Map Vapi endedReason to our call status
        let finalStatus = 'completed';
        if (['no-answer', 'voicemail', 'busy', 'no-answer-machine'].includes(endedReason)) {
          finalStatus = 'no_answer';
        } else if (['failed', 'error', 'assistant-error', 'pipeline-error'].includes(endedReason)) {
          finalStatus = 'failed';
        }

        await pool.query(
          `UPDATE calls
           SET status        = $1,
               transcript    = $2,
               summary       = $3,
               recording_url = $4,
               duration_seconds = $5,
               ended_at      = NOW()
           WHERE vapi_call_id = $6`,
          [
            finalStatus,
            transcript || null,
            summary || null,
            recordingUrl || null,
            durationSeconds ?? null,
            vapiCallId,
          ]
        );

        // Fetch the linked task and contact info for notifications
        const callRes = await pool.query(
          `SELECT id, task_id, phone_number, caller_name, direction FROM calls WHERE vapi_call_id = $1`,
          [vapiCallId]
        );

        if (callRes.rows.length > 0) {
          const { id: callId, task_id, phone_number, caller_name, direction } = callRes.rows[0] as {
            id: string;
            task_id: string | null;
            phone_number: string;
            caller_name: string | null;
            direction: string;
          };

          // Update linked task status
          if (task_id) {
            if (finalStatus === 'completed') {
              await pool.query(
                `UPDATE tasks SET status = 'completed', updated_at = NOW() WHERE id = $1`,
                [task_id]
              );
            } else if (finalStatus === 'no_answer' && direction === 'outbound') {
              // Check retry count for this task — create retry approval if under limit
              const retryCountRes = await pool.query(
                `SELECT COUNT(*) as attempt_count FROM calls
                 WHERE task_id = $1 AND direction = 'outbound' AND status IN ('no_answer', 'failed')`,
                [task_id]
              );
              const attemptCount = parseInt(retryCountRes.rows[0]?.attempt_count || '0');

              if (attemptCount < MAX_CALL_RETRIES) {
                // Create a retry approval for the user to approve
                await pool.query(
                  `UPDATE tasks SET status = 'pending_approval', updated_at = NOW() WHERE id = $1`,
                  [task_id]
                );
                // Get task info for the retry approval notes
                const taskInfoRes = await pool.query('SELECT title, contact_phone FROM tasks WHERE id = $1', [task_id]);
                const taskInfo = taskInfoRes.rows[0];
                if (taskInfo?.contact_phone) {
                  await pool.query(
                    `INSERT INTO approvals (task_id, action_type, status, notes)
                     VALUES ($1, 'make_call', 'pending', $2)`,
                    [task_id, `Retry ${attemptCount + 1}/${MAX_CALL_RETRIES}: Call ${taskInfo.contact_phone}: ${taskInfo.title || 'Follow up'}`]
                  );
                }
              } else {
                // Max retries exhausted — escalate to user
                await pool.query(
                  `UPDATE tasks SET status = 'escalated', updated_at = NOW() WHERE id = $1`,
                  [task_id]
                );
                await pool.query(
                  `INSERT INTO notifications (type, title, message, related_task_id)
                   VALUES ('error', $1, $2, $3)`,
                  [
                    `Call failed — all ${MAX_CALL_RETRIES} retries exhausted`,
                    `Could not reach ${caller_name ?? phone_number} after ${MAX_CALL_RETRIES} attempts. Last result: ${endedReason}. Please try calling manually or use a different number.`,
                    task_id,
                  ]
                );
              }
            } else if (finalStatus === 'failed') {
              await pool.query(
                `UPDATE tasks SET status = 'failed', updated_at = NOW() WHERE id = $1`,
                [task_id]
              );
            } else {
              // Inbound no_answer or other — set to pending
              await pool.query(
                `UPDATE tasks SET status = 'pending', updated_at = NOW() WHERE id = $1`,
                [task_id]
              );
            }
          }

          // Create dashboard notification
          const notifType =
            finalStatus === 'completed'
              ? 'call_completed'
              : finalStatus === 'no_answer'
              ? 'call_completed'
              : 'error';

          const dirLabel = direction === 'inbound' ? 'Inbound call' : 'Call';
          const notifTitle =
            finalStatus === 'completed'
              ? `${dirLabel} completed — ${caller_name ?? phone_number}`
              : finalStatus === 'no_answer'
              ? `${dirLabel} unanswered — ${phone_number}`
              : `${dirLabel} failed — ${phone_number}`;

          const notifMessage = summary
            ? summary
            : `${dirLabel} ${direction === 'inbound' ? 'from' : 'to'} ${caller_name ?? phone_number} ended. Reason: ${endedReason || 'unknown'}. Duration: ${durationSeconds ?? 0}s.`;

          await pool.query(
            `INSERT INTO notifications (type, title, message, related_task_id, related_call_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [notifType, notifTitle, notifMessage, task_id ?? null, callId]
          );

          // Agent activity log
          await pool.query(
            `INSERT INTO agent_logs (action, details, status)
             VALUES ($1, $2, $3)`,
            [
              'call_completed_vapi',
              JSON.stringify({
                vapi_call_id: vapiCallId,
                direction,
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
        // Unexpected hangup before end-of-call-report fires
        if (!vapiCallId) break;
        await pool.query(
          `UPDATE calls
           SET status = 'failed',
               ended_at = NOW(),
               summary = 'Call ended unexpectedly'
           WHERE vapi_call_id = $1 AND status = 'in_progress'`,
          [vapiCallId]
        );
        break;
      }

      // transcript events are streaming partials — no DB action needed
      // tool-calls events are async tool invocations — not used currently
      default:
        break;
    }
  } catch (error) {
    console.error('Vapi webhook processing error:', error);
    // Always return 200 — Vapi retries on non-2xx responses
  }

  return NextResponse.json({ received: true });
}
