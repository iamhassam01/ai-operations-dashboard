import { NextRequest, NextResponse } from 'next/server';
import { getFreeBusy, detectConflicts, isCalendarConnected } from '@/lib/google-calendar';
import { trackGoogleUsage } from '@/lib/api-usage';

// GET /api/calendar/availability — check free/busy or detect conflicts
export async function GET(request: NextRequest) {
  try {
    const connected = await isCalendarConnected();
    if (!connected) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const timeMin = searchParams.get('timeMin');
    const timeMax = searchParams.get('timeMax');
    const mode = searchParams.get('mode') || 'freebusy'; // 'freebusy' or 'conflicts'

    if (!timeMin || !timeMax) {
      return NextResponse.json(
        { error: 'Missing required parameters: timeMin, timeMax' },
        { status: 400 }
      );
    }

    const start = Date.now();

    if (mode === 'conflicts') {
      const result = await detectConflicts(timeMin, timeMax);
      await trackGoogleUsage('calendar/availability/conflicts', 'GET', Date.now() - start);
      return NextResponse.json(result);
    }

    const busySlots = await getFreeBusy(timeMin, timeMax);
    await trackGoogleUsage('calendar/availability/freebusy', 'GET', Date.now() - start);

    return NextResponse.json({
      timeMin,
      timeMax,
      busy: busySlots,
      busyCount: busySlots.length,
    });
  } catch (error) {
    console.error('[calendar/availability] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check availability' },
      { status: 500 }
    );
  }
}
