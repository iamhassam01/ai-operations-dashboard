import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, storeTokens, getCalendarUserInfo } from '@/lib/google-calendar';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    console.error('[auth/callback] User denied access:', error);
    return NextResponse.redirect(new URL('/settings?calendar=denied', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?calendar=error&msg=no_code', request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    await storeTokens(
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in
    );

    // Fetch and store the user's email
    const userInfo = await getCalendarUserInfo();
    if (userInfo?.email) {
      await pool.query(
        `INSERT INTO settings (key, value, description, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        ['google_calendar_email', JSON.stringify(userInfo.email), 'Connected Google account email']
      );
    }

    console.log('[auth/callback] Google Calendar connected successfully');
    return NextResponse.redirect(new URL('/settings?calendar=connected', request.url));
  } catch (err) {
    console.error('[auth/callback] Token exchange failed:', err);
    return NextResponse.redirect(new URL('/settings?calendar=error&msg=token_exchange_failed', request.url));
  }
}
