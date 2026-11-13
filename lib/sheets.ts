import crypto from 'node:crypto';
import { formatRupiah } from './format';
import type {
  LegalCostItem,
  ParsedSheetTab,
  PaymentRow,
  ReconciliationCheckItem,
  ReconciliationSummary,
  RekapOverviewMetrics,
  RekapSummaryItem,
  SheetTabMeta,
  SpreadsheetSnapshot,
} from './types';

export const VERIFIED_SPREADSHEET_ID = '1CBpf-5mqdROw_6BubILIzKH8H3yMuIDxL-CamEX3ENE';

function resolveSpreadsheetId(raw?: string): string {
  if (!raw || !raw.trim()) return VERIFIED_SPREADSHEET_ID;
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) return urlMatch[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return VERIFIED_SPREADSHEET_ID;
}

export const DEFAULT_SPREADSHEET_ID = resolveSpreadsheetId(process.env.GOOGLE_SPREADSHEET_ID);

export const SPREADSHEET_SHARE_URL = `https://docs.google.com/spreadsheets/d/${DEFAULT_SPREADSHEET_ID}/edit?usp=sharing`;

export function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell.trim());
        cell = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows;
}

export function parseRupiahAmount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isNegative =
    (trimmed.includes('(') && trimmed.includes(')')) || trimmed.startsWith('-');

  // Remove "Rp", ".", spaces, parentheses
  let cleaned = trimmed.replace(/rp\.?/gi, '').replace(/[()\s]/g, '');
  if (!cleaned) return null;

  // Sheet formats like "4,700,000,000.00" or "2,184,000,000" or "8.271.822"
  // Detect comma-thousands with optional dot-decimal
  if (/^-?[\d,]+(\.\d{1,2})?$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (/^-?[\d.]+(,\d{1,2})?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    cleaned = cleaned.replace(/[^\d.-]/g, '');
  }

  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  const abs = Math.abs(num);
  return isNegative ? -abs : abs;
}

const MONTH_MAP: Record<string, number> = {
  january: 1, januari: 1, jan: 1,
  february: 2, februari: 2, feb: 2,
  march: 3, maret: 3, mar: 3,
  april: 4, apr: 4,
  may: 5, mei: 5,
  june: 6, juni: 6, jun: 6,
  july: 7, juli: 7, jul: 7,
  august: 8, agustus: 8, aug: 8, agu: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oktober: 10, oct: 10, okt: 10,
  november: 11, nov: 11,
  december: 12, desember: 12, dec: 12, des: 12,
};

export function parseSheetDate(raw: string | undefined | null): { iso: string | null; year: number | null } {
  if (!raw) return { iso: null, year: null };
  const cleaned = raw.trim();
  if (!cleaned) return { iso: null, year: null };

  // Match "27 October 2020" or "7 March 2022"
  const m = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = MONTH_MAP[m[2].toLowerCase()];
    const year = Number(m[3]);
    if (month && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { iso, year };
    }
  }

  // Fallback year extraction
  const ym = cleaned.match(/\b(20\d{2})\b/);
  return {
    iso: null,
    year: ym ? Number(ym[1]) : null,
  };
}

function slugifyTab(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function discoverTabs(spreadsheetId: string): Promise<{ title: string; tabs: SheetTabMeta[] }> {
  const htmlUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`;
  const res = await fetch(htmlUrl, {
    cache: 'no-store',
    headers: { 'User-Agent': 'IsmayaPropertyLedger/1.0' },
  });

  if (!res.ok) {
    throw new Error(`Google Sheets metadata fetch failed (${res.status})`);
  }

  const html = await res.text();
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const rawTitle = titleMatch
    ? titleMatch[1].replace(/\s*-\s*Google.*$/i, '').trim()
    : 'RINCIAN DANA MASUK KE PEMILIK TANAH UTAN KAYU (TERBARU)';

  const itemsRegex = /items\.push\(\{name:\s*"([^"]+)"[^}]*?gid:\s*"(\d+)"/g;
  const tabs: SheetTabMeta[] = [];
  const seenGids = new Set<string>();

  for (const match of html.matchAll(itemsRegex)) {
    const name = match[1].replace(/\\u0026/g, '&').trim();
    const gid = match[2].trim();
    if (!seenGids.has(gid)) {
      seenGids.add(gid);
      tabs.push({
        name,
        gid,
        slug: slugifyTab(name) || gid,
        isSummary: name.toLowerCase().includes('rekapitulasi'),
      });
    }
  }

  if (tabs.length === 0) {
    // Fallback known tabs if HTML structure shifts slightly
    const fallback: [string, string][] = [
      ['Rekapitulasi', '1525379144'],
      ['Pak Teguh', '618864916'],
      ['Pak Kukuh', '378283187'],
      ['Pak Agung', '1091487335'],
      ['Ibu Iweng', '1652530378'],
      ['Kerohiman Bu Erna', '299992904'],
    ];
    for (const [name, gid] of fallback) {
      tabs.push({
        name,
        gid,
        slug: slugifyTab(name),
        isSummary: name.toLowerCase().includes('rekapitulasi'),
      });
    }
  }

  return { title: rawTitle, tabs };
}

function parseRekapitulasiTab(meta: SheetTabMeta, matrix: string[][], allTabs: SheetTabMeta[]): ParsedSheetTab {
  const mainRows: PaymentRow[] = [];
  const legalRows: LegalCostItem[] = [];
  const summaryItems: RekapSummaryItem[] = [];

  let totalObligation = 4700000000;
  let totalPaidSummary = 0;
  let remainingBalanceSummary = 0;
  let legalTotal = 0;

  let section: 'main' | 'legal' | 'summary' | 'footer_totals' = 'main';

  for (let i = 0; i < matrix.length; i++) {
    const r = matrix[i];
    const colA = (r[0] || '').trim();
    const colB = (r[1] || '').trim();
    const colC = (r[2] || '').trim();
    const colD = (r[3] || '').trim();
    const colE = (r[4] || '').trim();

    if (!colA && !colB && !colC && !colD && !colE) continue;

    // Main title row & header row
    if (colA.toUpperCase().includes('RINCIAN DANA MASUK')) continue;
    if (colA.toUpperCase() === 'TANGGAL' && colB.toUpperCase().startsWith('RINCIAN')) continue;

    // Detect section headers (may appear in colA or colB)
    if (
      (colA.toUpperCase().includes('PENGURUSAN DOKUMEN LEGALITAS') ||
        colB.toUpperCase().includes('PENGURUSAN DOKUMEN LEGALITAS')) &&
      section === 'main'
    ) {
      section = 'legal';
      continue;
    }
    if (colA.toUpperCase() === 'REKAPITULASI' || colB.toUpperCase() === 'REKAPITULASI') {
      section = 'summary';
      continue;
    }
    if (
      !colA &&
      colB.toUpperCase() === 'RINCIAN' &&
      colC.toUpperCase() === 'JUMLAH' &&
      section !== 'main'
    ) {
      section = 'footer_totals';
      continue;
    }

    if (
      colA.toUpperCase().includes('TOTAL PEMBAYARAN TANAH UTAN KAYU GANG DUREN') ||
      colB.toUpperCase().includes('TOTAL PEMBAYARAN TANAH UTAN KAYU GANG DUREN')
    ) {
      const val = parseRupiahAmount(colC) ?? parseRupiahAmount(colD);
      if (val && val > 0) totalObligation = val;
      continue;
    }

    if (section === 'main') {
      // Check if we hit the standalone remaining balance line right after last main installment
      if (!colA && !colB && !colC && colD) {
        continue;
      }
      if (!colA && !colB && colC && colD && parseRupiahAmount(colC) && parseRupiahAmount(colD)) {
        // Summary line at bottom of main ledger (e.g. total paid, total remaining)
        continue;
      }

      const amount = parseRupiahAmount(colC);
      const running = parseRupiahAmount(colD);
      if (!colB && amount === null) continue;

      const { iso, year } = parseSheetDate(colA);
      mainRows.push({
        id: `${meta.gid}-r-${i}`,
        rowIndex: i + 1,
        dateRaw: colA || '-',
        dateIso: iso,
        year,
        description: colB,
        amount,
        amountFormatted: amount !== null ? formatRupiah(amount) : '-',
        runningBalance: running,
        runningBalanceFormatted: running !== null ? formatRupiah(running) : '-',
        note: colE,
      });
    } else if (section === 'legal') {
      if (colA.toUpperCase() === 'TANGGAL' && colB.toUpperCase().startsWith('RINCIAN')) continue;
      const amount = parseRupiahAmount(colC);
      if (colB.toUpperCase() === 'TOTAL') {
        if (amount !== null) legalTotal = amount;
        continue;
      }
      if (colB && amount !== null) {
        legalRows.push({
          id: `${meta.gid}-leg-${i}`,
          dateRaw: colA || '-',
          description: colB,
          amount,
          amountFormatted: formatRupiah(amount),
          note: colD || colE || '',
        });
      }
    } else if (section === 'summary') {
      const amount = parseRupiahAmount(colC);
      if (colA.toUpperCase() === 'TOTAL' || colB.toUpperCase() === 'TOTAL') {
        if (amount !== null) totalPaidSummary = amount;
        section = 'footer_totals';
        continue;
      }
      if (colB && amount !== null) {
        const lower = colB.toLowerCase();
        const linked = allTabs.find((t) => {
          const tn = t.name.toLowerCase().replace(/^pak\s+|^ibu\s+/i, '');
          return lower.includes(tn);
        });
        summaryItems.push({
          id: `${meta.gid}-sum-${i}`,
          dateRaw: colA || '-',
          label: colB,
          amount,
          amountFormatted: formatRupiah(amount),
          linkedTabName: linked?.name,
        });
      }
    } else if (section === 'footer_totals') {
      const amount = parseRupiahAmount(colC);
      if (colA.toUpperCase().includes('SEHARUSNYA') && amount !== null) {
        totalObligation = amount;
      } else if (colA.toUpperCase().includes('DANA MASUK') && amount !== null) {
        totalPaidSummary = amount;
      } else if (colA.toUpperCase().includes('SISA PEMBAYARAN') && amount !== null) {
        remainingBalanceSummary = amount;
      }
    }
  }

  // Compute totals directly from mainRows if summary is absent or to verify accuracy
  const computedMainPaid = mainRows.reduce((acc, row) => acc + (row.amount ?? 0), 0);
  const totalPaid = totalPaidSummary > 0 ? totalPaidSummary : computedMainPaid;
  const remainingBalance =
    remainingBalanceSummary > 0
      ? remainingBalanceSummary
      : Math.max(0, totalObligation - totalPaid);
  const progressPercent =
    totalObligation > 0 ? Math.min(100, Math.round((totalPaid / totalObligation) * 10000) / 100) : 0;

  // Yearly breakdown from main chronological rows
  const yearMap = new Map<number, { totalAmount: number; transactionCount: number }>();
  for (const row of mainRows) {
    if (row.year && row.amount !== null) {
      const prev = yearMap.get(row.year) || { totalAmount: 0, transactionCount: 0 };
      yearMap.set(row.year, {
        totalAmount: prev.totalAmount + row.amount,
        transactionCount: prev.transactionCount + 1,
      });
    }
  }
  const yearlyBreakdown = [...yearMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, val]) => ({
      year,
      totalAmount: val.totalAmount,
      transactionCount: val.transactionCount,
    }));

  // Latest dated transaction
  const datedRows = mainRows.filter((r) => r.dateIso);
  datedRows.sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));
  const latestDate = datedRows[0]?.dateRaw || null;

  const positiveRows = mainRows.filter((r) => (r.amount ?? 0) > 0);
  const averageAmount =
    positiveRows.length > 0
      ? positiveRows.reduce((sum, r) => sum + (r.amount ?? 0), 0) / positiveRows.length
      : 0;

  const bookingFee =
    summaryItems.find((s) => s.label.toLowerCase().includes('booking'))?.amount ?? 10000000;
  const downPayment =
    summaryItems.find((s) => s.label.toLowerCase().includes('awal'))?.amount ?? 270000000;
  const effectiveLegalTotal =
    legalTotal > 0 ? legalTotal : legalRows.reduce((sum, r) => sum + r.amount, 0);

  const overview: RekapOverviewMetrics = {
    totalObligation,
    totalPaid,
    remainingBalance,
    progressPercent,
    bookingFee,
    downPayment,
    legalFeesTotal: effectiveLegalTotal,
    ownerTotals: summaryItems.map((item) => ({
      name: item.label,
      gid: allTabs.find((t) => t.name === item.linkedTabName)?.gid,
      amount: item.amount,
      percentOfPaid: totalPaid > 0 ? Math.round((item.amount / totalPaid) * 1000) / 10 : 0,
      transactionCount: 0,
    })),
    yearlyBreakdown,
  };

  return {
    meta,
    title: 'Rincian Dana Masuk ke Pemilik Tanah Utan Kayu (Gang Duren 2)',
    headers: ['Tanggal', 'Rincian', 'Jumlah', 'Sisa Total', 'Keterangan'],
    rows: mainRows,
    declaredTotal: totalPaid,
    computedTotal: computedMainPaid,
    transactionCount: mainRows.length,
    latestDate,
    averageAmount,
    legalCosts: {
      title: 'Pengurusan Dokumen Legalitas / Sertifikat',
      rows: legalRows,
      total: effectiveLegalTotal,
    },
    summaryItems,
    overview,
  };
}

function parseDetailTab(meta: SheetTabMeta, matrix: string[][]): ParsedSheetTab {
  let title = meta.name;
  let headerRowIdx = -1;
  let headers: string[] = ['Tanggal', 'Rincian', 'Jumlah'];

  for (let i = 0; i < Math.min(matrix.length, 6); i++) {
    const r = matrix[i].map((c) => c.trim());
    const joined = r.join(' ').toUpperCase();
    if (
      joined.includes('TANGGAL') &&
      (joined.includes('RINCIAN') || joined.includes('JUMLAH'))
    ) {
      headerRowIdx = i;
      headers = r.filter(Boolean);
      if (headers.length < 3) {
        headers = ['Tanggal', 'Rincian', 'Jumlah'];
      }
      break;
    } else if (i === 0 && r[0] && !r[1]) {
      title = r[0];
    }
  }

  const startIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  const rows: PaymentRow[] = [];
  let declaredTotal: number | null = null;
  let runningTotal = 0;

  for (let i = startIdx; i < matrix.length; i++) {
    const r = matrix[i];
    const colA = (r[0] || '').trim();
    const colB = (r[1] || '').trim();
    const colC = (r[2] || '').trim();
    const colD = (r[3] || '').trim();

    if (!colA && !colB && !colC) continue;

    if (
      colB.toUpperCase() === 'TOTAL' ||
      colA.toUpperCase() === 'TOTAL'
    ) {
      const tVal = parseRupiahAmount(colC) ?? parseRupiahAmount(colB);
      if (tVal !== null) declaredTotal = tVal;
      continue;
    }

    const amount = parseRupiahAmount(colC);
    if (!colB && amount === null) continue;

    if (amount !== null) runningTotal += amount;
    const { iso, year } = parseSheetDate(colA);

    rows.push({
      id: `${meta.gid}-r-${i}`,
      rowIndex: rows.length + 1,
      dateRaw: colA || '-',
      dateIso: iso,
      year,
      description: colB || '-',
      amount,
      amountFormatted: amount !== null ? formatRupiah(amount) : '-',
      runningBalance: runningTotal,
      runningBalanceFormatted: formatRupiah(runningTotal),
      note: colD,
    });
  }

  const computedTotal = rows.reduce((acc, r) => acc + (r.amount ?? 0), 0);
  const datedRows = rows.filter((r) => r.dateIso);
  datedRows.sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));
  const latestDate = datedRows[0]?.dateRaw || null;
  const averageAmount = rows.length > 0 ? computedTotal / rows.length : 0;

  return {
    meta,
    title,
    headers,
    rows,
    declaredTotal: declaredTotal ?? computedTotal,
    computedTotal,
    transactionCount: rows.length,
    latestDate,
    averageAmount,
  };
}

function computeMatchPercent(expectedAmount: number, actualAmount: number): number {
  if (expectedAmount === actualAmount) return 100;
  const denom = Math.max(Math.abs(expectedAmount), Math.abs(actualAmount), 1);
  const raw = (1 - Math.abs(actualAmount - expectedAmount) / denom) * 100;
  const rounded = Math.max(0, Math.min(100, Math.round(raw * 100) / 100));
  return rounded >= 100 ? 99.99 : rounded;
}

function buildReconciliationSummary(parsedTabs: ParsedSheetTab[]): ReconciliationSummary {
  const checks: ReconciliationCheckItem[] = [];
  const rekap = parsedTabs.find((t) => t.meta.isSummary);

  if (rekap && rekap.overview) {
    const summarySum = (rekap.summaryItems || []).reduce((acc, s) => acc + s.amount, 0);
    checks.push({
      id: 'summary_paid_vs_items',
      scope: 'summary_balance',
      label: 'Total Dana Masuk vs Penjumlahan Pos Rekapitulasi',
      sourceLabel: 'Footer Rekapitulasi (Dana Masuk)',
      targetLabel: `Jumlah ${rekap.summaryItems?.length || 0} Pos Rekapitulasi`,
      expectedAmount: rekap.overview.totalPaid,
      actualAmount: summarySum,
      rawDifference: summarySum - rekap.overview.totalPaid,
      rawMatchPercent: computeMatchPercent(rekap.overview.totalPaid, summarySum),
      linkedGid: rekap.meta.gid,
    });

    const computedRemaining = Math.max(0, rekap.overview.totalObligation - rekap.overview.totalPaid);
    checks.push({
      id: 'summary_remaining_balance',
      scope: 'summary_balance',
      label: 'Sisa Pembayaran (Harga Tanah - Dana Masuk) vs Footer',
      sourceLabel: 'Footer Rekapitulasi (Sisa Pembayaran)',
      targetLabel: 'Kewajiban Rp 4,7M − Total Dana Masuk',
      expectedAmount: rekap.overview.remainingBalance,
      actualAmount: computedRemaining,
      rawDifference: computedRemaining - rekap.overview.remainingBalance,
      rawMatchPercent: computeMatchPercent(rekap.overview.remainingBalance, computedRemaining),
      linkedGid: rekap.meta.gid,
    });

    // Cross-tab checks: Rekapitulasi summary line vs owner tab
    for (const item of rekap.summaryItems || []) {
      if (!item.linkedTabName) continue;
      const matchedTab = parsedTabs.find((t) => t.meta.name === item.linkedTabName);
      if (!matchedTab) continue;
      const tabTotal = matchedTab.declaredTotal ?? matchedTab.computedTotal;
      checks.push({
        id: `cross_${matchedTab.meta.gid}`,
        scope: 'cross_tab',
        label: `Sinkronisasi Rekapitulasi ↔ Tab ${matchedTab.meta.name}`,
        sourceLabel: `Rekapitulasi (${item.label})`,
        targetLabel: `Tab ${matchedTab.meta.name}`,
        expectedAmount: item.amount,
        actualAmount: tabTotal,
        rawDifference: tabTotal - item.amount,
        rawMatchPercent: computeMatchPercent(item.amount, tabTotal),
        linkedGid: matchedTab.meta.gid,
      });
    }

    // Rekapitulasi main chronological rows vs official summary total paid
    const commissionNotes = rekap.rows
      .filter((r) => /komisi|dihilangkan/i.test(`${r.description} ${r.note}`))
      .map((r) => `${r.dateRaw}: ${r.amountFormatted} (${r.note || r.description})`);
    const mainDiff = rekap.computedTotal - rekap.overview.totalPaid;
    checks.push({
      id: 'rekap_chronological_vs_official',
      scope: 'tab_internal',
      label: 'Rekapitulasi: Jumlah Baris Kronologis vs Total Dana Masuk Resmi',
      sourceLabel: 'Total Dana Masuk Resmi (Rekapitulasi)',
      targetLabel: `Penjumlahan ${rekap.rows.length} Baris Kronologis`,
      expectedAmount: rekap.overview.totalPaid,
      actualAmount: rekap.computedTotal,
      rawDifference: mainDiff,
      rawMatchPercent: computeMatchPercent(rekap.overview.totalPaid, rekap.computedTotal),
      note:
        mainDiff !== 0 && commissionNotes.length > 0
          ? `Catatan pada sheet: ${commissionNotes.join('; ')}`
          : undefined,
      suggestedReason:
        mainDiff !== 0
          ? commissionNotes.length > 0
            ? `Penyesuaian catatan komisi/selisih kronologis (${commissionNotes[0]}) agar klop dengan Total Dana Masuk resmi.`
            : 'Penyesuaian selisih penjumlahan baris kronologis terhadap Rekapitulasi resmi.'
          : undefined,
      linkedGid: rekap.meta.gid,
    });

    // Legal costs section declared total vs sum of legal rows
    if (rekap.legalCosts) {
      const legalRowsSum = rekap.legalCosts.rows.reduce((acc, r) => acc + r.amount, 0);
      const legalDiff = legalRowsSum - rekap.legalCosts.total;
      const kotaPrajaRow = rekap.legalCosts.rows.find((r) =>
        /kota\s*praja|pak\s*teguh/i.test(`${r.description} ${r.note}`)
      );
      checks.push({
        id: 'rekap_legal_section',
        scope: 'legal_section',
        label: 'Dokumen Legalitas: Total Deklarasi vs Jumlah Baris Legalitas',
        sourceLabel: 'Total Dokumen Legalitas (Rekapitulasi)',
        targetLabel: `Penjumlahan ${rekap.legalCosts.rows.length} Baris Legalitas`,
        expectedAmount: rekap.legalCosts.total,
        actualAmount: legalRowsSum,
        rawDifference: legalDiff,
        rawMatchPercent: computeMatchPercent(rekap.legalCosts.total, legalRowsSum),
        note:
          legalDiff !== 0 && kotaPrajaRow
            ? `Baris informasi "${kotaPrajaRow.description}" (${kotaPrajaRow.amountFormatted} · ${kotaPrajaRow.note}) tidak dimasukkan ke total biaya legalitas.`
            : undefined,
        suggestedReason:
          legalDiff !== 0 && kotaPrajaRow
            ? `Eksklusi pos informasi ${kotaPrajaRow.description} (${kotaPrajaRow.amountFormatted}) yang sudah tercatat di pengambilan Pak Teguh.`
            : undefined,
        linkedGid: rekap.meta.gid,
      });
    }
  }

  // Per-tab internal math audit for all detail tabs
  for (const tab of parsedTabs) {
    if (tab.meta.isSummary) continue;
    const declared = tab.declaredTotal ?? tab.computedTotal;
    const isKerohiman = tab.meta.name.toLowerCase().includes('kerohiman');
    checks.push({
      id: `tab_internal_${tab.meta.gid}`,
      scope: 'tab_internal',
      label: `Audit Internal Tab ${tab.meta.name} (Total Deklarasi vs ${tab.transactionCount} Baris)`,
      sourceLabel: `Sel TOTAL Tab ${tab.meta.name}`,
      targetLabel: `Penjumlahan ${tab.transactionCount} Baris Transaksi`,
      expectedAmount: declared,
      actualAmount: tab.computedTotal,
      rawDifference: tab.computedTotal - declared,
      rawMatchPercent: computeMatchPercent(declared, tab.computedTotal),
      note: isKerohiman
        ? 'Tab terpisah (Kerohiman Bu Erna — di luar komponen pokok harga tanah Rp 4,7M).'
        : undefined,
      linkedGid: tab.meta.gid,
    });
  }

  const rawMatchedCount = checks.filter((c) => c.rawDifference === 0).length;
  const rawOverallPercent =
    checks.length > 0
      ? Math.round(
          (checks.reduce((sum, c) => sum + c.rawMatchPercent, 0) / checks.length) * 100
        ) / 100
      : 100;

  return {
    checks,
    rawMatchedCount,
    totalChecks: checks.length,
    rawOverallPercent:
      rawMatchedCount === checks.length ? 100 : Math.min(99.99, rawOverallPercent),
  };
}

export async function fetchLiveSpreadsheet(
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID
): Promise<SpreadsheetSnapshot> {
  let effectiveId = resolveSpreadsheetId(spreadsheetId);
  let discovered: { title: string; tabs: SheetTabMeta[] };
  try {
    discovered = await discoverTabs(effectiveId);
  } catch (err) {
    if (effectiveId !== VERIFIED_SPREADSHEET_ID) {
      effectiveId = VERIFIED_SPREADSHEET_ID;
      discovered = await discoverTabs(effectiveId);
    } else {
      throw err;
    }
  }
  const { title, tabs: discoveredTabs } = discovered;

  const csvResults = await Promise.all(
    discoveredTabs.map(async (tab) => {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${effectiveId}/export?format=csv&gid=${tab.gid}`;
      const res = await fetch(csvUrl, {
        cache: 'no-store',
        headers: { 'User-Agent': 'IsmayaPropertyLedger/1.0' },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch tab ${tab.name} (${res.status})`);
      }
      const csvText = await res.text();
      return { tab, matrix: parseCsv(csvText) };
    })
  );

  const parsedTabs: ParsedSheetTab[] = csvResults.map(({ tab, matrix }) =>
    tab.isSummary
      ? parseRekapitulasiTab(tab, matrix, discoveredTabs)
      : parseDetailTab(tab, matrix)
  );

  // Enrich Rekapitulasi ownerTotals transactionCount from matching detail tabs
  const rekap = parsedTabs.find((t) => t.meta.isSummary);
  if (rekap?.overview) {
    rekap.overview.ownerTotals = rekap.overview.ownerTotals.map((owner) => {
      const matchedTab = parsedTabs.find((t) => t.meta.gid === owner.gid);
      return {
        ...owner,
        transactionCount: matchedTab ? matchedTab.transactionCount : 0,
      };
    });
  }

  const reconciliation = buildReconciliationSummary(parsedTabs);

  const sigPayload = parsedTabs.map((t) => ({
    gid: t.meta.gid,
    name: t.meta.name,
    count: t.transactionCount,
    total: t.declaredTotal ?? t.computedTotal,
    rowsDigest: t.rows.map((r) => `${r.dateRaw}|${r.description}|${r.amount}`).join(';'),
  }));
  const signature = crypto
    .createHash('sha256')
    .update(JSON.stringify(sigPayload))
    .digest('hex')
    .slice(0, 16);

  return {
    spreadsheetId: effectiveId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${effectiveId}/edit?usp=sharing`,
    spreadsheetTitle: title,
    fetchedAt: new Date().toISOString(),
    signature,
    tabs: parsedTabs,
    reconciliation,
  };
}
