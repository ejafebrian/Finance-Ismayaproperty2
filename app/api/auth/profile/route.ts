import { NextRequest, NextResponse } from 'next/server';
import {
  extractTokenFromRequest,
  getCookieOptions,
  SESSION_COOKIE_NAME,
  signSessionToken,
  updateOwnAccount,
  verifySessionToken,
} from '@/lib/store';

export async function PATCH(req: NextRequest) {
  const token = extractTokenFromRequest(req);
  const currentUser = verifySessionToken(token);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newUsername = typeof body.newUsername === 'string' ? body.newUsername : undefined;
    const newDisplayName = typeof body.newDisplayName === 'string' ? body.newDisplayName : undefined;
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : undefined;

    if (!currentPassword) {
      return NextResponse.json(
        { error: 'Kata sandi saat ini wajib diisi.' },
        { status: 400 }
      );
    }

    const result = updateOwnAccount({
      userId: currentUser.id,
      currentPassword,
      newUsername,
      newDisplayName,
      newPassword,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const newToken = signSessionToken(result.user);
    const res = NextResponse.json({ user: result.publicUser, token: newToken });
    res.cookies.set(
      SESSION_COOKIE_NAME,
      newToken,
      getCookieOptions(req, 60 * 60 * 24 * 7)
    );
    return res;
  } catch {
    return NextResponse.json({ error: 'Gagal memperbarui profil.' }, { status: 500 });
  }
}
