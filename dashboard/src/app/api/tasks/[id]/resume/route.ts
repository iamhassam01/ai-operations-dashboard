import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// ─── Agentic Task Processing ────────────────────────────────────────
// When a task is resumed/continued, this researches the task using
// real web search + GPT-4o analysis, updates findings, creates
// approvals only when genuinely needed, and posts progress to chat.

// Helper: post a structured activity card to the originating conversation
async function postActivity(
  conversationId: string | null,
  actionType: string,
  title: string,
  detail?: string,
  taskId?: string,
) {
  if (!conversationId) return;
  await pool.query(
    `INSERT INTO messages (conversation_id, role, content, action_type, action_data, related_task_id)
     VALUES ($1, 'action', $2, $3, $4, $5)`,
    [
      conversationId,
      title,
      actionType,
      JSON.stringify({ action_type: actionType, success: true, data: { title, detail: detail || '' } }),
      taskId || null,
    ],
  );
}

// Helper: perform web search using OpenAI Responses API
async function webSearch(query: string, openaiKey: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search_preview' }],
        input: query,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = data.output?.find((o: any) => o.type === 'message');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textBlock = msg?.content?.find((c: any) => c.type === 'output_text');
    return textBlock?.text || null;
  } catch {
    return null;
  }
}

const RESEARCH_SYSTEM_PROMPT = `You are a thorough research assistant for an AI executive assistant called Bob. Your job is to analyze a task and any web search results, then provide well-formatted, actionable findings.

OUTPUT FORMAT RULES:
- Use proper markdown with ## for main sections and ### for subsections
- Use **bold** for important terms, prices, and names
- Use bullet lists for key points
- Use numbered lists for step-by-step actions
- When comparing options/services/products, ALWAYS create a markdown table:
  | Option | Provider | Price | Key Features | Availability |
  |--------|----------|-------|--------------|--------------|
- After the table, provide a **Recommended Option** section with clear rationale
- Keep the response focused and actionable (400-600 words max excluding the JSON block)

CALL DECISION RULES — THINK CAREFULLY:
RECOMMEND a phone call ONLY when:
- Task explicitly requires booking, reserving, or scheduling with a specific business or person
- Task requires negotiating, asking custom questions, or getting a quote from a specific vendor
- Task involves following up with a named contact who has a phone number
- Task type is "call", "booking", or "cancellation" AND a specific business/person is identified

DO NOT recommend a call when:
- Task is research, information gathering, comparison, or analysis
- Task asks for recommendations, suggestions, or exploration of a topic
- No specific business, person, or phone number has been identified
- Task type is "inquiry" or "other" without a clear call target
- The needed information can be found online without calling

At the end of your response, include EXACTLY this JSON block:
<next_action>{"needs_call": true/false, "call_to": "name or business or empty string", "call_phone": "+number or null", "call_purpose": "reason or empty string", "summary": "1-sentence summary of findings"}</next_action>`;

async function processTask(taskId: string) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error('OPENAI_API_KEY not configured');

  const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (taskRes.rows.length === 0) throw new Error('Task not found');
  const task = taskRes.rows[0];

  // Find the originating conversation (if task was created from chat)
  const convRes = await pool.query(
    `SELECT conversation_id FROM messages WHERE related_task_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [taskId],
  );
  const conversationId = convRes.rows[0]?.conversation_id || null;

  // Log start
  await pool.query(
    `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'pending')`,
    ['task_research_started', JSON.stringify({ task_id: taskId, title: task.title, trigger: 'resume' })],
  );

  // Notification + chat progress
  await pool.query(
    `INSERT INTO notifications (type, title, message, related_task_id)
     VALUES ('task_update', $1, $2, $3)`,
    [`Working on: ${task.title}`, `Agent is now researching and processing this task...`, taskId],
  );

  await postActivity(conversationId, 'research_started', `Resuming research: ${task.title}`, 'Searching the web for the latest information...', taskId);

  // Look for matching contacts
  const contactSearch = [];
  if (task.contact_name) {
    const res = await pool.query(
      `SELECT * FROM contacts WHERE name ILIKE $1 LIMIT 5`,
      [`%${task.contact_name}%`],
    );
    contactSearch.push(...res.rows);
  }
  if (task.contact_phone) {
    const res = await pool.query(
      `SELECT * FROM contacts WHERE phone_number = $1 LIMIT 1`,
      [task.contact_phone],
    );
    contactSearch.push(...res.rows);
  }

  const contactContext = contactSearch.length > 0
    ? `\nMatching contacts found in database:\n${contactSearch.map((c: { name: string; phone_number: string; company: string; notes: string }) => `- ${c.name}: ${c.phone_number}${c.company ? ` (${c.company})` : ''}${c.notes ? ` — ${c.notes}` : ''}`).join('\n')}`
    : '';

  // ── Step 1: Web Search ────────────────────────────────────────────
  const searchQuery = `${task.title}${task.description ? ' ' + task.description.slice(0, 150) : ''} latest 2025`;
  const webResults = await webSearch(searchQuery, openaiKey);

  if (webResults) {
    await postActivity(conversationId, 'web_search_complete', 'Web results found', `Analyzing findings for "${task.title}"...`, taskId);
  }

  // ── Step 2: Analyze with GPT-4o ──────────────────────────────────
  const userPrompt = `Research this task and provide well-formatted findings:

**Task:** ${task.title}
**Type:** ${task.type}
**Priority:** ${task.priority}
**Description:** ${task.description || 'No additional details'}
**Contact:** ${task.contact_name || 'Not specified'}
**Phone:** ${task.contact_phone || 'Not specified'}
**Address:** ${task.address || 'Not specified'}
**Constraints:** ${task.constraints || 'None'}
**Preferred times:** ${task.preferred_time_1 || 'Flexible'}
${contactContext}
${webResults ? `\n--- WEB SEARCH RESULTS (use this real-time data) ---\n${webResults}\n--- END WEB RESULTS ---` : '\nNo web search results available — use your best knowledge but note that information may not be the latest.'}

Based on all available information, provide a thorough, well-formatted research report. If comparing options, include a comparison table with pricing. Be specific with names, prices, and actionable details.`;

  const researchResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 1500,
    }),
    signal: AbortSignal.timeout(45000),
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

  // ── Step 3: Update task description ───────────────────────────────
  const existingDesc = task.description || '';
  const hasExistingResearch = existingDesc.includes('## 🔍 Research Findings');
  const updatedDescription = hasExistingResearch
    ? `${existingDesc}\n\n---\n\n## 📋 Updated Research\n\n${cleanResearch}`
    : `${existingDesc}\n\n## 🔍 Research Findings\n\n${cleanResearch}`.trim();

  await pool.query(
    `UPDATE tasks SET description = $1, updated_at = NOW() WHERE id = $2`,
    [updatedDescription, taskId],
  );

  // ── Step 4: Post results to chat ──────────────────────────────────
  if (conversationId) {
    const callNote = nextAction.needs_call
      ? `\n\n**Next step:** I recommend calling **${nextAction.call_to}**${nextAction.call_phone ? ` at ${nextAction.call_phone}` : ''}. I've created an approval request — please approve it when you're ready.`
      : `\n\nI've updated the task with these findings. Let me know if you'd like me to take any further action.`;

    // Post structured activity card for completion
    await postActivity(conversationId, 'research_complete', `Research complete: ${task.title}`, nextAction.summary || 'Findings have been added to the task.', taskId);

    // Post full research as assistant message
    await pool.query(
      `INSERT INTO messages (conversation_id, role, content, related_task_id)
       VALUES ($1, 'assistant', $2, $3)`,
      [
        conversationId,
        `Here are the findings for **"${task.title}"**:\n\n${cleanResearch}${callNote}`,
        taskId,
      ],
    );
  }

  // ── Step 5: Approval only if genuinely needed ─────────────────────
  if (nextAction.needs_call && nextAction.call_to) {
    const phoneNumber = nextAction.call_phone || task.contact_phone || null;
    const approvalResult = await pool.query(
      `INSERT INTO approvals (task_id, action_type, status, notes)
       VALUES ($1, 'make_call', 'pending', $2)
       RETURNING id`,
      [taskId, `Call ${nextAction.call_to}${phoneNumber ? ` at ${phoneNumber}` : ''}: ${nextAction.call_purpose}`],
    );

    await pool.query(
      `INSERT INTO notifications (type, title, message, related_task_id)
       VALUES ('approval_required', $1, $2, $3)`,
      [
        `Approval needed: Call ${nextAction.call_to}`,
        `Agent wants to call ${nextAction.call_to}${phoneNumber ? ` (${phoneNumber})` : ''} for task "${task.title}": ${nextAction.call_purpose}`,
        taskId,
      ],
    );

    // Post approval activity to chat
    await postActivity(
      conversationId,
      'approval_created',
      `Approval needed: Call ${nextAction.call_to}`,
      `${nextAction.call_purpose}${phoneNumber ? ` — ${phoneNumber}` : ''}. Approve from the dashboard to proceed.`,
      taskId,
    );

    await pool.query(
      "UPDATE tasks SET status = 'pending_approval', updated_at = NOW() WHERE id = $1",
      [taskId],
    );

    // Post status change to chat
    await postActivity(conversationId, 'status_changed', `Task status: Pending Approval`, `"${task.title}" is waiting for your approval.`, taskId);

    await pool.query(
      `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
      ['auto_approval_created', JSON.stringify({ task_id: taskId, approval_id: approvalResult.rows[0].id, call_to: nextAction.call_to, trigger: 'resume' })],
    );
  }

  // ── Step 6: Completion ────────────────────────────────────────────
  await pool.query(
    `INSERT INTO notifications (type, title, message, related_task_id)
     VALUES ('task_update', $1, $2, $3)`,
    [
      `Research complete: ${task.title}`,
      nextAction.summary || `Finished researching "${task.title}". ${nextAction.needs_call ? 'Awaiting call approval.' : 'Ready for review.'}`,
      taskId,
    ],
  );

  await pool.query(
    `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
    ['task_research_completed', JSON.stringify({ task_id: taskId, title: task.title, needs_call: nextAction.needs_call, web_search_used: !!webResults, summary: nextAction.summary, trigger: 'resume' })],
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
