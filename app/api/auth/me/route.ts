import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromRequest, verifySessionToken } from '@/lib/store';

export async function GET(req: NextRequest) {
  const token = extractTokenFromRequest(req);
  const user = verifySessionToken(token);
  return NextResponse.json({ user });
}
