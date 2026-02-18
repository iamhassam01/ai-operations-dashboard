import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// Transcribe a call's recording using OpenAI Whisper
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get the call record
    const callRes = await pool.query(
      'SELECT id, recording_url, transcript, twilio_call_sid FROM calls WHERE id = $1',
      [id]
    );

    if (callRes.rows.length === 0) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    const call = callRes.rows[0];

    if (call.transcript) {
      return NextResponse.json({ transcript: call.transcript, source: 'cached' });
    }

    if (!call.recording_url) {
      return NextResponse.json({ error: 'No recording available for this call' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Fetch the recording audio from Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    const audioResponse = await fetch(call.recording_url, {
      headers: accountSid && authToken
        ? { 'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64') }
        : {},
    });

    if (!audioResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch recording audio' }, { status: 502 });
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });

    // Transcribe with OpenAI Whisper
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.mp3');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errData = await whisperResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'Transcription failed', details: errData },
        { status: 502 }
      );
    }

    const whisperData = await whisperResponse.json();
    const transcript = whisperData.text;

    // Store transcript in database
    await pool.query(
      'UPDATE calls SET transcript = $1 WHERE id = $2',
      [transcript, id]
    );

    // Generate a summary using GPT-4o
    try {
      const summaryResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'Summarize this call transcript in 1-2 concise sentences. Focus on the key purpose and outcome.' },
            { role: 'user', content: transcript },
          ],
          max_tokens: 150,
        }),
      });

      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        const summary = summaryData.choices?.[0]?.message?.content;
        if (summary) {
          await pool.query('UPDATE calls SET summary = $1 WHERE id = $2', [summary, id]);
        }
      }
    } catch {
      // Summary is non-critical, continue without it
    }

    // Log the transcription
    await pool.query(
      `INSERT INTO call_logs (id, call_id, event_type, event_data, created_at)
       VALUES (gen_random_uuid(), $1, 'transcription_completed', $2, NOW())`,
      [id, JSON.stringify({ transcriptLength: transcript.length, source: 'whisper' })]
    );

    return NextResponse.json({ transcript, source: 'whisper' });
  } catch (error) {
    console.error('Transcription error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Transcription failed: ${message}` }, { status: 500 });
  }
}
