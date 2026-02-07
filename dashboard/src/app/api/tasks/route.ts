import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const status = searchParams.get('status');

    let query = `
      SELECT id, type, priority, title, description, contact_name, contact_phone, 
             contact_email, address, preferred_time_1, preferred_time_2, constraints,
             status, created_at, updated_at
      FROM tasks
    `;
    const params: string[] = [];

    if (status) {
      params.push(status);
      query += ` WHERE status = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit.toString());

    const result = await pool.query(query, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Tasks API error:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, title, description, priority, contact_name, contact_phone, contact_email, address, preferred_time_1, preferred_time_2, constraints } = body;

    if (!title || !type) {
      return NextResponse.json({ error: 'Title and type are required' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO tasks (type, title, description, priority, contact_name, contact_phone, contact_email, 
        address, preferred_time_1, preferred_time_2, constraints, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'new') 
       RETURNING *`,
      [type, title, description || null, priority || 'medium', contact_name || null, 
       contact_phone || null, contact_email || null, address || null, preferred_time_1 || null, 
       preferred_time_2 || null, constraints || null]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Create task error:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
