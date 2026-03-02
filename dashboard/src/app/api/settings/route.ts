import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { redactSettingValue } from '@/lib/security';

export async function GET() {
  try {
    const result = await pool.query('SELECT key, value, description, updated_at FROM settings ORDER BY key');
    // Redact sensitive values before sending to client
    const redacted = result.rows.map((row: { key: string; value: string; description: string; updated_at: string }) => ({
      ...row,
      value: redactSettingValue(row.key, row.value),
    }));
    return NextResponse.json(redacted);
  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { key, value } = await request.json();

    if (!key || typeof key !== 'string' || key.length > 255) {
      return NextResponse.json({ error: 'Valid key is required' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO settings (key, value, updated_at) 
       VALUES ($1, $2, NOW()) 
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
       RETURNING *`,
      [key, JSON.stringify(value)]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Update setting error:', error);
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 });
  }
}
