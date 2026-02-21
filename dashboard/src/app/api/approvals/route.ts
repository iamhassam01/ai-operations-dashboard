import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { notifyOwner } from '@/lib/email';

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

// Initiate a multi-turn voice call via OpenClaw Voice Call Plugin
// Falls back to direct Twilio TwiML if OpenClaw is unreachable
async function executeApprovedCall(approval: { id: string; task_id: string; notes: string }) {
  try {
    // Extract phone number from approval notes or task
    let phoneNumber: string | null = null;
    let callPurpose = 'Approved call';

    // Try to extract from notes (format: "Call X at +number: purpose")
    if (approval.notes) {
      const phoneMatch = approval.notes.match(/\+[1-9]\d{6,14}/);
      if (phoneMatch) phoneNumber = phoneMatch[0];
      callPurpose = approval.notes;
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

    // Get task info for the call context
    const taskRes = await pool.query('SELECT title, contact_name, description FROM tasks WHERE id = $1', [approval.task_id]);
    const task = taskRes.rows[0];
    const contactName = task?.contact_name || 'the contact';

    // ── Try OpenClaw Voice Call Plugin first (multi-turn conversations) ──
    const openclawUrl = process.env.OPENCLAW_URL || 'http://127.0.0.1:18789';
    const hookToken = process.env.OPENCLAW_HOOK_TOKEN;
    let openclawSuccess = false;

    if (hookToken) {
      try {
        const agentMessage = `You have been approved to make a phone call. Use the voice_call tool to initiate a multi-turn conversation.

CALL DETAILS:
- Phone number: ${phoneNumber}
- Contact: ${contactName}
- Purpose: ${callPurpose}
- Task: ${task?.title || 'Unknown task'}
- Task ID: ${approval.task_id}

INSTRUCTIONS:
1. Use voice_call with action "initiate_call" to call ${phoneNumber} in "conversation" mode
2. Introduce yourself as Mr. Ermakov, calling on behalf of Ivan Korn
3. Explain the purpose: ${callPurpose}
4. Have a professional multi-turn conversation
5. When the call is complete, use voice_call with action "end_call"
6. After the call, update the task with call results using the database

Remember: You are Bob. Be professional, warm, and efficient.`;

        const hookRes = await fetch(`${openclawUrl}/hooks/agent`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hookToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: agentMessage,
            name: `Call: ${contactName} — ${task?.title || 'Approved call'}`,
            deliver: 'announce',
            timeoutSeconds: 120,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (hookRes.ok) {
          openclawSuccess = true;

          // Create call record in database
          await pool.query(
            `INSERT INTO calls (task_id, direction, phone_number, caller_name, status, summary, created_at)
             VALUES ($1, 'outbound', $2, $3, 'initiated', $4, NOW())`,
            [approval.task_id, phoneNumber, contactName, `Multi-turn call via OpenClaw: ${callPurpose}`]
          );

          // Update task status
          await pool.query(
            "UPDATE tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1",
            [approval.task_id]
          );

          // Success notification
          await pool.query(
            `INSERT INTO notifications (type, title, message, related_task_id)
             VALUES ('call_completed', $1, $2, $3)`,
            [
              `Call initiated to ${contactName}`,
              `Multi-turn voice call placed to ${phoneNumber} for task "${task?.title || 'Unknown'}". OpenClaw is managing the conversation.`,
              approval.task_id,
            ]
          );

          // Log success
          await pool.query(
            `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
            ['call_initiated_openclaw', JSON.stringify({ approval_id: approval.id, task_id: approval.task_id, phone: phoneNumber, mode: 'conversation' })]
          );
        }
      } catch (hookError) {
        console.error('OpenClaw voice call failed, falling back to Twilio:', hookError);
      }
    }

    // ── Fallback: Direct Twilio TwiML (one-way) if OpenClaw failed ──
    if (!openclawSuccess) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        throw new Error('Neither OpenClaw nor Twilio are configured for voice calls');
      }

      const agentIdentity = 'Mr. Ermakov';
      const twiml = `<Response><Say voice="alice">Hello, this is ${agentIdentity}, calling on behalf of Ivan Korn. ${callPurpose.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}. Thank you for your time. Goodbye.</Say><Pause length="1"/><Hangup/></Response>`;

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
        [callData.sid, approval.task_id, phoneNumber, contactName, `Fallback TwiML call: ${callPurpose}`]
      );

      // Update task status
      await pool.query(
        "UPDATE tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1",
        [approval.task_id]
      );

      // Success notification
      await pool.query(
        `INSERT INTO notifications (type, title, message, related_task_id)
         VALUES ('call_completed', $1, $2, $3)`,
        [
          `Call initiated to ${contactName}`,
          `One-way call placed to ${phoneNumber} for task "${task?.title || 'Unknown'}". Call SID: ${callData.sid}. Note: OpenClaw was unavailable, used direct Twilio fallback.`,
          approval.task_id,
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
            approval.task_id,
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
            approval.task_id,
          ]
        );

        await pool.query(
          "UPDATE tasks SET status = 'failed', updated_at = NOW() WHERE id = $1",
          [approval.task_id]
        );
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

    // If approved, update the related task status and execute the action
    if (status === 'approved' && approval.task_id) {
      await pool.query(
        "UPDATE tasks SET status = 'approved', updated_at = NOW() WHERE id = $1",
        [approval.task_id]
      );

      // If this is a make_call approval, actually initiate the call via Twilio
      if (approval.action_type === 'make_call') {
        // Fire-and-forget: initiate the call in the background
        executeApprovedCall(approval).catch((err) => {
          console.error('Background call initiation failed:', err);
        });
      }

      // Also trigger OpenClaw webhook for any other action processing
      try {
        const taskResult = await pool.query('SELECT title FROM tasks WHERE id = $1', [approval.task_id]);
        const taskTitle = taskResult.rows[0]?.title || 'Unknown task';
        
        await fetch(`${process.env.OPENCLAW_URL || 'http://127.0.0.1:18789'}/hooks/agent`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENCLAW_HOOK_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Execute approved task: ${taskTitle}. Task ID: ${approval.task_id}. Action type: ${approval.action_type}.`,
            name: `Approved: ${taskTitle}`,
          }),
        });
      } catch (hookError) {
        console.error('Failed to trigger OpenClaw hook:', hookError);
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
      const taskResult = await pool.query('SELECT title, type FROM tasks WHERE id = $1', [approval.task_id]);
      const taskTitle = taskResult.rows[0]?.title || 'Unknown task';
      const taskType = taskResult.rows[0]?.type || 'unknown';

      await notifyOwner(
        `Task ${status === 'approved' ? 'Approved' : 'Rejected'}: ${taskTitle}`,
        `Task "${taskTitle}" (${taskType}) has been ${status}.\n\nAction type: ${approval.action_type}\n${notes ? `Notes: ${notes}` : ''}\n\nView in dashboard: https://gloura.me/tasks`,
        `<h3>Task ${status === 'approved' ? '✅ Approved' : '❌ Rejected'}: ${taskTitle}</h3>
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
