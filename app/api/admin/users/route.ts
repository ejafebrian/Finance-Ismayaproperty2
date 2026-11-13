import { NextRequest, NextResponse } from 'next/server';
import {
  createManagedUser,
  extractTokenFromRequest,
  listAllUsers,
  verifySessionToken,
} from '@/lib/store';
import type { UserRole } from '@/lib/types';

export async function GET(req: NextRequest) {
  const user = verifySessionToken(extractTokenFromRequest(req));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ users: listAllUsers() });
}

export async function POST(req: NextRequest) {
  const actor = verifySessionToken(extractTokenFromRequest(req));
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (actor.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const role: UserRole = body.role === 'admin' ? 'admin' : 'staff';
    const result = createManagedUser(actor, {
      username: typeof body.username === 'string' ? body.username : '',
      displayName: typeof body.displayName === 'string' ? body.displayName : '',
      password: typeof body.password === 'string' ? body.password : '',
      role,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ user: result.user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Gagal membuat pengguna baru.' }, { status: 500 });
  }
}
