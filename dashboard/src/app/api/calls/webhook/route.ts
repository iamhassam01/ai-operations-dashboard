import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// Twilio sends POST to this endpoint when an inbound call arrives
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string;
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const callStatus = formData.get('CallStatus') as string;

    // Look up contact name from contacts table
    let callerName = 'Unknown Caller';
    if (from) {
      const contactRes = await pool.query(
        'SELECT name FROM contacts WHERE phone_number = $1 LIMIT 1',
        [from]
      );
      if (contactRes.rows.length > 0 && contactRes.rows[0].name) {
        callerName = contactRes.rows[0].name;
      }
    }

    // Log the inbound call to database
    const callRes = await pool.query(
      `INSERT INTO calls (id, twilio_call_sid, direction, phone_number, caller_name, status, started_at, created_at)
       VALUES (gen_random_uuid(), $1, 'inbound', $2, $3, 'in_progress', NOW(), NOW())
       ON CONFLICT (twilio_call_sid) DO UPDATE SET status = 'in_progress', started_at = NOW()
       RETURNING id`,
      [callSid, from, callerName]
    );

    const callId = callRes.rows[0]?.id;

    // Log event
    if (callId) {
      await pool.query(
        `INSERT INTO call_logs (id, call_id, event_type, event_data, created_at)
         VALUES (gen_random_uuid(), $1, 'inbound_received', $2, NOW())`,
        [callId, JSON.stringify({ from, to, callStatus, callSid })]
      );
    }

    // Create notification for inbound call
    const adminUser = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (adminUser.rows[0]) {
      await pool.query(
        `INSERT INTO notifications (id, user_id, type, title, message, related_call_id, created_at)
         VALUES (gen_random_uuid(), $1, 'call_completed', $2, $3, $4, NOW())`,
        [
          adminUser.rows[0].id,
          `Inbound call from ${callerName}`,
          `Incoming call from ${from}. ${callerName !== 'Unknown Caller' ? `Contact: ${callerName}` : 'Unknown contact.'}`,
          callId,
        ]
      );
    }

    // Check office hours
    const hoursRes = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('operating_hours_start', 'operating_hours_end', 'timezone')"
    );
    const settingsMap: Record<string, string> = {};
    hoursRes.rows.forEach((r: { key: string; value: string }) => {
      settingsMap[r.key] = typeof r.value === 'string' ? r.value.replace(/"/g, '') : String(r.value);
    });

    const tz = settingsMap.timezone || 'Europe/Prague';
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', hour12: false, timeZone: tz });
    const currentTime = formatter.format(now);
    const startHour = settingsMap.operating_hours_start || '09:00';
    const endHour = settingsMap.operating_hours_end || '18:00';
    const isOfficeHours = currentTime >= startHour && currentTime < endHour;

    // Build the status callback URL
    const host = request.headers.get('host') || '';
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const statusCallbackUrl = `${proto}://${host}/api/calls/status`;

    // Build TwiML response
    const agentNameRes = await pool.query("SELECT value FROM settings WHERE key = 'agent_identity'");
    const agentIdentity = agentNameRes.rows[0]?.value?.replace(/"/g, '') || 'Mr. Ermakov';

    let twiml: string;

    if (isOfficeHours) {
      // During office hours: greet, record, and gather speech
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello, thank you for calling. This is ${agentIdentity} speaking. How can I help you today?</Say>
  <Record maxLength="120" action="${proto}://${host}/api/calls/webhook?event=recording_complete&amp;callDbId=${callId}" 
          recordingStatusCallback="${statusCallbackUrl}" 
          recordingStatusCallbackEvent="completed" 
          transcribe="true" 
          transcribeCallback="${proto}://${host}/api/calls/status?event=transcription"
          playBeep="false" timeout="5" />
  <Say voice="alice">I did not hear anything. Please call back during our office hours. Goodbye.</Say>
</Response>`;
    } else {
      // Outside office hours: take a message
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello, thank you for calling. Our office hours are from ${startHour} to ${endHour}, ${tz} time. 
  Please leave a message after the tone, and we will return your call as soon as possible.</Say>
  <Record maxLength="180" 
          recordingStatusCallback="${statusCallbackUrl}" 
          recordingStatusCallbackEvent="completed"
          transcribe="true" 
          transcribeCallback="${proto}://${host}/api/calls/status?event=transcription"
          playBeep="true" timeout="5" />
  <Say voice="alice">Thank you for your message. Goodbye.</Say>
</Response>`;
    }

    // Log agent activity
    await pool.query(
      `INSERT INTO agent_logs (id, action, details, status, created_at)
       VALUES (gen_random_uuid(), 'inbound_call_handled', $1, 'success', NOW())`,
      [JSON.stringify({ callSid, from, callerName, officeHours: isOfficeHours })]
    );

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('Inbound webhook error:', error);
    // Return a basic TwiML even on error so the caller hears something
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We are currently experiencing technical difficulties. Please try again later. Goodbye.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(fallbackTwiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
