import { NextRequest, NextResponse } from 'next/server';
import {
  listEvents,
  createEvent,
  deleteEvent,
  isCalendarConnected,
} from '@/lib/google-calendar';
import { trackGoogleUsage } from '@/lib/api-usage';

// GET /api/calendar/events — list events for a date range
export async function GET(request: NextRequest) {
  try {
    const connected = await isCalendarConnected();
    if (!connected) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const timeMin = searchParams.get('timeMin') || undefined;
    const timeMax = searchParams.get('timeMax') || undefined;
    const maxResults = parseInt(searchParams.get('maxResults') || '20', 10);

    const start = Date.now();
    const events = await listEvents(timeMin, timeMax, maxResults);
    await trackGoogleUsage('calendar/events/list', 'GET', Date.now() - start, { count: events.length });

    return NextResponse.json(events);
  } catch (error) {
    console.error('[calendar/events] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch events' },
      { status: 500 }
    );
  }
}

// POST /api/calendar/events — create a new event
export async function POST(request: NextRequest) {
  try {
    const connected = await isCalendarConnected();
    if (!connected) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 400 });
    }

    const body = await request.json();

    if (!body.summary || !body.start || !body.end) {
      return NextResponse.json(
        { error: 'Missing required fields: summary, start, end' },
        { status: 400 }
      );
    }

    const event = {
      summary: String(body.summary),
      description: body.description ? String(body.description) : undefined,
      location: body.location ? String(body.location) : undefined,
      start: {
        dateTime: body.start.dateTime || body.start,
        timeZone: body.start.timeZone || 'Europe/Prague',
      },
      end: {
        dateTime: body.end.dateTime || body.end,
        timeZone: body.end.timeZone || 'Europe/Prague',
      },
      attendees: Array.isArray(body.attendees) ? body.attendees.map((a: { email: string; displayName?: string }) => ({
        email: String(a.email),
        displayName: a.displayName ? String(a.displayName) : undefined,
      })) : undefined,
    };

    const start = Date.now();
    const created = await createEvent(event);
    await trackGoogleUsage('calendar/events/create', 'POST', Date.now() - start, { eventId: created.id });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('[calendar/events] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create event' },
      { status: 500 }
    );
  }
}

// DELETE /api/calendar/events — delete an event by id
export async function DELETE(request: NextRequest) {
  try {
    const connected = await isCalendarConnected();
    if (!connected) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('id');

    if (!eventId) {
      return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
    }

    const start = Date.now();
    await deleteEvent(eventId);
    await trackGoogleUsage('calendar/events/delete', 'DELETE', Date.now() - start, { eventId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[calendar/events] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete event' },
      { status: 500 }
    );
  }
}
