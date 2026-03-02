import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ─── Rate Limiter (in-memory, per-IP) ─────────────────────────────────

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 120; // per window

export function rateLimit(request: NextRequest): NextResponse | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();

  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((entry.resetTime - now) / 1000)),
        },
      }
    );
  }

  return null;
}

// Clean up stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rateLimitStore) {
      if (now > val.resetTime) rateLimitStore.delete(key);
    }
  }, 300_000);
}

// ─── HMAC Webhook Verification ────────────────────────────────────────

export function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  const sig = signature.replace('sha256=', '');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

// ─── Config Redaction ────────────────────────────────────────────────

const SENSITIVE_PATTERNS = [
  /key/i, /token/i, /secret/i, /password/i, /api_key/i,
  /access_key/i, /auth/i, /credential/i, /private/i,
];

export function redactSettingValue(key: string, value: string): string {
  const isSensitive = SENSITIVE_PATTERNS.some((p) => p.test(key));
  if (!isSensitive) return value;
  if (value.length <= 8) return '••••••••';
  return value.slice(0, 4) + '••••' + value.slice(-4);
}

export function redactSettings(
  settings: { key: string; value: string }[]
): { key: string; value: string; redacted: boolean }[] {
  return settings.map((s) => {
    const isSensitive = SENSITIVE_PATTERNS.some((p) => p.test(s.key));
    return {
      key: s.key,
      value: isSensitive ? redactSettingValue(s.key, s.value) : s.value,
      redacted: isSensitive,
    };
  });
}

// ─── Input Validation ────────────────────────────────────────────────

export function sanitizeString(input: string, maxLength = 1000): string {
  return input.slice(0, maxLength).trim();
}

export function isValidId(id: string): boolean {
  // UUID or numeric ID
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
    /^\d+$/.test(id);
}

export function parsePositiveInt(value: string | null, defaultVal: number, max: number): number {
  if (!value) return defaultVal;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) return defaultVal;
  return Math.min(parsed, max);
}
