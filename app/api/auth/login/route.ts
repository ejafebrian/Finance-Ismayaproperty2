import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateUser,
  getCookieOptions,
  SESSION_COOKIE_NAME,
  signSessionToken,
} from '@/lib/store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
    res.cookies.set(
      SESSION_COOKIE_NAME,
      token,
      getCookieOptions(req, 60 * 60 * 24 * 7)
    );
    return res;
  } catch {
    return NextResponse.json({ error: 'Authentication failed.' }, { status: 500 });
  }
}
