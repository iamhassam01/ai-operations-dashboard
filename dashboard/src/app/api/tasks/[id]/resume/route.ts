import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// ─── Agentic Task Processing ────────────────────────────────────────
// When a task is resumed/continued, this researches the task using GPT-4o,
// updates findings, creates approvals if needed, and sends notifications.

async function processTask(taskId: string) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error('OPENAI_API_KEY not configured');

  const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (taskRes.rows.length === 0) throw new Error('Task not found');
  const task = taskRes.rows[0];

  // Log that we're starting work
  await pool.query(
    `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'pending')`,
    ['task_research_started', JSON.stringify({ task_id: taskId, title: task.title, trigger: 'resume' })]
  );

  // Send a notification that work has started
  await pool.query(
    `INSERT INTO notifications (type, title, message, related_task_id)
     VALUES ('task_update', $1, $2, $3)`,
    [
      `Working on: ${task.title}`,
      `Agent is now researching and processing this task...`,
      taskId,
    ]
  );

  // Look for matching contacts in our database
  const contactSearch = [];
  if (task.contact_name) {
    const res = await pool.query(
      `SELECT * FROM contacts WHERE name ILIKE $1 LIMIT 5`,
      [`%${task.contact_name}%`]
    );
    contactSearch.push(...res.rows);
  }
  if (task.contact_phone) {
    const res = await pool.query(
      `SELECT * FROM contacts WHERE phone_number = $1 LIMIT 1`,
      [task.contact_phone]
    );
    contactSearch.push(...res.rows);
  }

  const contactContext = contactSearch.length > 0
    ? `\nMatching contacts found in database:\n${contactSearch.map((c: { name: string; phone_number: string; company: string; notes: string }) => `- ${c.name}: ${c.phone_number}${c.company ? ` (${c.company})` : ''}${c.notes ? ` — ${c.notes}` : ''}`).join('\n')}`
    : '\nNo matching contacts found in database.';

  // Use GPT-4o to research and plan next steps
  const researchResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a research assistant for an AI operations agent. Your job is to research a task and provide actionable findings.

Given a task, you should:
1. Analyze what needs to be done
2. Identify the key steps required
3. Find relevant information (contacts, businesses, options, pricing, considerations)
4. Provide a clear recommendation with next steps
5. If a phone call would help, indicate who to call and why

Be specific and practical. Provide real suggestions based on the task type.
Keep your response concise but thorough (300-400 words max).

IMPORTANT: At the end of your response, include a JSON block for the recommended next action:
<next_action>{"needs_call": true/false, "call_to": "name or business", "call_phone": "+number or null", "call_purpose": "reason", "summary": "1-sentence summary of findings"}</next_action>`
        },
        {
          role: 'user',
          content: `Research this task and provide findings:\n\nTitle: ${task.title}\nType: ${task.type}\nPriority: ${task.priority}\nDescription: ${task.description || 'No description provided'}\nContact: ${task.contact_name || 'Not specified'}\nPhone: ${task.contact_phone || 'Not specified'}\nAddress: ${task.address || 'Not specified'}\nConstraints: ${task.constraints || 'None'}\nPreferred times: ${task.preferred_time_1 || 'Flexible'}${contactContext}`
        }
      ],
      temperature: 0.7,
      max_tokens: 800,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!researchResponse.ok) {
    throw new Error(`OpenAI research failed: ${researchResponse.status}`);
  }

  const researchData = await researchResponse.json();
  const researchContent = researchData.choices?.[0]?.message?.content || '';

  // Parse next action recommendation
  let nextAction = { needs_call: false, call_to: '', call_phone: '', call_purpose: '', summary: '' };
  const nextActionMatch = researchContent.match(/<next_action>([\s\S]*?)<\/next_action>/);
  if (nextActionMatch) {
    try { nextAction = JSON.parse(nextActionMatch[1].trim()); } catch { /* skip */ }
  }
  const cleanResearch = researchContent.replace(/<next_action>[\s\S]*?<\/next_action>/, '').trim();

  // Update task with research findings — append, don't overwrite existing research
  const existingDesc = task.description || '';
  const hasExistingResearch = existingDesc.includes('--- Agent Research ---');
  const updatedDescription = hasExistingResearch
    ? `${existingDesc}\n\n--- Updated Research ---\n${cleanResearch}`
    : `${existingDesc}\n\n--- Agent Research ---\n${cleanResearch}`.trim();

  await pool.query(
    `UPDATE tasks SET description = $1, updated_at = NOW() WHERE id = $2`,
    [updatedDescription, taskId]
  );

  // If a call is recommended, auto-create approval
  if (nextAction.needs_call) {
    const phoneNumber = nextAction.call_phone || task.contact_phone || null;
    const approvalResult = await pool.query(
      `INSERT INTO approvals (task_id, action_type, status, notes)
       VALUES ($1, 'make_call', 'pending', $2)
       RETURNING id`,
      [taskId, `Call ${nextAction.call_to}${phoneNumber ? ` at ${phoneNumber}` : ''}: ${nextAction.call_purpose}`]
    );

    await pool.query(
      `INSERT INTO notifications (type, title, message, related_task_id)
       VALUES ('approval_required', $1, $2, $3)`,
      [
        `Approval needed: Call ${nextAction.call_to}`,
        `Agent wants to call ${nextAction.call_to}${phoneNumber ? ` (${phoneNumber})` : ''} for task "${task.title}": ${nextAction.call_purpose}`,
        taskId,
      ]
    );

    // Update task to pending approval
    await pool.query(
      "UPDATE tasks SET status = 'pending_approval', updated_at = NOW() WHERE id = $1",
      [taskId]
    );

    await pool.query(
      `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
      ['auto_approval_created', JSON.stringify({ task_id: taskId, approval_id: approvalResult.rows[0].id, call_to: nextAction.call_to, trigger: 'resume' })]
    );
  }

  // Create completion notification
  await pool.query(
    `INSERT INTO notifications (type, title, message, related_task_id)
     VALUES ('task_update', $1, $2, $3)`,
    [
      `Research complete: ${task.title}`,
      nextAction.summary || `Finished researching "${task.title}". ${nextAction.needs_call ? 'Awaiting call approval.' : 'Ready for next steps.'}`,
      taskId,
    ]
  );

  // Log completion
  await pool.query(
    `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
    ['task_research_completed', JSON.stringify({ task_id: taskId, title: task.title, needs_call: nextAction.needs_call, summary: nextAction.summary, trigger: 'resume' })]
  );

  return { research: cleanResearch, nextAction };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify task exists
    const taskRes = await pool.query('SELECT id, title, status FROM tasks WHERE id = $1', [id]);
    if (taskRes.rows.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const task = taskRes.rows[0];

    // Update task to in_progress immediately
    await pool.query(
      "UPDATE tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1",
      [id]
    );

    // Fire-and-forget: process the task in the background
    processTask(id).catch((err) => {
      console.error('Task resume processing failed:', err);
      pool.query(
        `INSERT INTO agent_logs (action, details, status, error_message) VALUES ($1, $2, 'failure', $3)`,
        ['task_research_failed', JSON.stringify({ task_id: id, trigger: 'resume' }), err instanceof Error ? err.message : 'Unknown error']
      ).catch(() => {});
    });

    return NextResponse.json({
      success: true,
      task_id: id,
      title: task.title,
      message: 'Task resumed — agent is now researching and processing it. You will receive notifications with updates.',
    });
  } catch (error) {
    console.error('Task resume error:', error);
    return NextResponse.json({ error: 'Failed to resume task' }, { status: 500 });
  }
}
