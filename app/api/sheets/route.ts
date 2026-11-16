import { NextResponse } from 'next/server';
import { fetchLiveSpreadsheet } from '@/lib/sheets';
import { recordSpreadsheetSyncIfChanged } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
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
