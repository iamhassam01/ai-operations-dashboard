import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// ─── Background Task Processing ──────────────────────────────────────
// After creating a task, this fires in the background to actually research
// and work on it — using real web search, smart call decisions, and
// real-time progress updates to the conversation.

// Helper: post a progress message into the conversation
async function postProgress(conversationId: string, content: string) {
  await pool.query(
    `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
    [conversationId, content],
  );
}

// Helper: perform web search using OpenAI Responses API with web_search tool
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

// The research system prompt — instructs GPT-4o on how to analyze findings
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

async function processTaskInBackground(taskId: string, conversationId: string) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return;

    // Get task details
    const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (taskRes.rows.length === 0) return;
    const task = taskRes.rows[0];

    // Update task to in_progress
    await pool.query(
      "UPDATE tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1",
      [taskId],
    );

    // Log start
    await pool.query(
      `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'pending')`,
      ['task_research_started', JSON.stringify({ task_id: taskId, title: task.title })],
    );

    // Post progress: starting
    await postProgress(conversationId, `🔍 Starting research on **"${task.title}"**... I'll search the web for the latest information and report back.`);

    // Look for matching contacts in our database
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
      await postProgress(conversationId, `🌐 Found web results for **"${task.title}"**. Analyzing and preparing a structured report...`);
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

    // ── Step 3: Update task with formatted research ──────────────────
    const existingDesc = task.description || '';
    const hasExistingResearch = existingDesc.includes('## 🔍 Research Findings');
    const updatedDescription = hasExistingResearch
      ? `${existingDesc}\n\n---\n\n## 📋 Updated Research\n\n${cleanResearch}`
      : `${existingDesc}\n\n## 🔍 Research Findings\n\n${cleanResearch}`.trim();

    await pool.query(
      `UPDATE tasks SET description = $1, updated_at = NOW() WHERE id = $2`,
      [updatedDescription, taskId],
    );

    // ── Step 4: Post final results to conversation ───────────────────
    const callNote = nextAction.needs_call
      ? `\n\n**Next step:** I recommend calling **${nextAction.call_to}**${nextAction.call_phone ? ` at ${nextAction.call_phone}` : ''}. I've created an approval request — please approve it when you're ready.`
      : `\n\nI've updated the task with these findings. Let me know if you'd like me to take any further action.`;

    await pool.query(
      `INSERT INTO messages (conversation_id, role, content, action_type, action_data)
       VALUES ($1, 'assistant', $2, 'task_updated', $3)`,
      [
        conversationId,
        `✅ Research complete for **"${task.title}"**:\n\n${cleanResearch}${callNote}`,
        JSON.stringify([{ action_type: 'task_updated', success: true, data: { task_id: taskId, title: task.title } }]),
      ],
    );

    // ── Step 5: Create approval ONLY if genuinely needed ─────────────
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

      await pool.query(
        "UPDATE tasks SET status = 'pending_approval', updated_at = NOW() WHERE id = $1",
        [taskId],
      );

      await pool.query(
        `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
        ['auto_approval_created', JSON.stringify({ task_id: taskId, approval_id: approvalResult.rows[0].id, call_to: nextAction.call_to })],
      );
    }

    // ── Step 6: Completion notification ──────────────────────────────
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
      ['task_research_completed', JSON.stringify({ task_id: taskId, title: task.title, needs_call: nextAction.needs_call, web_search_used: !!webResults, summary: nextAction.summary })],
    );

  } catch (error) {
    console.error('Background task processing error:', error);
    await pool.query(
      `INSERT INTO agent_logs (action, details, status, error_message) VALUES ($1, $2, 'failure', $3)`,
      ['task_research_failed', JSON.stringify({ task_id: taskId }), error instanceof Error ? error.message : 'Unknown error'],
    ).catch(() => {});
  }
}

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
    ? `\nActive tasks:\n${activeTasks.map((t: { id: string; title: string; status: string; type: string; priority: string; contact_name: string; address: string; description: string }) =>
      `- "${t.title}" (${t.type}, ${t.status}, priority: ${t.priority}${t.contact_name ? `, contact: ${t.contact_name}` : ''}${t.address ? `, address: ${t.address}` : ''}${t.description && t.description.includes('## 🔍 Research Findings') ? ' — ✅ research completed' : t.status === 'in_progress' ? ' — 🔍 researching now...' : ''}) ID: ${t.id}`
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

  return `You are Bob, an AI operations assistant with REAL agentic capabilities. On phone calls you introduce yourself as Mr. Ermakov.
You work for ${settings.business_name || 'Home'}, managed by Ivan Korn.
Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

IMPORTANT — YOU ARE A REAL AGENT, NOT JUST A CHATBOT:
When you create a task, your backend system AUTOMATICALLY starts working on it in real-time:
- It searches the web for the latest real-time information
- It researches the task using AI and web search results
- It updates the task description with structured findings (tables, comparisons, recommendations)
- It creates approval requests ONLY when actions genuinely need user permission (like making phone calls)
- It sends notifications and posts progress updates in this chat
- Tasks marked with "✅ research completed" already have findings — you can reference them directly
- Tasks marked with "🔍 researching now..." are currently being worked on — let the user know
You do NOT need to pretend or say "I'll look into this" — you actually DO it. The research happens automatically after you create a task.

Your capabilities:
1. Create tasks — when the user asks you to do something (book hotel, order food, find a plumber, etc.), create a task with all relevant details. Your system will AUTOMATICALLY start researching it.
2. Make calls — call businesses, hotels, restaurants, service providers on behalf of the user via Twilio. You MUST get approval before making any call. When the user approves, the call is actually placed.
3. Manage approvals — present plans to the user and wait for their approval before executing. Approval requests appear in the dashboard.
4. Track progress — show the user what you've done, what's in progress, what's waiting. Reference task IDs.
5. Remember context — store important facts about the user's preferences, past decisions, and ongoing situations.

RULES:
- When the user asks you to do something, create a task immediately with all the details. Your system will automatically research it using web search and report back.
- NEVER take a call action without asking for approval first. Create an approval request and let the user approve it from the dashboard.
- When creating a task, include ALL known details: what needs to be done, contact info if available, time preferences, constraints.
- When the user's request is unclear, ask specific clarifying questions. Don't guess.
- Keep your responses conversational and direct. No corporate speak.
- When you determine an action is needed, include it in your response using the action format below.
- Refer to existing tasks and calls when relevant — the user can see them in the dashboard.
- Be proactive: suggest next steps, offer to create tasks, remind about pending approvals.
- When a task is already in_progress, tell the user it's being worked on and they'll get a notification when research is done.
- When the user asks about a task that has completed research, summarize the findings for them.

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

      // 🚀 Fire-and-forget: start background processing for this task
      // This makes the agent truly agentic — it will research the task,
      // find contacts, propose next steps, and create approvals automatically.
      processTaskInBackground(task.id, conversationId).catch((err) => {
        console.error('Background task processing failed:', err);
      });

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

    // Call the LLM directly via OpenAI API
    let assistantContent: string;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: llmMessages,
            temperature: 0.7,
            max_tokens: 1500,
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (response.ok) {
          const data = await response.json();
          assistantContent = data.choices?.[0]?.message?.content || '';
        } else {
          const errData = await response.json().catch(() => null);
          const errMsg = errData?.error?.message || `HTTP ${response.status}`;
          console.error('OpenAI API error:', errMsg);
          if (errData?.error?.code === 'insufficient_quota') {
            assistantContent = "I'm currently unable to process requests — my API quota has been exceeded. Please check the OpenAI billing dashboard and add credits to resume. Your message has been saved.";
          } else {
            assistantContent = await generateFallbackResponse(message.trim(), systemContext);
          }
        }
      } catch (err) {
        console.error('OpenAI API fetch error:', err);
        assistantContent = await generateFallbackResponse(message.trim(), systemContext);
      }
    } else {
      assistantContent = "I'm not configured yet — the OPENAI_API_KEY environment variable is missing. Please add it to the ecosystem config and restart PM2.";
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
    const detail = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to send message', detail }, { status: 500 });
  }
}

// Fallback response when OpenAI API is unreachable
async function generateFallbackResponse(
  userMessage: string,
  _systemContext: string,
): Promise<string> {
  // Pattern-match the message to provide a useful static response
  const lower = userMessage.toLowerCase();
  if (lower.includes('task') || lower.includes('create') || lower.includes('do ')) {
    return `I understand you want me to help with something. Let me create a task for this.\n\n<action>{"type":"create_task","title":"${userMessage.slice(0, 80)}","task_type":"other","priority":"medium","description":"${userMessage}"}</action>\n\nI've created a task for this. I'll need your approval before taking any further action. What details should I add?`;
  }
  return "I'm having trouble connecting to my backend right now. Your message has been saved and I'll process it as soon as the connection is restored. Is there anything specific you'd like me to note for when I'm back online?";
}
