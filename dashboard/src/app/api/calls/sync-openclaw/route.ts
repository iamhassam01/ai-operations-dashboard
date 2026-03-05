import { NextResponse } from 'next/server';
import { syncOpenClawCalls } from '@/lib/openclaw-sync';

// ─── OpenClaw Call Sync Endpoint ─────────────────────────────────────
// Reads OpenClaw's voice-calls/calls.jsonl and syncs completed/failed
// calls into the dashboard DB. Called by:
//   1. Cron job (every 30s): curl http://127.0.0.1:3000/api/calls/sync-openclaw
//   2. Dashboard calls page polling (piggybacks on GET /api/calls)

export async function GET() {
  try {
    const result = await syncOpenClawCalls();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Sync endpoint error:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
