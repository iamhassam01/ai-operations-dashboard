import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://127.0.0.1:18789';
const OPENCLAW_HOOK_TOKEN = process.env.OPENCLAW_HOOK_TOKEN || '';

// Build system context from the database so the agent knows what's going on
async function buildSystemContext(): Promise<string> {
  const [tasksRes, callsRes, approvalsRes, memoryRes, settingsRes] = await Promise.all([
    pool.query(
      `SELECT id, title, type, status, priority, contact_name, contact_phone, address, description, created_at
       FROM tasks WHERE status NOT IN ('closed', 'cancelled')
       ORDER BY created_at DESC LIMIT 15`
    ),
    pool.query(
      `SELECT c.id, c.direction, c.phone_number, c.caller_name, c.status, c.summary, c.duration_seconds, c.created_at, t.title as task_title
       FROM calls c LEFT JOIN tasks t ON c.task_id = t.id
       ORDER BY c.created_at DESC LIMIT 10`
    ),
    pool.query(
      `SELECT a.id, a.action_type, a.status, a.notes, t.title as task_title, a.created_at
       FROM approvals a LEFT JOIN tasks t ON a.task_id = t.id
       WHERE a.status = 'pending'
       ORDER BY a.created_at ASC`
    ),
    pool.query(
      `SELECT category, content FROM agent_memory ORDER BY created_at DESC LIMIT 30`
    ),
    pool.query(`SELECT key, value FROM settings`),
  ]);

  const settings: Record<string, string> = {};
  settingsRes.rows.forEach((s: { key: string; value: string }) => {
    settings[s.key] = typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
  });

  const memories = memoryRes.rows;
  const memoryBlock = memories.length > 0
    ? `\nUser memories and preferences:\n${memories.map((m: { category: string; content: string }) => `- [${m.category}] ${m.content}`).join('\n')}`
    : '';

  const activeTasks = tasksRes.rows;
  const taskBlock = activeTasks.length > 0
    ? `\nActive tasks:\n${activeTasks.map((t: { id: string; title: string; status: string; type: string; priority: string; contact_name: string; address: string }) =>
      `- "${t.title}" (${t.type}, ${t.status}, priority: ${t.priority}${t.contact_name ? `, contact: ${t.contact_name}` : ''}${t.address ? `, address: ${t.address}` : ''}) ID: ${t.id}`
    ).join('\n')}`
    : '\nNo active tasks.';

  const recentCalls = callsRes.rows;
  const callBlock = recentCalls.length > 0
    ? `\nRecent calls:\n${recentCalls.map((c: { direction: string; phone_number: string; caller_name: string; status: string; summary: string; task_title: string; duration_seconds: number }) =>
      `- ${c.direction} call to/from ${c.phone_number}${c.caller_name ? ` (${c.caller_name})` : ''}: ${c.status}${c.summary ? ` — ${c.summary}` : ''}${c.task_title ? ` [Task: ${c.task_title}]` : ''}${c.duration_seconds ? ` (${c.duration_seconds}s)` : ''}`
    ).join('\n')}`
    : '';

  const pendingApprovals = approvalsRes.rows;
  const approvalBlock = pendingApprovals.length > 0
    ? `\nPending approvals waiting for user:\n${pendingApprovals.map((a: { action_type: string; task_title: string; id: string }) =>
      `- ${a.action_type} for "${a.task_title}" (approval ID: ${a.id})`
    ).join('\n')}`
    : '';

  return `You are Bob, an AI operations assistant. On phone calls you introduce yourself as Mr. Ermakov.
You work for ${settings.business_name || 'Home'}, managed by Ivan Korn.
Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

Your capabilities:
1. Create tasks — when the user asks you to do something (book hotel, order food, find a plumber, etc.), create a task with all relevant details.
2. Research — look up information, find contacts, compare options for a task.
3. Make calls — call businesses, hotels, restaurants, service providers on behalf of the user. You MUST get approval before making any call.
4. Manage approvals — present plans to the user and wait for their approval before executing.
5. Track progress — show the user what you've done, what's in progress, what's waiting.
6. Remember context — store important facts about the user's preferences, past decisions, and ongoing situations.

RULES:
- NEVER take an action without asking for approval first. Always present your plan, then wait for the user to approve.
- When creating a task, include all details: what needs to be done, contact info if available, time preferences, constraints.
- When the user's request is unclear, ask specific clarifying questions. Don't guess.
- Keep your responses conversational and direct. No corporate speak.
- When you determine an action is needed, include it in your response using the action format below.
- Refer to existing tasks and calls when relevant — the user can see them in the dashboard.

ACTION FORMAT — when you need to take an action, include exactly one of these JSON blocks in your response, wrapped in <action> tags:

To create a task:
<action>{"type":"create_task","title":"...","task_type":"call|booking|follow_up|cancellation|inquiry|other","priority":"low|medium|high|urgent","description":"...","contact_name":"...","contact_phone":"...","contact_email":"...","address":"...","preferred_time_1":"...","preferred_time_2":"...","constraints":"..."}</action>

To request approval for a call:
<action>{"type":"request_call_approval","task_id":"...","phone_number":"...","purpose":"..."}</action>

To store a memory about the user:
<action>{"type":"store_memory","category":"preference|fact|context|instruction","content":"..."}</action>

To update a task status:
<action>{"type":"update_task","task_id":"...","status":"...","notes":"..."}</action>

You can include multiple actions in one response if needed.

CURRENT SYSTEM STATE:
${taskBlock}
${callBlock}
${approvalBlock}
${memoryBlock}`;
}

// Parse actions from the agent's response
function parseActions(content: string): { cleanContent: string; actions: Array<{ type: string; [key: string]: unknown }> } {
  const actions: Array<{ type: string; [key: string]: unknown }> = [];
  let cleanContent = content;

  const actionRegex = /<action>([\s\S]*?)<\/action>/g;
  let match;

  while ((match = actionRegex.exec(content)) !== null) {
    try {
      const action = JSON.parse(match[1].trim());
      if (action && action.type) {
        actions.push(action);
      }
    } catch {
      // Skip malformed action blocks
    }
    cleanContent = cleanContent.replace(match[0], '').trim();
  }

  return { cleanContent, actions };
}

// Execute a parsed action against the database
async function executeAction(action: { type: string; [key: string]: unknown }, conversationId: string) {
  const results: Array<{ action_type: string; success: boolean; data?: Record<string, unknown>; error?: string }> = [];

  switch (action.type) {
    case 'create_task': {
      const taskResult = await pool.query(
        `INSERT INTO tasks (type, title, description, priority, contact_name, contact_phone, contact_email, address, preferred_time_1, preferred_time_2, constraints, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'new')
         RETURNING id, title, status`,
        [
          action.task_type || 'other',
          action.title,
          action.description || null,
          action.priority || 'medium',
          action.contact_name || null,
          action.contact_phone || null,
          action.contact_email || null,
          action.address || null,
          action.preferred_time_1 || null,
          action.preferred_time_2 || null,
          action.constraints || null,
        ]
      );
      const task = taskResult.rows[0];

      // Log the action
      await pool.query(
        `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
        ['task_created', JSON.stringify({ task_id: task.id, title: task.title, source: 'chat', conversation_id: conversationId })]
      );

      // Create notification
      await pool.query(
        `INSERT INTO notifications (type, title, message, related_task_id)
         VALUES ('task_update', $1, $2, $3)`,
        [`Task created: ${task.title}`, `Created via chat conversation`, task.id]
      );

      results.push({ action_type: 'task_created', success: true, data: { task_id: task.id, title: task.title } });
      break;
    }

    case 'request_call_approval': {
      // Create an approval request
      const approvalResult = await pool.query(
        `INSERT INTO approvals (task_id, action_type, status, notes)
         VALUES ($1, 'make_call', 'pending', $2)
         RETURNING id`,
        [action.task_id || null, `Call ${action.phone_number}: ${action.purpose}`]
      );

      await pool.query(
        `INSERT INTO notifications (type, title, message, related_task_id)
         VALUES ('approval_required', $1, $2, $3)`,
        ['Call approval needed', `Agent wants to call ${action.phone_number}: ${action.purpose}`, action.task_id || null]
      );

      await pool.query(
        `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
        ['approval_requested', JSON.stringify({ approval_id: approvalResult.rows[0].id, phone: action.phone_number, purpose: action.purpose, source: 'chat' })]
      );

      results.push({ action_type: 'approval_requested', success: true, data: { approval_id: approvalResult.rows[0].id } });
      break;
    }

    case 'store_memory': {
      await pool.query(
        `INSERT INTO agent_memory (category, content) VALUES ($1, $2)`,
        [action.category || 'context', action.content]
      );
      results.push({ action_type: 'memory_stored', success: true });
      break;
    }

    case 'update_task': {
      if (action.task_id && action.status) {
        await pool.query(
          `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2`,
          [action.status, action.task_id]
        );

        await pool.query(
          `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
          ['task_updated', JSON.stringify({ task_id: action.task_id, new_status: action.status, notes: action.notes, source: 'chat' })]
        );

        results.push({ action_type: 'task_updated', success: true, data: { task_id: action.task_id as string } });
      }
      break;
    }

    default:
      results.push({ action_type: action.type, success: false, error: 'Unknown action type' });
  }

  return results;
}

// POST send a message and get agent response
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const { message } = await request.json();

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Verify conversation exists
    const convCheck = await pool.query('SELECT id FROM conversations WHERE id = $1', [conversationId]);
    if (convCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Save user message
    await pool.query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
      [conversationId, message.trim()]
    );

    // Get conversation history (last 20 messages for context)
    const historyResult = await pool.query(
      `SELECT role, content FROM messages
       WHERE conversation_id = $1 AND role IN ('user', 'assistant')
       ORDER BY created_at DESC LIMIT 20`,
      [conversationId]
    );
    const history = historyResult.rows.reverse();

    // Build the system prompt with full DB context
    const systemContext = await buildSystemContext();

    // Build messages array for the LLM
    const llmMessages = [
      { role: 'system', content: systemContext },
      ...history.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
    ];

    // Send to OpenClaw gateway
    let assistantContent: string;
    try {
      const openclawResponse = await fetch(`${OPENCLAW_URL}/hooks/agent`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENCLAW_HOOK_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message.trim(),
          name: 'Chat message',
          context: {
            messages: llmMessages,
            conversation_id: conversationId,
          },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (openclawResponse.ok) {
        const responseData = await openclawResponse.json();
        assistantContent = responseData.response || responseData.message || responseData.content || '';
      } else {
        // If OpenClaw is not responding properly, fall back to a direct acknowledgment
        assistantContent = await generateFallbackResponse(message.trim(), systemContext, history);
      }
    } catch {
      // OpenClaw unreachable — use fallback
      assistantContent = await generateFallbackResponse(message.trim(), systemContext, history);
    }

    if (!assistantContent) {
      assistantContent = "I received your message but couldn't generate a response. Could you try rephrasing?";
    }

    // Parse any actions from the response
    const { cleanContent, actions } = parseActions(assistantContent);
    const actionResults: Array<{ action_type: string; success: boolean; data?: Record<string, unknown>; error?: string }> = [];

    // Execute actions
    for (const action of actions) {
      const results = await executeAction(action, conversationId);
      actionResults.push(...results);
    }

    // Save assistant message
    const assistantMsg = await pool.query(
      `INSERT INTO messages (conversation_id, role, content, action_type, action_data)
       VALUES ($1, 'assistant', $2, $3, $4)
       RETURNING id, role, content, action_type, action_data, created_at`,
      [
        conversationId,
        cleanContent,
        actionResults.length > 0 ? actionResults[0].action_type : null,
        actionResults.length > 0 ? JSON.stringify(actionResults) : null,
      ]
    );

    // Save action messages separately for timeline visibility
    for (const result of actionResults) {
      await pool.query(
        `INSERT INTO messages (conversation_id, role, content, action_type, action_data, related_task_id)
         VALUES ($1, 'action', $2, $3, $4, $5)`,
        [
          conversationId,
          `${result.action_type}: ${result.success ? 'completed' : 'failed'}`,
          result.action_type,
          JSON.stringify(result),
          result.data?.task_id || null,
        ]
      );
    }

    // Update conversation title from first meaningful exchange
    const msgCount = await pool.query(
      `SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1 AND role = 'user'`,
      [conversationId]
    );
    if (parseInt(msgCount.rows[0].count) <= 1) {
      const title = message.trim().slice(0, 80) + (message.trim().length > 80 ? '...' : '');
      await pool.query(
        `UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2`,
        [title, conversationId]
      );
    } else {
      await pool.query(
        `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
        [conversationId]
      );
    }

    return NextResponse.json({
      message: assistantMsg.rows[0],
      actions: actionResults,
    });
  } catch (error) {
    console.error('Chat send error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}

// Fallback response when OpenClaw gateway is unreachable
// This uses direct OpenAI API call as a backup
async function generateFallbackResponse(
  userMessage: string,
  systemContext: string,
  history: Array<{ role: string; content: string }>
): Promise<string> {
  // Try direct OpenAI if key is available
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const messages = [
        { role: 'system', content: systemContext },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ];

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages,
          temperature: 0.7,
          max_tokens: 1500,
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
      }
    } catch {
      // OpenAI also failed
    }
  }

  // Last resort — pattern-match the message to provide a useful static response
  const lower = userMessage.toLowerCase();
  if (lower.includes('task') || lower.includes('create') || lower.includes('do ')) {
    return `I understand you want me to help with something. Let me create a task for this.\n\n<action>{"type":"create_task","title":"${userMessage.slice(0, 80)}","task_type":"other","priority":"medium","description":"${userMessage}"}</action>\n\nI've created a task for this. I'll need your approval before taking any further action. What details should I add?`;
  }
  return "I'm having trouble connecting to my backend right now. Your message has been saved and I'll process it as soon as the connection is restored. Is there anything specific you'd like me to note for when I'm back online?";
}
