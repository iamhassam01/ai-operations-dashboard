import { NextRequest, NextResponse } from 'next/server';
import { getUsageSummary } from '@/lib/api-usage';

// GET /api/api-usage — get API usage statistics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);

    const clampedDays = Math.min(Math.max(days, 1), 365);
    const summary = await getUsageSummary(clampedDays);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('[api-usage] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API usage data' },
      { status: 500 }
    );
  }
}
