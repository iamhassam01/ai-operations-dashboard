import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// Health check endpoint — checks all service connections
export async function GET() {
  const checks: Record<string, { status: string; detail: string }> = {};

  // 1. Database check
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    const latency = Date.now() - start;
    checks.database = { status: 'connected', detail: `PostgreSQL OK (${latency}ms)` };
  } catch {
    checks.database = { status: 'error', detail: 'PostgreSQL unreachable' };
  }

  // 2. OpenClaw check
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const ocUrl = process.env.OPENCLAW_URL || 'http://127.0.0.1:18789';
    const res = await fetch(`${ocUrl}/api/v1/status`, {
      signal: controller.signal,
      headers: process.env.OPENCLAW_TOKEN
        ? { 'Authorization': `Bearer ${process.env.OPENCLAW_TOKEN}` }
        : {},
    });
    clearTimeout(timeout);
    checks.openclaw = res.ok
      ? { status: 'connected', detail: 'OpenClaw Active' }
      : { status: 'error', detail: `OpenClaw returned ${res.status}` };
  } catch {
    // Try a simpler health ping
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const ocUrl = process.env.OPENCLAW_URL || 'http://127.0.0.1:18789';
      const res = await fetch(ocUrl, { signal: controller.signal });
      clearTimeout(timeout);
      checks.openclaw = { status: 'connected', detail: `OpenClaw responding (${res.status})` };
    } catch {
      checks.openclaw = { status: 'error', detail: 'OpenClaw unreachable' };
    }
  }

  // 3. Twilio check
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  if (twilioSid && twilioToken) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}.json`,
        {
          signal: controller.signal,
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64'),
          },
        }
      );
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        checks.twilio = { status: 'connected', detail: `Twilio Active (${data.friendly_name || data.status})` };
      } else {
        checks.twilio = { status: 'error', detail: `Twilio auth failed (${res.status})` };
      }
    } catch {
      checks.twilio = { status: 'error', detail: 'Twilio unreachable' };
    }
  } else {
    checks.twilio = { status: 'pending', detail: 'Twilio not configured' };
  }

  // 4. OpenAI check
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('https://api.openai.com/v1/models', {
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${openaiKey}` },
      });
      clearTimeout(timeout);
      if (res.ok) {
        checks.openai = { status: 'connected', detail: 'OpenAI Active' };
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData?.error?.code === 'insufficient_quota'
          ? 'Quota exceeded'
          : `Error (${res.status})`;
        checks.openai = { status: 'error', detail: `OpenAI: ${errMsg}` };
      }
    } catch {
      checks.openai = { status: 'error', detail: 'OpenAI unreachable' };
    }
  } else {
    checks.openai = { status: 'pending', detail: 'OpenAI not configured' };
  }

  // Overall status
  const allStatuses = Object.values(checks).map(c => c.status);
  const overall = allStatuses.every(s => s === 'connected') ? 'healthy'
    : allStatuses.some(s => s === 'error') ? 'degraded'
    : 'partial';

  return NextResponse.json({ status: overall, services: checks, timestamp: new Date().toISOString() });
}
