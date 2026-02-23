import pool from '@/lib/db';

interface UsageEntry {
  service: string;
  endpoint: string;
  method?: string;
  model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  estimated_cost?: number;
  status_code?: number;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}

// Cost per 1M tokens (USD) — updated for GPT-4o 2024-2025 pricing
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'whisper-1': { input: 0.006, output: 0 }, // per minute, not tokens
};

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;
  return (promptTokens / 1_000_000) * costs.input + (completionTokens / 1_000_000) * costs.output;
}

export async function trackUsage(entry: UsageEntry): Promise<void> {
  try {
    const cost = entry.estimated_cost ??
      estimateCost(entry.model || '', entry.prompt_tokens || 0, entry.completion_tokens || 0);

    await pool.query(
      `INSERT INTO api_usage (service, endpoint, method, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost, status_code, duration_ms, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        entry.service,
        entry.endpoint,
        entry.method || 'POST',
        entry.model || null,
        entry.prompt_tokens || 0,
        entry.completion_tokens || 0,
        entry.total_tokens || 0,
        cost,
        entry.status_code || 200,
        entry.duration_ms || 0,
        JSON.stringify(entry.metadata || {}),
      ]
    );
  } catch (error) {
    // Non-critical — log but don't throw
    console.error('[api-usage] Failed to track:', error);
  }
}

// Wrapper for OpenAI calls that auto-tracks usage
export async function trackOpenAIUsage(
  endpoint: string,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined,
  durationMs: number,
  statusCode: number = 200,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await trackUsage({
    service: 'openai',
    endpoint,
    model,
    prompt_tokens: usage?.prompt_tokens || 0,
    completion_tokens: usage?.completion_tokens || 0,
    total_tokens: usage?.total_tokens || 0,
    status_code: statusCode,
    duration_ms: durationMs,
    metadata,
  });
}

export async function trackTwilioUsage(
  endpoint: string,
  method: string,
  durationMs: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await trackUsage({
    service: 'twilio',
    endpoint,
    method,
    duration_ms: durationMs,
    metadata,
  });
}

export async function trackGoogleUsage(
  endpoint: string,
  method: string,
  durationMs: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await trackUsage({
    service: 'google',
    endpoint,
    method,
    duration_ms: durationMs,
    metadata,
  });
}

// ─── Query helpers ─────────────────────────────────────────────────────

interface UsageSummary {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  by_service: Array<{
    service: string;
    request_count: number;
    total_tokens: number;
    total_cost: number;
  }>;
  by_model: Array<{
    model: string;
    request_count: number;
    total_tokens: number;
    total_cost: number;
  }>;
  recent: Array<{
    id: number;
    service: string;
    endpoint: string;
    model: string | null;
    total_tokens: number;
    estimated_cost: number;
    duration_ms: number;
    created_at: string;
  }>;
  daily: Array<{
    date: string;
    request_count: number;
    total_tokens: number;
    total_cost: number;
  }>;
}

export async function getUsageSummary(days: number = 30): Promise<UsageSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [totals, byService, byModel, recent, daily] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) as total_requests, COALESCE(SUM(total_tokens), 0) as total_tokens, COALESCE(SUM(estimated_cost), 0) as total_cost
       FROM api_usage WHERE created_at >= $1`,
      [since]
    ),
    pool.query(
      `SELECT service, COUNT(*) as request_count, COALESCE(SUM(total_tokens), 0) as total_tokens, COALESCE(SUM(estimated_cost), 0) as total_cost
       FROM api_usage WHERE created_at >= $1
       GROUP BY service ORDER BY total_cost DESC`,
      [since]
    ),
    pool.query(
      `SELECT model, COUNT(*) as request_count, COALESCE(SUM(total_tokens), 0) as total_tokens, COALESCE(SUM(estimated_cost), 0) as total_cost
       FROM api_usage WHERE created_at >= $1 AND model IS NOT NULL
       GROUP BY model ORDER BY total_cost DESC`,
      [since]
    ),
    pool.query(
      `SELECT id, service, endpoint, model, total_tokens, estimated_cost, duration_ms, created_at
       FROM api_usage WHERE created_at >= $1
       ORDER BY created_at DESC LIMIT 50`,
      [since]
    ),
    pool.query(
      `SELECT DATE(created_at) as date, COUNT(*) as request_count, COALESCE(SUM(total_tokens), 0) as total_tokens, COALESCE(SUM(estimated_cost), 0) as total_cost
       FROM api_usage WHERE created_at >= $1
       GROUP BY DATE(created_at) ORDER BY date DESC`,
      [since]
    ),
  ]);

  return {
    total_requests: parseInt(totals.rows[0]?.total_requests || '0'),
    total_tokens: parseInt(totals.rows[0]?.total_tokens || '0'),
    total_cost: parseFloat(totals.rows[0]?.total_cost || '0'),
    by_service: byService.rows.map((r: { service: string; request_count: string; total_tokens: string; total_cost: string }) => ({
      service: r.service,
      request_count: parseInt(r.request_count),
      total_tokens: parseInt(r.total_tokens),
      total_cost: parseFloat(r.total_cost),
    })),
    by_model: byModel.rows.map((r: { model: string; request_count: string; total_tokens: string; total_cost: string }) => ({
      model: r.model,
      request_count: parseInt(r.request_count),
      total_tokens: parseInt(r.total_tokens),
      total_cost: parseFloat(r.total_cost),
    })),
    recent: recent.rows,
    daily: daily.rows.map((r: { date: string; request_count: string; total_tokens: string; total_cost: string }) => ({
      date: r.date,
      request_count: parseInt(r.request_count),
      total_tokens: parseInt(r.total_tokens),
      total_cost: parseFloat(r.total_cost),
    })),
  };
}
