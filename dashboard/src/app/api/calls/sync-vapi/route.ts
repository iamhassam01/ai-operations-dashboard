import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// Extract recording URL from all possible Vapi structures
function extractRecordingUrl(vapiCall: Record<string, unknown>): string | null {
  // Top-level fields
  if (vapiCall.recordingUrl) return vapiCall.recordingUrl as string;
  if (vapiCall.stereoRecordingUrl) return vapiCall.stereoRecordingUrl as string;

  // Nested artifact
  const artifact = vapiCall.artifact as Record<string, unknown> | undefined;
  if (artifact) {
    if (artifact.recordingUrl) return artifact.recordingUrl as string;
    if (artifact.stereoRecordingUrl) return artifact.stereoRecordingUrl as string;

    const recording = artifact.recording as Record<string, unknown> | string | undefined;
    if (typeof recording === 'string') return recording;
    if (recording && typeof recording === 'object') {
      const mono = recording.mono as Record<string, unknown> | undefined;
      if (mono?.combinedUrl) return mono.combinedUrl as string;
      if (recording.url) return recording.url as string;
      if (recording.stereoUrl) return recording.stereoUrl as string;
    }
  }
  return null;
}

// Extract captured_info from transcript text
function extractCapturedInfo(transcript: string): Record<string, string> {
  const info: Record<string, string> = {};
  if (!transcript || transcript.length < 10) return info;

  const customerLines = transcript.split('\n')
    .filter((l: string) => /^(User|Customer):/i.test(l.trim()))
    .map((l: string) => l.replace(/^(User|Customer):\s*/i, '').trim());
  const customerText = customerLines.join(' ');

  const nameMatch = customerText.match(/(?:this is|my name is|i'?m|i am|it'?s)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/i);
  if (nameMatch && /^[A-Z]/.test(nameMatch[1])) info['contact_name'] = nameMatch[1].trim();

  const timeMatch = customerText.match(/(?:at|around|by|before|after)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|o'?clock)?)/i);
  if (timeMatch) info['time_mentioned'] = timeMatch[0].trim();

  const priceMatch = customerText.match(/(?:\$|€|£|USD|EUR)\s*[\d,]+(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars|euros|per\s+\w+)/i);
  if (priceMatch) info['price_mentioned'] = priceMatch[0].trim();

  const commitMatch = transcript.match(/(?:i will|i'?ll|we will|we'?ll|let me|i can|we can|sure|yes|absolutely|definitely)\s+[^.!?\n]{5,60}/gi);
  if (commitMatch && commitMatch.length > 0) {
    info['commitments'] = commitMatch.slice(0, 2).join('; ').trim();
  }

  const aiLines = transcript.split('\n')
    .filter((l: string) => /^(AI|Bot|Assistant):/i.test(l.trim()))
    .map((l: string) => l.replace(/^(AI|Bot|Assistant):\s*/i, '').trim());
  const lastAiLine = aiLines[aiLines.length - 1] || '';
  if (lastAiLine.length > 10) info['call_conclusion'] = lastAiLine.substring(0, 200);

  return info;
}

// Auto-generate summary from transcript
function generateSummary(transcript: string): string | null {
  if (!transcript || transcript.length < 20) return null;
  const lines = transcript.split('\n').filter((l: string) => l.trim());
  const keyPoints: string[] = [];
  for (const line of lines) {
    const stripped = line.replace(/^(AI|User|Bot|Assistant|Customer):\s*/i, '').trim();
    if (stripped.length > 15 && !stripped.match(/^(hi|hello|hey|goodbye|bye|thank|thanks|okay|ok|yes|no|sure|alright)\b/i)) {
      keyPoints.push(stripped);
    }
  }
  if (keyPoints.length === 0) return null;
  let summary = keyPoints.slice(0, 3).join('. ');
  if (summary.length > 300) summary = summary.substring(0, 297) + '...';
  return summary;
}

// Sync call data from Vapi API for calls missing transcript/recording
// POST /api/calls/sync-vapi
export async function POST() {
  const vapiApiKey = process.env.VAPI_API_KEY;
  if (!vapiApiKey) {
    return NextResponse.json({ error: 'VAPI_API_KEY not configured' }, { status: 500 });
  }

  try {
    // Find calls with vapi_call_id that are missing any data
    const missingRes = await pool.query(
      `SELECT id, vapi_call_id, caller_name FROM calls
       WHERE vapi_call_id IS NOT NULL
         AND (transcript IS NULL OR recording_url IS NULL OR summary IS NULL OR summary = '' OR summary LIKE 'Vapi outbound call:%'
              OR captured_info IS NULL
              OR caller_name IS NULL OR caller_name = 'the contact' OR caller_name = 'Unknown')
       ORDER BY created_at DESC
       LIMIT 20`
    );

    if (missingRes.rows.length === 0) {
      return NextResponse.json({ synced: 0, message: 'All calls already have data' });
    }

    let synced = 0;
    const errors: string[] = [];

    for (const row of missingRes.rows) {
      try {
        const res = await fetch(`https://api.vapi.ai/call/${row.vapi_call_id}`, {
          headers: { 'Authorization': `Bearer ${vapiApiKey}` },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          errors.push(`${row.vapi_call_id}: HTTP ${res.status}`);
          continue;
        }

        const vapiCall = await res.json() as Record<string, unknown>;

        // Extract transcript from all possible locations
        const artifact = vapiCall.artifact as Record<string, unknown> | undefined;
        const transcript = (vapiCall.transcript as string)
          || (artifact?.transcript as string)
          || null;

        // Extract recording URL using comprehensive nested extraction
        const recordingUrl = extractRecordingUrl(vapiCall);

        // Extract summary from multiple paths
        let summary = (vapiCall.summary as string) || null;
        if (!summary && vapiCall.analysis) {
          summary = ((vapiCall.analysis as Record<string, unknown>).summary as string) || null;
        }
        // Auto-generate summary from transcript if Vapi didn't provide one
        if (!summary && transcript) {
          summary = generateSummary(transcript);
        }

        const durationSeconds = vapiCall.durationSeconds as number | undefined;

        // Extract captured_info from transcript
        const capturedInfo = transcript ? extractCapturedInfo(transcript) : {};
        const hasCapturedInfo = Object.keys(capturedInfo).length > 0;

        // Check if caller_name needs updating
        const currentName = row.caller_name as string | null;
        const vapiCustomer = vapiCall.customer as Record<string, unknown> | undefined;
        const vapiCustomerName = vapiCustomer?.name as string | undefined;
        const extractedName = capturedInfo['contact_name'] || '';
        const needsNameUpdate = (!currentName || currentName === 'the contact' || currentName === 'Unknown') &&
          ((vapiCustomerName && vapiCustomerName !== 'the contact' && vapiCustomerName !== 'Unknown') || extractedName);
        const betterName = (vapiCustomerName && vapiCustomerName !== 'the contact' && vapiCustomerName !== 'Unknown')
          ? vapiCustomerName : (extractedName || null);

        // Build dynamic update
        const setClauses = [
          'transcript = COALESCE(transcript, $1)',
          'recording_url = COALESCE(recording_url, $2)',
          `summary = CASE WHEN summary IS NULL OR summary = '' OR summary LIKE 'Vapi outbound call:%' THEN $3 ELSE summary END`,
          'duration_seconds = COALESCE(duration_seconds, $4)',
        ];
        const params: (string | number | null)[] = [transcript, recordingUrl, summary, durationSeconds ?? null];
        let paramIdx = 5;

        if (hasCapturedInfo) {
          setClauses.push(`captured_info = COALESCE(captured_info, $${paramIdx}::jsonb)`);
          params.push(JSON.stringify(capturedInfo));
          paramIdx++;
        }

        if (needsNameUpdate && betterName) {
          setClauses.push(`caller_name = CASE WHEN caller_name IS NULL OR caller_name = 'the contact' OR caller_name = 'Unknown' THEN $${paramIdx} ELSE caller_name END`);
          params.push(betterName);
          paramIdx++;
        }

        params.push(row.id);
        await pool.query(
          `UPDATE calls SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
          params
        );

        synced++;
      } catch (err) {
        errors.push(`${row.vapi_call_id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({ synced, total: missingRes.rows.length, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    console.error('Vapi sync error:', error);
    return NextResponse.json({ error: 'Failed to sync' }, { status: 500 });
  }
}
