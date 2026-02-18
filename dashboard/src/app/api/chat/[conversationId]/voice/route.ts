import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// POST — receive audio blob, transcribe via OpenAI Whisper, then send as a chat message
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!openaiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Verify conversation exists
    const convCheck = await pool.query(
      'SELECT id FROM conversations WHERE id = $1',
      [conversationId]
    );
    if (convCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Get the audio from the multipart form data
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Send to OpenAI Whisper for transcription
    const whisperForm = new FormData();
    whisperForm.append('file', audioFile, 'voice.webm');
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('language', 'en');

    const whisperResponse = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: whisperForm,
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!whisperResponse.ok) {
      const errData = await whisperResponse.json().catch(() => null);
      console.error('Whisper API error:', errData);
      return NextResponse.json(
        { error: errData?.error?.message || 'Transcription failed' },
        { status: 502 }
      );
    }

    const whisperData = await whisperResponse.json();
    const transcript = whisperData.text?.trim();

    if (!transcript) {
      return NextResponse.json(
        { error: 'Could not transcribe audio — no speech detected' },
        { status: 422 }
      );
    }

    // Now forward the transcript to the send endpoint internally
    const sendUrl = new URL(
      `/api/chat/${conversationId}/send`,
      request.nextUrl.origin
    );
    const sendResponse = await fetch(sendUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: transcript }),
      signal: AbortSignal.timeout(60000),
    });

    const sendData = await sendResponse.json();

    return NextResponse.json({
      transcript,
      ...sendData,
    });
  } catch (error) {
    console.error('Voice route error:', error);
    return NextResponse.json(
      { error: 'Voice processing failed' },
      { status: 500 }
    );
  }
}
