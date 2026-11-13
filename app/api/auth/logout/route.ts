import { NextRequest, NextResponse } from 'next/server';
import {
  appendLog,
  extractTokenFromRequest,
  getCookieOptions,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from '@/lib/store';

export async function POST(req: NextRequest) {
  const token = extractTokenFromRequest(req);
  const user = verifySessionToken(token);

  if (user) {
    appendLog({
      actorUsername: user.username,
      actorDisplayName: user.displayName,
      actorRole: user.role,
      category: 'auth',
      action: 'USER_LOGOUT',
      description: `${user.displayName} (@${user.username}) keluar dari sistem.`,
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, '', getCookieOptions(req, 0));
  return res;
}
