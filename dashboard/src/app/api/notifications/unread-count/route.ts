import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) as count FROM notifications WHERE is_read = false"
    );

    return NextResponse.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Notifications count error:', error);
    return NextResponse.json({ count: 0 });
  }
}
