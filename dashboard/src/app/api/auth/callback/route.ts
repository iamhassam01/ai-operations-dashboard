import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, storeTokens, getCalendarUserInfo } from '@/lib/google-calendar';
import pool from '@/lib/db';

function getBaseUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  const host = request.headers.get('host');
  if (host && !host.includes('localhost')) return `https://${host}`;
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://gloura.me';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const baseUrl = getBaseUrl(request);

  if (error) {
    console.error('[auth/callback] User denied access:', error);
    return NextResponse.redirect(`${baseUrl}/settings?calendar=denied`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/settings?calendar=error&msg=no_code`);
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
    return NextResponse.redirect(`${baseUrl}/settings?calendar=connected`);
  } catch (err) {
    console.error('[auth/callback] Token exchange failed:', err);
    return NextResponse.redirect(`${baseUrl}/settings?calendar=error&msg=token_exchange_failed`);
  }
}
