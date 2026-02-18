import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { notifyOwner } from '@/lib/email';

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT a.*, t.title as task_title, c.phone_number
       FROM approvals a
       LEFT JOIN tasks t ON a.task_id = t.id
       LEFT JOIN calls c ON a.call_id = c.id
       WHERE a.status = 'pending'
       ORDER BY a.created_at ASC`
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Approvals API error:', error);
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 });
  }
}

// Initiate an actual call via Twilio when a make_call approval is granted
async function executeApprovedCall(approval: { id: string; task_id: string; notes: string }) {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio credentials not configured');
    }

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
      // No phone number available — log and skip actual call but don't fail
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

    // Get task info for the call message
    const taskRes = await pool.query('SELECT title, contact_name, description FROM tasks WHERE id = $1', [approval.task_id]);
    const task = taskRes.rows[0];
    const contactName = task?.contact_name || 'the contact';

    // Build TwiML with the agent's introduction and purpose
    const agentIdentity = 'Mr. Ermakov';
    const twiml = `<Response><Say voice="alice">Hello, this is ${agentIdentity} calling on behalf of our office. ${callPurpose.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}. Thank you for your time. Goodbye.</Say><Pause length="1"/><Hangup/></Response>`;

    // Place call via Twilio
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

    // Create call record in database
    await pool.query(
      `INSERT INTO calls (twilio_call_sid, task_id, direction, phone_number, caller_name, status, summary, created_at)
       VALUES ($1, $2, 'outbound', $3, $4, 'pending', $5, NOW())`,
      [callData.sid, approval.task_id, phoneNumber, contactName, callPurpose]
    );

    // Update task status
    await pool.query(
      "UPDATE tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1",
      [approval.task_id]
    );

    // Create success notification
    await pool.query(
      `INSERT INTO notifications (type, title, message, related_task_id)
       VALUES ('call_completed', $1, $2, $3)`,
      [
        `Call initiated to ${contactName}`,
        `Call placed to ${phoneNumber} for task "${task?.title || 'Unknown'}". Call SID: ${callData.sid}`,
        approval.task_id,
      ]
    );

    // Log success
    await pool.query(
      `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
      ['call_initiated', JSON.stringify({ approval_id: approval.id, task_id: approval.task_id, phone: phoneNumber, twilio_sid: callData.sid })]
    );

  } catch (error) {
    console.error('Failed to execute approved call:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';

    await pool.query(
      `INSERT INTO agent_logs (action, details, status, error_message) VALUES ($1, $2, 'failure', $3)`,
      ['call_initiation', JSON.stringify({ approval_id: approval.id, task_id: approval.task_id }), errMsg]
    ).catch(() => {});

    await pool.query(
      `INSERT INTO notifications (type, title, message, related_task_id)
       VALUES ('error', 'Call failed', $1, $2)`,
      [`Failed to place call: ${errMsg}`, approval.task_id]
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
        `Task "${taskTitle}" (${taskType}) has been ${status}.\n\nAction type: ${approval.action_type}\n${notes ? `Notes: ${notes}` : ''}\n\nView in dashboard: https://76.13.40.146/tasks`,
        `<h3>Task ${status === 'approved' ? '✅ Approved' : '❌ Rejected'}: ${taskTitle}</h3>
         <p><strong>Type:</strong> ${taskType}</p>
         <p><strong>Action:</strong> ${approval.action_type}</p>
         ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
         <p><a href="https://76.13.40.146/tasks">View in Dashboard</a></p>`
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
