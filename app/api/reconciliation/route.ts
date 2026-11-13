import { NextRequest, NextResponse } from 'next/server';
import {
  deleteReconciliationAdjustment,
  extractTokenFromRequest,
  getReconciliationAdjustments,
  upsertReconciliationAdjustment,
  verifySessionToken,
} from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = verifySessionToken(extractTokenFromRequest(req));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({ adjustments: getReconciliationAdjustments() });
}

export async function POST(req: NextRequest) {
  const user = verifySessionToken(extractTokenFromRequest(req));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const checkId = typeof body.checkId === 'string' ? body.checkId.trim() : '';
    const checkLabel = typeof body.checkLabel === 'string' ? body.checkLabel.trim() : checkId;
    const mode = body.mode === 'nominal' ? 'nominal' : 'percent';
    const percentValue = typeof body.percentValue === 'number' && Number.isFinite(body.percentValue)
      ? body.percentValue
      : 0;
    const nominalDelta = typeof body.nominalDelta === 'number' && Number.isFinite(body.nominalDelta)
      ? body.nominalDelta
      : 0;
    const reason = typeof body.reason === 'string' ? body.reason : '';

    if (!checkId) {
      return NextResponse.json({ error: 'checkId is required.' }, { status: 400 });
    }

    const adjustments = upsertReconciliationAdjustment(user, {
      checkId,
      checkLabel,
      mode,
      percentValue,
      nominalDelta,
      reason,
    });

    return NextResponse.json({ adjustments });
  } catch {
    return NextResponse.json(
      { error: 'Gagal menyimpan penyesuaian rekonsiliasi.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const user = verifySessionToken(extractTokenFromRequest(req));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const checkId = req.nextUrl.searchParams.get('checkId') || '';
  if (!checkId) {
    return NextResponse.json({ error: 'checkId is required.' }, { status: 400 });
  }

  const adjustments = deleteReconciliationAdjustment(user, checkId);
  return NextResponse.json({ adjustments });
}
