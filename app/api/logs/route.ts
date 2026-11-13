import { NextRequest, NextResponse } from 'next/server';
import {
  appendLog,
  extractTokenFromRequest,
  getLogs,
  verifySessionToken,
} from '@/lib/store';
import type { ActivityCategory } from '@/lib/types';

export async function GET(req: NextRequest) {
  const user = verifySessionToken(extractTokenFromRequest(req));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const logs = getLogs(300);
  return NextResponse.json({ logs });
}

export async function POST(req: NextRequest) {
  const user = verifySessionToken(extractTokenFromRequest(req));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const validCategories: ActivityCategory[] = [
      'auth',
      'credentials',
      'user_management',
      'spreadsheet_sync',
      'export',
    ];
    const category: ActivityCategory = validCategories.includes(body.category)
      ? body.category
      : 'export';

    const entry = appendLog({
      actorUsername: user.username,
      actorDisplayName: user.displayName,
      actorRole: user.role,
      category,
      action: typeof body.action === 'string' ? body.action.slice(0, 64) : 'CLIENT_EVENT',
      description: typeof body.description === 'string' ? body.description.slice(0, 240) : '',
      details: typeof body.details === 'string' ? body.details.slice(0, 240) : undefined,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Gagal mencatat log aktivitas.' }, { status: 500 });
  }
}
