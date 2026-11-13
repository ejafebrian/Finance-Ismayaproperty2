import { NextRequest, NextResponse } from 'next/server';
import {
  deleteManagedUser,
  extractTokenFromRequest,
  updateManagedUser,
  verifySessionToken,
} from '@/lib/store';
import type { UserRole } from '@/lib/types';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const actor = verifySessionToken(extractTokenFromRequest(req));
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (actor.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await req.json();
    const role: UserRole | undefined =
      body.role === 'admin' ? 'admin' : body.role === 'staff' ? 'staff' : undefined;

    const result = updateManagedUser(actor, id, {
      username: typeof body.username === 'string' ? body.username : undefined,
      displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
      password: typeof body.password === 'string' ? body.password : undefined,
      role,
      active: typeof body.active === 'boolean' ? body.active : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ user: result.user });
  } catch {
    return NextResponse.json({ error: 'Gagal memperbarui pengguna.' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const actor = verifySessionToken(extractTokenFromRequest(req));
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (actor.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const result = deleteManagedUser(actor, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
