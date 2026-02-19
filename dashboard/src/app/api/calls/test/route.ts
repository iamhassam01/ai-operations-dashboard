import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const toNumber = body.to;

    if (!toNumber || typeof toNumber !== 'string') {
      return NextResponse.json(
        { error: 'Please provide a valid phone number in E.164 format (e.g., +1234567890)' },
        { status: 400 }
      );
    }

    // Validate E.164 format
    if (!/^\+[1-9]\d{6,14}$/.test(toNumber)) {
      return NextResponse.json(
        { error: 'Phone number must be in E.164 format (e.g., +1234567890)' },
        { status: 400 }
      );
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return NextResponse.json(
        { error: 'Twilio credentials not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in environment.' },
        { status: 500 }
      );
    }

    // Use inline TwiML with recording enabled
    const twiml = `<Response><Say voice="alice">Hello! This is a test call from your AI Operations Dashboard. The Twilio integration is working correctly. Goodbye!</Say><Pause length="1"/><Hangup/></Response>`;

    // Build status callback URL for recording/status updates
    const host = request.headers.get('host') || '';
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const statusCallbackUrl = `${proto}://${host}/api/calls/status`;

    // Make the call via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;

    const params = new URLSearchParams();
    params.append('To', toNumber);
    params.append('From', fromNumber);
    params.append('Twiml', twiml);
    params.append('Record', 'true');
    params.append('StatusCallback', statusCallbackUrl);
    params.append('StatusCallbackEvent', 'initiated ringing answered completed');
    params.append('StatusCallbackMethod', 'POST');

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Twilio API error:', data);
      return NextResponse.json(
        { error: data.message || 'Twilio API error', code: data.code },
        { status: response.status }
      );
    }

    // Log the call in our database with twilio_call_sid for status tracking
    const pool = (await import('@/lib/db')).default;
    await pool.query(
      `INSERT INTO calls (id, twilio_call_sid, direction, phone_number, caller_name, status, summary, created_at)
       VALUES (gen_random_uuid(), $1, 'outbound', $2, 'Test Call', 'pending', $3, NOW())`,
      [data.sid, toNumber, `Test call to ${toNumber}`]
    );

    return NextResponse.json({
      success: true,
      callSid: data.sid,
      status: data.status,
      to: data.to,
      from: data.from,
    });
  } catch (error) {
    console.error('Test call error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to place test call: ${message}` },
      { status: 500 }
    );
  }
}
