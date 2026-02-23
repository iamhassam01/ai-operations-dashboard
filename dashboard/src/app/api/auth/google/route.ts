import { NextResponse } from 'next/server';
import { getGoogleCredentials, buildAuthUrl } from '@/lib/google-calendar';

export async function GET() {
  try {
    const { clientId, redirectUri } = await getGoogleCredentials();

    if (!clientId) {
      return NextResponse.json(
        { error: 'Google Calendar credentials not configured' },
        { status: 400 }
      );
    }

    const authUrl = buildAuthUrl(clientId, redirectUri);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('[auth/google] Error:', error);
    return NextResponse.json(
      { error: 'Failed to start Google OAuth flow' },
      { status: 500 }
    );
  }
}
