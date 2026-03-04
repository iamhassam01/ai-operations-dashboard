import pool from '@/lib/db';

export interface AgentContext {
  identity: { name: string; phoneIdentity: string; owner: string };
  memoryFacts: string[];
  knowledgeSummary: string[];
  settings: Record<string, string>;
}

/**
 * Gathers agent context from DB (memory facts, knowledge, settings)
 * to include in OpenClaw hook calls so the agent actually uses dashboard data.
 * Each query is individually fail-safe so one failure doesn't break the whole context.
 */
export async function getAgentContext(): Promise<AgentContext> {
  const safeQuery = async (sql: string) => {
    try { return (await pool.query(sql)).rows; }
    catch { return []; }
  };

  const [factsRows, knowledgeRows, settingsRows] = await Promise.all([
    safeQuery("SELECT key, value, category FROM agent_memory_facts ORDER BY category, key LIMIT 50"),
    safeQuery("SELECT title, content, category FROM knowledge_entries ORDER BY category LIMIT 20"),
    safeQuery("SELECT key, value FROM settings WHERE key IN ('agent_name', 'agent_identity', 'owner_name', 'business_name', 'timezone', 'operating_hours_start', 'operating_hours_end', 'notification_email', 'cc_email')"),
  ]);

  const settingsMap: Record<string, string> = {};
  settingsRows.forEach((r: { key: string; value: string }) => {
    settingsMap[r.key] = typeof r.value === 'string' ? r.value.replace(/"/g, '') : String(r.value);
  });

  const memoryFacts = factsRows.map(
    (f: { key: string; value: string; category: string }) => `[${f.category}] ${f.key}: ${f.value}`
  );

  const knowledgeSummary = knowledgeRows.map(
    (k: { title: string; content: string; category: string }) =>
      `[${k.category}] ${k.title}: ${(k.content || '').slice(0, 200)}`
  );

  return {
    identity: {
      name: settingsMap.agent_name || 'Bob',
      phoneIdentity: settingsMap.agent_identity || 'Mr. Ermakov',
      owner: settingsMap.owner_name || 'Ivan Korn',
    },
    memoryFacts,
    knowledgeSummary,
    settings: settingsMap,
  };
}

/** Formats agent context into a concise system prompt block for OpenClaw hooks */
export function formatContextForHook(ctx: AgentContext): string {
  const lines = [
    `--- AGENT CONTEXT ---`,
    `Identity: ${ctx.identity.name} (phone persona: ${ctx.identity.phoneIdentity}), working for ${ctx.identity.owner}`,
  ];

  if (ctx.memoryFacts.length > 0) {
    lines.push(`\nMemory (${ctx.memoryFacts.length} facts):`);
    lines.push(...ctx.memoryFacts.map(f => `  • ${f}`));
  }

  if (ctx.knowledgeSummary.length > 0) {
    lines.push(`\nKnowledge (${ctx.knowledgeSummary.length} entries):`);
    lines.push(...ctx.knowledgeSummary.map(k => `  • ${k}`));
  }

  if (ctx.settings.timezone) {
    lines.push(`\nTimezone: ${ctx.settings.timezone}`);
  }
  if (ctx.settings.operating_hours_start && ctx.settings.operating_hours_end) {
    lines.push(`Office hours: ${ctx.settings.operating_hours_start} – ${ctx.settings.operating_hours_end}`);
  }

  lines.push(`--- END CONTEXT ---`);
  return lines.join('\n');
}
