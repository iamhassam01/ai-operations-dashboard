import pool from '@/lib/db';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

// ─── Settings Helpers ──────────────────────────────────────────────────

async function getSetting(key: string): Promise<string> {
  const res = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  if (res.rows.length === 0) return '';
  const val = res.rows[0].value;
  return typeof val === 'string' ? val.replace(/^"|"$/g, '') : String(val);
}

async function setSetting(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO settings (key, value, description, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, JSON.stringify(value), `Auto-set by calendar integration`]
  );
}

// ─── OAuth Flow ────────────────────────────────────────────────────────

export async function getGoogleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID || await getSetting('google_client_id');
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || await getSetting('google_client_secret');
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://gloura.me/api/auth/callback';
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}> {
  const { clientId, clientSecret, redirectUri } = await getGoogleCredentials();

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${err.error_description || err.error || res.status}`);
  }

  return res.json();
}

export async function storeTokens(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await Promise.all([
    setSetting('google_access_token', accessToken),
    setSetting('google_refresh_token', refreshToken),
    setSetting('google_token_expires_at', expiresAt),
    setSetting('google_calendar_connected', 'true'),
  ]);
}

async function refreshAccessToken(): Promise<string> {
  const { clientId, clientSecret } = await getGoogleCredentials();
  const refreshToken = await getSetting('google_refresh_token');

  if (!refreshToken) throw new Error('No refresh token stored');

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // If refresh fails, mark as disconnected
    await setSetting('google_calendar_connected', 'false');
    throw new Error(`Token refresh failed: ${err.error_description || err.error || res.status}`);
  }

  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await Promise.all([
    setSetting('google_access_token', data.access_token),
    setSetting('google_token_expires_at', expiresAt),
  ]);

  return data.access_token;
}

// Get a valid access token, refreshing if needed
export async function getValidAccessToken(): Promise<string> {
  const connected = await getSetting('google_calendar_connected');
  if (connected !== 'true') throw new Error('Google Calendar not connected');

  const expiresAt = await getSetting('google_token_expires_at');
  const accessToken = await getSetting('google_access_token');

  // Refresh if token expires within 5 minutes
  if (!expiresAt || !accessToken || new Date(expiresAt).getTime() - Date.now() < 5 * 60 * 1000) {
    return refreshAccessToken();
  }

  return accessToken;
}

// Check if Google Calendar is connected
export async function isCalendarConnected(): Promise<boolean> {
  const connected = await getSetting('google_calendar_connected');
  return connected === 'true';
}

// Disconnect Google Calendar
export async function disconnectCalendar(): Promise<void> {
  await Promise.all([
    setSetting('google_access_token', ''),
    setSetting('google_refresh_token', ''),
    setSetting('google_token_expires_at', ''),
    setSetting('google_calendar_connected', 'false'),
    setSetting('google_calendar_email', ''),
  ]);
}

// ─── Calendar API ──────────────────────────────────────────────────────

interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  attendees?: Array<{ email: string; displayName?: string }>;
  status?: string;
}

interface CalendarEventResponse {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  status: string;
  htmlLink: string;
  created: string;
  updated: string;
}

async function calendarFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getValidAccessToken();
  const url = path.startsWith('http') ? path : `${GOOGLE_CALENDAR_API}${path}`;

  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
}

// List events from the primary calendar
export async function listEvents(
  timeMin?: string,
  timeMax?: string,
  maxResults: number = 20,
): Promise<CalendarEventResponse[]> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: timeMin || new Date().toISOString(),
  });
  if (timeMax) params.set('timeMax', timeMax);

  const res = await calendarFetch(`/calendars/primary/events?${params.toString()}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Calendar list failed: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  return data.items || [];
}

// Get a single event by ID
export async function getEvent(eventId: string): Promise<CalendarEventResponse> {
  const res = await calendarFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Get event failed: ${err.error?.message || res.status}`);
  }

  return res.json();
}

// Create a new calendar event
export async function createEvent(event: CalendarEvent): Promise<CalendarEventResponse> {
  const res = await calendarFetch('/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Create event failed: ${err.error?.message || res.status}`);
  }

  return res.json();
}

// Update an existing calendar event
export async function updateEvent(eventId: string, event: Partial<CalendarEvent>): Promise<CalendarEventResponse> {
  const res = await calendarFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Update event failed: ${err.error?.message || res.status}`);
  }

  return res.json();
}

// Delete (cancel) a calendar event
export async function deleteEvent(eventId: string): Promise<void> {
  const res = await calendarFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });

  if (!res.ok && res.status !== 410) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Delete event failed: ${err.error?.message || res.status}`);
  }
}

// Check free/busy for a time range
export async function getFreeBusy(
  timeMin: string,
  timeMax: string,
): Promise<Array<{ start: string; end: string }>> {
  const res = await calendarFetch('/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: 'primary' }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`FreeBusy failed: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  return data.calendars?.primary?.busy || [];
}

// Detect conflicts for a proposed time range
export async function detectConflicts(
  startTime: string,
  endTime: string,
): Promise<{ hasConflict: boolean; conflicts: CalendarEventResponse[] }> {
  const events = await listEvents(startTime, endTime, 10);
  return {
    hasConflict: events.length > 0,
    conflicts: events,
  };
}

// Get today's events summary (for heartbeat/cron)
export async function getTodaysSummary(): Promise<{
  events: CalendarEventResponse[];
  conflicts: Array<{ event1: string; event2: string; overlap: string }>;
  nextEvent: CalendarEventResponse | null;
}> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  const events = await listEvents(startOfDay, endOfDay, 50);

  // Detect overlapping events
  const conflicts: Array<{ event1: string; event2: string; overlap: string }> = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const e1Start = new Date(events[i].start.dateTime || events[i].start.date || '');
      const e1End = new Date(events[i].end.dateTime || events[i].end.date || '');
      const e2Start = new Date(events[j].start.dateTime || events[j].start.date || '');
      const e2End = new Date(events[j].end.dateTime || events[j].end.date || '');

      if (e1Start < e2End && e2Start < e1End) {
        conflicts.push({
          event1: events[i].summary,
          event2: events[j].summary,
          overlap: `${e2Start.toLocaleTimeString()} - ${(e1End < e2End ? e1End : e2End).toLocaleTimeString()}`,
        });
      }
    }
  }

  // Find next upcoming event
  const upcoming = events.filter((e) => {
    const start = new Date(e.start.dateTime || e.start.date || '');
    return start > now;
  });

  return {
    events,
    conflicts,
    nextEvent: upcoming[0] || null,
  };
}

// Get the connected user's calendar email
export async function getCalendarUserInfo(): Promise<{ email: string } | null> {
  try {
    const token = await getValidAccessToken();
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { email: data.email };
  } catch {
    return null;
  }
}

// Build a context string for the AI agent
export async function buildCalendarContext(): Promise<string> {
  try {
    const connected = await isCalendarConnected();
    if (!connected) return '\nGoogle Calendar: Not connected.';

    const summary = await getTodaysSummary();
    const tz = 'Europe/Prague';

    let ctx = `\nGoogle Calendar (connected):`;

    if (summary.events.length === 0) {
      ctx += '\n- No events scheduled today.';
    } else {
      ctx += `\nToday's events (${summary.events.length}):`;
      for (const e of summary.events) {
        const start = e.start.dateTime
          ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz })
          : 'All day';
        const end = e.end.dateTime
          ? new Date(e.end.dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz })
          : '';
        ctx += `\n- ${start}${end ? `–${end}` : ''}: ${e.summary}${e.location ? ` (${e.location})` : ''}`;
      }
    }

    if (summary.conflicts.length > 0) {
      ctx += `\n⚠️ CONFLICTS DETECTED:`;
      for (const c of summary.conflicts) {
        ctx += `\n- "${c.event1}" overlaps with "${c.event2}" during ${c.overlap}`;
      }
    }

    if (summary.nextEvent) {
      const nextStart = new Date(summary.nextEvent.start.dateTime || summary.nextEvent.start.date || '');
      const diff = Math.round((nextStart.getTime() - Date.now()) / 60000);
      if (diff > 0 && diff < 120) {
        ctx += `\n📍 Next event in ${diff} minutes: "${summary.nextEvent.summary}"`;
      }
    }

    return ctx;
  } catch (error) {
    return `\nGoogle Calendar: Error fetching events — ${error instanceof Error ? error.message : 'unknown error'}`;
  }
}
