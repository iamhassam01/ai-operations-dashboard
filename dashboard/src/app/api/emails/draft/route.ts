import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAgentContext, formatContextForHook } from '@/lib/agent-context';

export async function POST(request: NextRequest) {
  try {
    const { task_id, to_address } = await request.json();

    if (!task_id) {
      return NextResponse.json(
        { error: 'task_id is required to generate an AI draft' },
        { status: 400 }
      );
    }

    // Gather task context for the draft
    const taskResult = await pool.query(
      'SELECT id, title, description, status, priority FROM tasks WHERE id = $1',
      [task_id]
    );

    if (taskResult.rows.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const task = taskResult.rows[0];

    // Get related contacts for recipient suggestion
    const contactResult = await pool.query(
      'SELECT name, email, phone FROM contacts WHERE task_id = $1 LIMIT 5',
      [task_id]
    );

    // Get related calls for context
    const callResult = await pool.query(
      'SELECT summary, captured_info, status FROM calls WHERE task_id = $1 ORDER BY created_at DESC LIMIT 3',
      [task_id]
    );

    // Build context for the AI draft
    const contacts = contactResult.rows;
    const calls = callResult.rows;

    // Attempt to call OpenClaw gateway for AI-generated draft
    const gatewayUrl = process.env.OPENCLAW_URL || 'http://127.0.0.1:18789';
    const hookToken = process.env.OPENCLAW_HOOK_TOKEN;

    if (hookToken) {
      try {
        const agentCtx = await getAgentContext();
        const contextBlock = formatContextForHook(agentCtx);
        const prompt = buildDraftPrompt(task, contacts, calls, to_address) + '\n\n' + contextBlock;

        const ocResponse = await fetch(`${gatewayUrl}/hooks/agent`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hookToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: prompt,
            name: `Email Draft: ${task.title}`,
            deliver: false,
            timeoutSeconds: 30,
          }),
          signal: AbortSignal.timeout(35000),
        });

        if (ocResponse.ok) {
          const draft = await ocResponse.json();
          return NextResponse.json({
            subject: draft.subject || `Re: ${task.title}`,
            body_text: draft.body_text || draft.body || '',
            to_address: draft.to_address || to_address || contacts[0]?.email || '',
          });
        }
      } catch {
        // OpenClaw gateway unavailable — fall back to template-based draft
      }
    }

    // Fallback: generate a template-based draft locally
    const recipientEmail = to_address || contacts[0]?.email || '';
    const recipientName = contacts.find(
      (c: { email: string }) => c.email === recipientEmail
    )?.name || '';

    const callSummaries = calls
      .filter((c: { summary: string | null }) => c.summary)
      .map((c: { summary: string }) => `- ${c.summary}`)
      .join('\n');

    const subject = `Follow-up: ${task.title}`;
    const body_text = [
      recipientName ? `Dear ${recipientName},` : 'Hello,',
      '',
      `I am writing to follow up regarding "${task.title}".`,
      callSummaries
        ? `\nBased on our recent conversations:\n${callSummaries}\n`
        : '',
      'Please let me know if you have any questions or need additional information.',
      '',
      'Best regards,',
      'AI Assistant on behalf of Ivan Korn',
    ]
      .filter(Boolean)
      .join('\n');

    return NextResponse.json({
      subject,
      body_text,
      to_address: recipientEmail,
    });
  } catch (error) {
    console.error('Email draft error:', error);
    return NextResponse.json(
      { error: 'Failed to generate email draft' },
      { status: 500 }
    );
  }
}

function buildDraftPrompt(
  task: { title: string; description: string; status: string; priority: string },
  contacts: { name: string; email: string; phone: string }[],
  calls: { summary: string; captured_info: Record<string, unknown>; status: string }[],
  toAddress: string
) {
  const contactInfo = contacts
    .map((c) => `${c.name} (${c.email}, ${c.phone})`)
    .join(', ');

  const callInfo = calls
    .map((c) => {
      let info = c.summary || 'No summary';
      if (c.captured_info && Object.keys(c.captured_info).length > 0) {
        info += ' | Data: ' + JSON.stringify(c.captured_info);
      }
      return info;
    })
    .join('; ');

  return `Draft a professional follow-up email for the task "${task.title}".
Task description: ${task.description || 'N/A'}
Task status: ${task.status}, Priority: ${task.priority}
Contacts: ${contactInfo || 'None on file'}
Recent call notes: ${callInfo || 'No calls made yet'}
Send to: ${toAddress || 'suggest from contacts'}
Write the email as the AI assistant representing Ivan Korn.
Return JSON: { "subject": "...", "body_text": "...", "to_address": "..." }`;
}
