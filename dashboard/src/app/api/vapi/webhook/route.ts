import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { createEvent, isCalendarConnected } from '@/lib/google-calendar';

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
          `SELECT key, value FROM settings WHERE key IN ('agent_name', 'owner_name', 'user_name', 'agent_identity', 'business_name', 'operating_hours_start', 'operating_hours_end', 'timezone', 'office_hours')`
        );
        const sMap: Record<string, string> = {};
        for (const row of settingsRes.rows as { key: string; value: string }[]) {
          sMap[row.key] = typeof row.value === 'string' ? row.value.replace(/^"|"$/g, '') : String(row.value);
        }
        const agentName = sMap['agent_name'] || 'Alex';
        const ownerName = sMap['owner_name'] || sMap['user_name'] || 'the business owner';
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

        const inboundSystemPrompt = `You are ${agentIdentity}, ${ownerName}'s personal assistant${businessName ? ` at ${businessName}` : ''}. You're a real person as far as the caller is concerned — warm, friendly, and genuinely helpful. Think of yourself as the kind of assistant who makes people smile.

You're picking up an inbound call from ${callerName !== 'Unknown Caller' ? callerName : 'someone you don\'t know yet'}.

YOUR VIBE: You're naturally conversational — not scripted, not robotic. Use casual-professional language. It's okay to be lighthearted, crack a small joke if it fits the moment, or show genuine interest in what the caller is saying. But always stay professional when the topic is serious.${taskContext}

LANGUAGE RULE: Speak ONLY in English. If the caller can't speak English: "Oh, I'm sorry — I can only help in English. Is there someone nearby who speaks English? No worries if not — thank you for calling, and have a great day!" Then end the call.

HOW TO HANDLE THE CALL:
1. You've already greeted them with your first message — now just listen and be helpful.
2. Figure out why they're calling. Ask natural follow-up questions.
3. Get what you need: their name if you don't have it, what they need, any specifics like pricing, dates, availability.
4. If they're a supplier or vendor calling back: get their offer details — price, availability, scope, timeline, payment terms.
5. If you don't know an answer: "That's a great question — let me make sure ${ownerName} gets back to you on that."
6. Wrap up warmly and naturally.

KEEP IN MIND:
- NEVER make up information or fake commitments.
- NEVER mention task IDs, system details, or anything internal.
- Keep your responses short — 1 to 3 sentences per turn. Sound like a human, not a chatbot.
- When in doubt: "I'll make sure ${ownerName} knows about this and follows up with you personally."

MEETING BOOKING:
- If the caller wants to schedule a meeting or appointment with ${ownerName}, use the book_meeting function.
- Ask for their preferred date, time, and what the meeting is about.
- Confirm the details before booking: "So I'll book that for [date] at [time] — a meeting about [topic]. Sound good?"
- After booking: "Perfect, that's all set! ${ownerName} will see it on the calendar."

WRAPPING UP: "Thanks so much for calling! ${ownerName} will be in touch with you soon. Have an awesome day!"`;

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://gloura.me';
        // Return assistant config for inbound call
        return NextResponse.json({
          assistant: {
            name: `Inbound: ${callerName}`,
            model: {
              provider: 'openai',
              model: 'gpt-4o',
              temperature: 0.7,
              maxTokens: 250,
              messages: [{ role: 'system', content: inboundSystemPrompt }],
              functions: [
                {
                  name: 'book_meeting',
                  description: 'Book a meeting or appointment on the calendar. Use this when the caller wants to schedule a meeting.',
                  parameters: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: 'Brief title for the meeting' },
                      date: { type: 'string', description: 'Meeting date in YYYY-MM-DD format' },
                      time: { type: 'string', description: 'Start time in HH:MM format (24-hour)' },
                      duration_minutes: { type: 'number', description: 'Duration in minutes, default 60' },
                      attendee_name: { type: 'string', description: 'Name of the person requesting the meeting' },
                      notes: { type: 'string', description: 'Additional notes or purpose of the meeting' },
                    },
                    required: ['title', 'date', 'time'],
                  },
                },
              ],
            },
            transcriber: { provider: 'deepgram', model: 'nova-2', language: 'en' },
            voice: { provider: 'vapi', voiceId: 'Elliot' },
            firstMessage: `Hi! This is ${agentIdentity}, ${ownerName}'s personal assistant. How can I help you?`,
            serverUrl: `${baseUrl}/api/vapi/webhook`,
            recordingEnabled: true,
            endCallFunctionEnabled: true,
            analysisPlan: {
              summaryPlan: {
                enabled: true,
                messages: [{ role: 'system', content: 'Summarize this phone call in 2-3 concise sentences. Focus on: who called, what they wanted, key information shared, and any follow-up actions needed.' }],
              },
            },
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
        const callObj = call as Record<string, unknown> | undefined;
        const endedReason = (message.endedReason as string | undefined) ?? '';
        const durationSeconds = message.durationSeconds as number | undefined;

        // Extract transcript from multiple paths (webhook artifact OR call object)
        let transcript =
          (artifact?.transcript as string | undefined) ??
          (callObj?.transcript as string | undefined) ??
          '';

        // Extract recording URL from ALL possible Vapi structures:
        // - artifact.recordingUrl (legacy top-level)
        // - artifact.stereoRecordingUrl (legacy stereo)
        // - artifact.recording.mono.combinedUrl (new nested structure)
        // - artifact.recording.stereoUrl (new nested stereo)
        // - artifact.recording.url (simplified)
        // - artifact.recording (if string)
        // - call.recordingUrl (call object level)
        const artifactRecording = artifact?.recording as Record<string, unknown> | string | undefined;
        const monoRecording = (typeof artifactRecording === 'object' && artifactRecording !== null)
          ? artifactRecording.mono as Record<string, unknown> | undefined
          : undefined;
        let recordingUrl =
          (artifact?.recordingUrl as string | undefined) ??
          (monoRecording?.combinedUrl as string | undefined) ??
          (typeof artifactRecording === 'string' ? artifactRecording : undefined) ??
          (typeof artifactRecording === 'object' && artifactRecording !== null ? (artifactRecording.url as string | undefined) : undefined) ??
          (typeof artifactRecording === 'object' && artifactRecording !== null ? (artifactRecording.stereoUrl as string | undefined) : undefined) ??
          (artifact?.stereoRecordingUrl as string | undefined) ??
          (callObj?.recordingUrl as string | undefined) ??
          (callObj?.stereoRecordingUrl as string | undefined) ??
          '';

        // Extract summary from multiple paths
        let summary =
          (analysis?.summary as string | undefined) ??
          (callObj?.summary as string | undefined) ??
          '';

        // Log raw data for debugging
        console.log(`[Vapi end-of-call-report] callId=${vapiCallId} transcript=${transcript.length}chars recording=${recordingUrl ? 'yes' : 'no'} summary=${summary.length}chars endedReason=${endedReason}`);

        // ── Vapi API backup fetch: if critical data is missing, fetch directly from Vapi ──
        if (!transcript || !recordingUrl) {
          const vapiApiKey = process.env.VAPI_API_KEY;
          if (vapiApiKey) {
            try {
              console.log(`[Vapi backup fetch] Fetching call data from Vapi API for ${vapiCallId}...`);
              const vapiRes = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
                headers: { 'Authorization': `Bearer ${vapiApiKey}` },
                signal: AbortSignal.timeout(10000),
              });
              if (vapiRes.ok) {
                const vapiCall = await vapiRes.json() as Record<string, unknown>;
                if (!transcript && vapiCall.transcript) {
                  transcript = vapiCall.transcript as string;
                  console.log(`[Vapi backup fetch] Got transcript: ${transcript.length} chars`);
                }
                if (!recordingUrl && vapiCall.recordingUrl) {
                  recordingUrl = vapiCall.recordingUrl as string;
                  console.log(`[Vapi backup fetch] Got recordingUrl`);
                }
                if (!recordingUrl) {
                  const vapiArtifact = vapiCall.artifact as Record<string, unknown> | undefined;
                  const vapiRecording = vapiArtifact?.recording as Record<string, unknown> | string | undefined;
                  if (typeof vapiRecording === 'string') recordingUrl = vapiRecording;
                  else if (vapiRecording && typeof vapiRecording === 'object') {
                    const mono = vapiRecording.mono as Record<string, unknown> | undefined;
                    recordingUrl = (mono?.combinedUrl as string) ?? (vapiRecording.url as string) ?? (vapiRecording.stereoUrl as string) ?? '';
                  }
                  // Also try top-level artifact fields
                  if (!recordingUrl) recordingUrl = (vapiArtifact?.recordingUrl as string) ?? (vapiArtifact?.stereoRecordingUrl as string) ?? '';
                }
                if (!summary && vapiCall.summary) {
                  summary = vapiCall.summary as string;
                }
                if (!summary && vapiCall.analysis) {
                  summary = ((vapiCall.analysis as Record<string, unknown>).summary as string) ?? '';
                }
              } else {
                console.error(`[Vapi backup fetch] Failed: ${vapiRes.status}`);
              }
            } catch (fetchErr) {
              console.error('[Vapi backup fetch] Error:', fetchErr);
            }
          }
        }

        // Map Vapi endedReason to our call status
        let finalStatus = 'completed';
        if (['no-answer', 'voicemail', 'busy', 'no-answer-machine'].includes(endedReason)) {
          finalStatus = 'no_answer';
        } else if (['failed', 'error', 'assistant-error', 'pipeline-error'].includes(endedReason)) {
          finalStatus = 'failed';
        }

        // ── Auto-generate summary from transcript if Vapi didn't provide one ──
        if (!summary && transcript && transcript.length > 20) {
          const lines = transcript.split('\n').filter((l: string) => l.trim());
          const keyPoints: string[] = [];
          for (const line of lines) {
            const stripped = line.replace(/^(AI|User|Bot|Assistant|Customer):\s*/i, '').trim();
            if (stripped.length > 15 && !stripped.match(/^(hi|hello|hey|goodbye|bye|thank|thanks|okay|ok|yes|no|sure|alright)\b/i)) {
              keyPoints.push(stripped);
            }
          }
          if (keyPoints.length > 0) {
            summary = keyPoints.slice(0, 3).join('. ');
            if (summary.length > 300) summary = summary.substring(0, 297) + '...';
          }
        }

        // ── Extract captured_info from transcript ──
        let capturedInfo: Record<string, string> = {};
        if (transcript && transcript.length > 10) {
          // Extract names mentioned by the customer (User/Customer lines)
          const customerLines = transcript.split('\n')
            .filter((l: string) => /^(User|Customer):/i.test(l.trim()))
            .map((l: string) => l.replace(/^(User|Customer):\s*/i, '').trim());
          const customerText = customerLines.join(' ');

          // Name self-identification: "This is X", "My name is X", "I'm X", "It's X"
          const nameMatch = customerText.match(/(?:this is|my name is|i'?m|i am|it'?s)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/i);
      if (nameMatch && /^[A-Z]/.test(nameMatch[1])) capturedInfo['contact_name'] = nameMatch[1].trim();
          // Time/date mentions
          const timeMatch = customerText.match(/(?:at|around|by|before|after)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|o'?clock)?)/i);
          if (timeMatch) capturedInfo['time_mentioned'] = timeMatch[0].trim();
          const dateMatch = customerText.match(/(?:on|this|next|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*(?:\w+\s+\d{1,2}(?:st|nd|rd|th)?)?/i);
          if (dateMatch && dateMatch[0].length > 4) capturedInfo['date_mentioned'] = dateMatch[0].trim();

          // Availability / response to purpose
          const availMatch = customerText.match(/(?:available|free|busy|not available|can'?t make it|won'?t be|will be|i'?ll be)/i);
          if (availMatch) {
            const ctx = customerText.substring(Math.max(0, customerText.indexOf(availMatch[0]) - 30), customerText.indexOf(availMatch[0]) + availMatch[0].length + 50).trim();
            capturedInfo['availability'] = ctx;
          }

          // Price/cost mentions
          const priceMatch = customerText.match(/(?:\$|€|£|USD|EUR)\s*[\d,]+(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars|euros|per\s+\w+)/i);
          if (priceMatch) capturedInfo['price_mentioned'] = priceMatch[0].trim();

          // Commitments/agreements from full transcript
          const fullText = transcript;
          const commitMatch = fullText.match(/(?:i will|i'?ll|we will|we'?ll|let me|i can|we can|i'?d be happy to|sure|yes|absolutely|definitely)\s+[^.!?\n]{5,60}/gi);
          if (commitMatch && commitMatch.length > 0) {
            capturedInfo['commitments'] = commitMatch.slice(0, 2).join('; ').trim();
          }

          // Call outcome from AI lines
          const aiLines = transcript.split('\n')
            .filter((l: string) => /^(AI|Bot|Assistant):/i.test(l.trim()))
            .map((l: string) => l.replace(/^(AI|Bot|Assistant):\s*/i, '').trim());
          const lastAiLine = aiLines[aiLines.length - 1] || '';
          if (lastAiLine.length > 10) capturedInfo['call_conclusion'] = lastAiLine.substring(0, 200);
        }

        // ── Get customer name from Vapi call data to update caller_name ──
        const vapiCustomer = call?.customer as Record<string, unknown> | undefined;
        const vapiCustomerName = vapiCustomer?.name as string | undefined;
        // Build update SET clause dynamically
        const setClauses = [
          'status = $1', 'transcript = $2', 'summary = $3',
          'recording_url = $4', 'duration_seconds = $5', 'ended_at = NOW()',
        ];
        const updateParams: (string | number | null)[] = [
          finalStatus,
          transcript || null,
          summary || null,
          recordingUrl || null,
          durationSeconds ?? null,
        ];
        let paramIdx = 6;

        // Add captured_info if we extracted anything
        if (Object.keys(capturedInfo).length > 0) {
          setClauses.push(`captured_info = $${paramIdx}`);
          updateParams.push(JSON.stringify(capturedInfo));
          paramIdx++;
        }

        // Update caller_name if we got a real name from Vapi customer or transcript
        const extractedName = capturedInfo['contact_name'] || '';
        const betterName = (vapiCustomerName && vapiCustomerName !== 'the contact' && vapiCustomerName !== 'Unknown')
          ? vapiCustomerName
          : (extractedName || null);
        if (betterName) {
          setClauses.push(`caller_name = CASE WHEN caller_name IS NULL OR caller_name = 'the contact' OR caller_name = 'Unknown' THEN $${paramIdx} ELSE caller_name END`);
          updateParams.push(betterName);
          paramIdx++;
        }

        updateParams.push(vapiCallId);
        await pool.query(
          `UPDATE calls SET ${setClauses.join(', ')} WHERE vapi_call_id = $${paramIdx}`,
          updateParams
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
                // Get original_request and contact_name from the most recent approval for this task
                const prevApprovalRes = await pool.query(
                  `SELECT original_request, contact_name FROM approvals WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1`,
                  [task_id]
                );
                const prevApproval = prevApprovalRes.rows[0];
                if (taskInfo?.contact_phone) {
                  await pool.query(
                    `INSERT INTO approvals (task_id, action_type, status, notes, original_request, contact_name)
                     VALUES ($1, 'make_call', 'pending', $2, $3, $4)`,
                    [task_id, `Retry ${attemptCount + 1}/${MAX_CALL_RETRIES}: Call ${taskInfo.contact_phone}: ${taskInfo.title || 'Follow up'}`, prevApproval?.original_request || null, prevApproval?.contact_name || null]
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

      // ── Tool calls: Vapi function calling (e.g., book_meeting) ──
      case 'tool-calls': {
        // Vapi sends tool calls in multiple possible structures:
        // 1. message.toolCalls[] with { id, type, function: { name, arguments } }
        // 2. message.toolCallList[] or message.toolWithToolCallList[] (legacy)
        const rawToolCalls = (message.toolCalls ?? message.toolCallList ?? message.toolWithToolCallList ?? []) as Array<Record<string, unknown>>;

        const results: Array<{ name: string; toolCallId: string; result: string }> = [];

        for (const item of rawToolCalls) {
          // Extract function name: try item.function.name first (current Vapi format), then item.name (legacy)
          const fn = item.function as { name?: string; arguments?: string } | undefined;
          const toolName = fn?.name || (item.name as string) || '';
          // Extract tool call ID
          const toolCallId = (item.id as string) || (item.toolCall as { id?: string } | undefined)?.id || '';
          // Extract parameters: parse from function.arguments (JSON string) or fallback to item.parameters
          let params: Record<string, unknown> = {};
          if (fn?.arguments) {
            try { params = JSON.parse(fn.arguments); } catch { params = {}; }
          } else if (item.parameters) {
            params = item.parameters as Record<string, unknown>;
          } else if ((item.toolCall as { parameters?: Record<string, unknown> } | undefined)?.parameters) {
            params = (item.toolCall as { parameters: Record<string, unknown> }).parameters;
          }

          if (toolName === 'book_meeting') {
            try {
              const connected = await isCalendarConnected();
              if (!connected) {
                results.push({ name: toolName, toolCallId, result: JSON.stringify({ success: false, error: 'Calendar not connected. Let the caller know you will have the owner follow up to schedule.' }) });
                continue;
              }

              const title = (params.title as string) || 'Meeting';
              const date = params.date as string; // YYYY-MM-DD
              const time = params.time as string; // HH:MM
              const durationMin = (params.duration_minutes as number) || 60;
              const attendeeName = (params.attendee_name as string) || '';
              const notes = (params.notes as string) || '';

              if (!date || !time) {
                results.push({ name: toolName, toolCallId, result: JSON.stringify({ success: false, error: 'Missing date or time' }) });
                continue;
              }

              const startDt = new Date(`${date}T${time}:00`);
              const endDt = new Date(startDt.getTime() + durationMin * 60 * 1000);
              const tz = 'Europe/Prague';

              const event = await createEvent({
                summary: title,
                description: `${notes}${attendeeName ? `\nAttendee: ${attendeeName}` : ''}\n\n[Booked via phone call by AI assistant]`,
                start: { dateTime: startDt.toISOString(), timeZone: tz },
                end: { dateTime: endDt.toISOString(), timeZone: tz },
              });

              // Log the booking
              await pool.query(
                `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
                ['meeting_booked_via_call', JSON.stringify({ event_id: event.id, title, date, time, attendee: attendeeName, vapi_call_id: vapiCallId })]
              );

              // Create notification
              await pool.query(
                `INSERT INTO notifications (type, title, message) VALUES ('info', $1, $2)`,
                [`Meeting booked: ${title}`, `${title} on ${date} at ${time}${attendeeName ? ` with ${attendeeName}` : ''}. Booked during a phone call.`]
              );

              results.push({ name: toolName, toolCallId, result: JSON.stringify({ success: true, event_id: event.id, message: `Meeting "${title}" booked for ${date} at ${time}` }) });
            } catch (err) {
              console.error('[Vapi tool-call] book_meeting error:', err);
              results.push({ name: toolName, toolCallId, result: JSON.stringify({ success: false, error: 'Failed to book meeting. Let the caller know you will have the owner follow up.' }) });
            }
          } else {
            results.push({ name: toolName, toolCallId, result: JSON.stringify({ error: `Unknown function: ${toolName}` }) });
          }
        }

        return NextResponse.json({ results });
      }

      // transcript events are streaming partials — no DB action needed
      default:
        break;
    }
  } catch (error) {
    console.error('Vapi webhook processing error:', error);
    // Always return 200 — Vapi retries on non-2xx responses
  }

  return NextResponse.json({ received: true });
}
