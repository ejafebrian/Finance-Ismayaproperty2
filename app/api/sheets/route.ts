import { NextRequest, NextResponse } from 'next/server';
import { fetchLiveSpreadsheet } from '@/lib/sheets';
import {
  extractTokenFromRequest,
  recordSpreadsheetSyncIfChanged,
  verifySessionToken,
} from '@/lib/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const user = verifySessionToken(extractTokenFromRequest(req));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const manual = req.nextUrl.searchParams.get('manual') === '1';

  try {
    const snapshot = await fetchLiveSpreadsheet();
    const rekap = snapshot.tabs.find((t) => t.meta.isSummary);
    const rowCounts: Record<string, number> = {};
    for (const tab of snapshot.tabs) {
      rowCounts[tab.meta.name] = tab.transactionCount;
    }

    const { changed } = recordSpreadsheetSyncIfChanged({
      signature: snapshot.signature,
      totalPaid: rekap?.overview?.totalPaid ?? 0,
      remainingBalance: rekap?.overview?.remainingBalance ?? 0,
      tabCount: snapshot.tabs.length,
      rowCounts,
      actor: user,
      manual,
    });

    return NextResponse.json(
      { snapshot, changed },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sync Google Spreadsheet.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
