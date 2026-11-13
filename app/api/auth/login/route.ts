import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateUser,
  getCookieOptions,
  SESSION_COOKIE_NAME,
  signSessionToken,
} from '@/lib/store';

export async function POST(req: NextRequest) {
  try {
    let body: { username?: unknown; password?: unknown };
    try {
      body = (await req.json()) as { username?: unknown; password?: unknown };
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body.' },
        { status: 400 }
      );
    }

    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required.' },
        { status: 400 }
      );
    }

    const result = authenticateUser(username, password);
    if (!result) {
      return NextResponse.json(
        { error: 'Invalid credentials.' },
        { status: 401 }
      );
    }

    const token = signSessionToken(result.user);
    const res = NextResponse.json({ user: result.publicUser, token });
    try {
      res.cookies.set(
        SESSION_COOKIE_NAME,
        token,
        getCookieOptions(req, 60 * 60 * 24 * 7)
      );
    } catch (cookieErr) {
      console.warn('[auth/login] Failed to set session cookie:', cookieErr);
    }
    return res;
  } catch (err) {
    console.error('[auth/login] Unexpected error:', err);
    return NextResponse.json({ error: 'Authentication failed.' }, { status: 500 });
  }
}
