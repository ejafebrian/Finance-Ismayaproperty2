import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatRupiah } from './format';
import type {
  ActivityLogEntry,
  Language,
  ParsedSheetTab,
  SpreadsheetSnapshot,
} from './types';

const LOGO_URL = '/assets/aistudio/436288cc-2e74-4fc9-b640-0cf371e4aa32_53fea3f7.png';

async function loadLogoDataUrl(): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Logo failed to load'));
      img.src = LOGO_URL;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 200;
    canvas.height = img.naturalHeight || 100;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    };
  } catch {
    return null;
  }
}

function formatLocalTimestamp(isoString: string, lang: Language, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: timezone,
    }).format(new Date(isoString));
  } catch {
    return new Date(isoString).toLocaleString();
  }
}

function drawReportHeader(
  doc: jsPDF,
  logo: { dataUrl: string; width: number; height: number } | null,
  title: string,
  subtitle: string,
  metaLine: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;

  // Top dark accent bar
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, pageWidth, 4, 'F');
  doc.setFillColor(158, 138, 78);
  doc.rect(0, 4, pageWidth, 1.2, 'F');

  let textStartX = marginX;
  if (logo) {
    const logoH = 12;
    const logoW = (logo.width / logo.height) * logoH;
    doc.addImage(logo.dataUrl, 'PNG', marginX, 11, logoW, logoH);
    textStartX = marginX + logoW + 4;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.text('ISMAYA PROPERTY', textStartX, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128);
  doc.text(subtitle, textStartX, 21);

  // Right-aligned metadata
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(metaLine, pageWidth - marginX, 16, { align: 'right' });

  // Divider
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(marginX, 26, pageWidth - marginX, 26);

  // Section Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(17, 24, 39);
  doc.text(title, marginX, 34);

  return 39;
}

function addFootersToAllPages(doc: jsPDF, lang: Language) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.25);
    doc.line(marginX, pageHeight - 14, pageWidth - marginX, pageHeight - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);

    const copyright =
      lang === 'id'
        ? '© 2026 ISMAYA PROPERTY · Laporan Pembayaran Tanah Utan Kayu'
        : '© 2026 ISMAYA PROPERTY · Utan Kayu Land Payment Ledger';
    doc.text(copyright, marginX, pageHeight - 9);

    const pageText =
      lang === 'id' ? `Halaman ${i} dari ${pageCount}` : `Page ${i} of ${pageCount}`;
    doc.text(pageText, pageWidth - marginX, pageHeight - 9, { align: 'right' });
  }
}

export async function exportTabToPdf(params: {
  tab: ParsedSheetTab;
  snapshotFetchedAt: string;
  lang: Language;
  timezone: string;
  filteredRows?: ParsedSheetTab['rows'];
}) {
  const { tab, snapshotFetchedAt, lang, timezone, filteredRows } = params;
  const rowsToExport = filteredRows ?? tab.rows;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await loadLogoDataUrl();

  const subtitle =
    lang === 'id'
      ? 'Laporan Resmi Rincian Pembayaran Tanah Utan Kayu'
      : 'Official Utan Kayu Land Payment Report';
  const generatedStr = `${lang === 'id' ? 'Dicetak' : 'Generated'}: ${formatLocalTimestamp(
    new Date().toISOString(),
    lang,
    timezone
  )} (${timezone})`;
  const title = tab.meta.isSummary
    ? lang === 'id'
      ? 'Rekapitulasi Dana Masuk ke Pemilik Tanah Utan Kayu'
      : 'Utan Kayu Land Payment Master Recapitulation'
    : `${lang === 'id' ? 'Rincian Pembayaran' : 'Payment Ledger'} — ${tab.meta.name}`;

  let startY = drawReportHeader(doc, logo, title, subtitle, generatedStr);

  // Sync timestamp note
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  doc.text(
    `${lang === 'id' ? 'Sinkronisasi Data Google Sheet' : 'Google Sheets Synced At'}: ${formatLocalTimestamp(
      snapshotFetchedAt,
      lang,
      timezone
    )}`,
    14,
    startY
  );
  startY += 5;

  // Summary strip table
  if (tab.meta.isSummary && tab.overview) {
    autoTable(doc, {
      startY,
      head: [
        [
          lang === 'id' ? 'Total Harga Tanah' : 'Total Land Obligation',
          lang === 'id' ? 'Total Dana Masuk' : 'Total Funds Paid',
          lang === 'id' ? 'Sisa Pembayaran' : 'Remaining Balance',
          lang === 'id' ? 'Progres Pelunasan' : 'Completion',
        ],
      ],
      body: [
        [
          formatRupiah(tab.overview.totalObligation),
          formatRupiah(tab.overview.totalPaid),
          formatRupiah(tab.overview.remainingBalance),
          `${tab.overview.progressPercent.toFixed(2)}%`,
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 3, textColor: [17, 24, 39] },
      headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
    });
    startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  } else {
    const filteredTotal = rowsToExport.reduce((s, r) => s + (r.amount ?? 0), 0);
    autoTable(doc, {
      startY,
      head: [
        [
          lang === 'id' ? 'Kategori / Penerima' : 'Category / Recipient',
          lang === 'id' ? 'Jumlah Transaksi' : 'Transactions',
          lang === 'id' ? 'Total Terbayar (Sheet)' : 'Total Disbursed (Sheet)',
          lang === 'id' ? 'Pembayaran Terakhir' : 'Latest Payment',
        ],
      ],
      body: [
        [
          tab.meta.name,
          String(rowsToExport.length),
          formatRupiah(filteredRows ? filteredTotal : tab.declaredTotal ?? tab.computedTotal),
          tab.latestDate || '-',
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 3, textColor: [17, 24, 39] },
      headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
    });
    startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // Main Table
  const isSummary = tab.meta.isSummary;
  const headCols = isSummary
    ? [
        [
          'No',
          lang === 'id' ? 'Tanggal' : 'Date',
          lang === 'id' ? 'Rincian' : 'Description',
          lang === 'id' ? 'Jumlah' : 'Amount',
          lang === 'id' ? 'Sisa Total' : 'Remaining',
          lang === 'id' ? 'Keterangan' : 'Notes',
        ],
      ]
    : [
        [
          'No',
          lang === 'id' ? 'Tanggal' : 'Date',
          lang === 'id' ? 'Rincian' : 'Description',
          lang === 'id' ? 'Jumlah' : 'Amount',
          lang === 'id' ? 'Akumulasi' : 'Cumulative',
        ],
      ];

  const bodyRows = rowsToExport.map((row, idx) =>
    isSummary
      ? [
          String(idx + 1),
          row.dateRaw,
          row.description,
          row.amountFormatted,
          row.runningBalanceFormatted,
          row.note || '-',
        ]
      : [
          String(idx + 1),
          row.dateRaw,
          row.description,
          row.amountFormatted,
          row.runningBalanceFormatted,
        ]
  );

  const sumAmount = rowsToExport.reduce((acc, r) => acc + (r.amount ?? 0), 0);
  const totalRow = isSummary
    ? ['', '', lang === 'id' ? 'TOTAL TERFILTER' : 'TOTAL', formatRupiah(sumAmount), '', '']
    : ['', '', 'TOTAL', formatRupiah(filteredRows ? sumAmount : tab.declaredTotal ?? sumAmount), ''];

  autoTable(doc, {
    startY,
    head: headCols,
    body: [...bodyRows, totalRow],
    theme: 'striped',
    styles: {
      fontSize: 8,
      cellPadding: 2.6,
      textColor: [31, 41, 55],
      lineColor: [229, 231, 235],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [17, 24, 39],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: isSummary
      ? {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 27 },
          2: { cellWidth: 58 },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 30, halign: 'right' },
          5: { cellWidth: 27 },
        }
      : {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 32 },
          2: { cellWidth: 74 },
          3: { cellWidth: 32, halign: 'right' },
          4: { cellWidth: 32, halign: 'right' },
        },
    didParseCell: (data) => {
      if (data.row.index === bodyRows.length) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [243, 240, 229];
        data.cell.styles.textColor = [17, 24, 39];
      }
    },
    margin: { left: 14, right: 14, bottom: 20 },
  });

  // Also include Legal & Summary tables if Rekapitulasi and unfiltered
  if (isSummary && !filteredRows && tab.legalCosts && tab.legalCosts.rows.length > 0) {
    const nextY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(17, 24, 39);
    doc.text(
      lang === 'id'
        ? 'Pengurusan Dokumen Legalitas / Sertifikat'
        : 'Legal & Certificate Processing Fees',
      14,
      nextY
    );
    autoTable(doc, {
      startY: nextY + 3,
      head: [
        [
          'No',
          lang === 'id' ? 'Tanggal' : 'Date',
          lang === 'id' ? 'Rincian' : 'Description',
          lang === 'id' ? 'Jumlah' : 'Amount',
          lang === 'id' ? 'Keterangan' : 'Notes',
        ],
      ],
      body: [
        ...tab.legalCosts.rows.map((item, idx) => [
          String(idx + 1),
          item.dateRaw,
          item.description,
          item.amountFormatted,
          item.note || '-',
        ]),
        ['', '', 'TOTAL', formatRupiah(tab.legalCosts.total), ''],
      ],
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 80 },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 32 },
      },
      didParseCell: (data) => {
        if (data.row.index === tab.legalCosts!.rows.length) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [243, 240, 229];
        }
      },
      margin: { left: 14, right: 14, bottom: 20 },
    });
  }

  addFootersToAllPages(doc, lang);
  const safeName = tab.meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  doc.save(`ISMAYA-PROPERTY-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportRekapSubSectionToPdf(params: {
  section: 'legal' | 'summary';
  tab: ParsedSheetTab;
  snapshotFetchedAt: string;
  lang: Language;
  timezone: string;
}) {
  const { section, tab, snapshotFetchedAt, lang, timezone } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await loadLogoDataUrl();

  const isLegal = section === 'legal';
  const title = isLegal
    ? lang === 'id'
      ? 'Pengurusan Dokumen Legalitas & Sertifikat'
      : 'Legal & Certificate Processing Fees'
    : lang === 'id'
      ? 'Rekapitulasi Ringkasan per Kategori & Pemilik'
      : 'Summary Breakdown by Category & Owner';

  const generatedStr = `${lang === 'id' ? 'Dicetak' : 'Generated'}: ${formatLocalTimestamp(
    new Date().toISOString(),
    lang,
    timezone
  )} (${timezone})`;

  let startY = drawReportHeader(
    doc,
    logo,
    title,
    lang === 'id' ? 'Utan Kayu · Laporan Rincian Khusus' : 'Utan Kayu · Sub-Ledger Report',
    generatedStr
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  doc.text(
    `${lang === 'id' ? 'Sinkronisasi Data' : 'Data Synced'}: ${formatLocalTimestamp(
      snapshotFetchedAt,
      lang,
      timezone
    )}`,
    14,
    startY
  );
  startY += 5;

  if (isLegal && tab.legalCosts) {
    autoTable(doc, {
      startY,
      head: [
        [
          'No',
          lang === 'id' ? 'Tanggal' : 'Date',
          lang === 'id' ? 'Rincian' : 'Description',
          lang === 'id' ? 'Jumlah' : 'Amount',
          lang === 'id' ? 'Catatan' : 'Note',
        ],
      ],
      body: [
        ...tab.legalCosts.rows.map((r, i) => [
          String(i + 1),
          r.dateRaw,
          r.description,
          r.amountFormatted,
          r.note || '-',
        ]),
        ['', '', 'TOTAL', formatRupiah(tab.legalCosts.total), ''],
      ],
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 3 },
      headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 30 },
        2: { cellWidth: 78 },
        3: { cellWidth: 34, halign: 'right' },
        4: { cellWidth: 30 },
      },
      didParseCell: (data) => {
        if (data.row.index === tab.legalCosts!.rows.length) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [243, 240, 229];
        }
      },
      margin: { left: 14, right: 14, bottom: 20 },
    });
  } else if (!isLegal && tab.summaryItems) {
    const totalPaid = tab.overview?.totalPaid ?? tab.summaryItems.reduce((s, x) => s + x.amount, 0);
    autoTable(doc, {
      startY,
      head: [
        [
          'No',
          lang === 'id' ? 'Tanggal Update' : 'Date',
          lang === 'id' ? 'Kategori / Pemilik' : 'Category / Owner',
          lang === 'id' ? 'Jumlah Dana Masuk' : 'Disbursed Amount',
        ],
      ],
      body: [
        ...tab.summaryItems.map((item, i) => [
          String(i + 1),
          item.dateRaw,
          item.label,
          item.amountFormatted,
        ]),
        ['', '', lang === 'id' ? 'TOTAL DANA MASUK' : 'TOTAL FUNDS PAID', formatRupiah(totalPaid)],
      ],
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 3.2 },
      headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 34 },
        2: { cellWidth: 92 },
        3: { cellWidth: 44, halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.row.index === tab.summaryItems!.length) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [243, 240, 229];
        }
      },
      margin: { left: 14, right: 14, bottom: 20 },
    });
  }

  addFootersToAllPages(doc, lang);
  doc.save(`ISMAYA-PROPERTY-${section}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportAllTabsToPdf(params: {
  snapshot: SpreadsheetSnapshot;
  lang: Language;
  timezone: string;
}) {
  const { snapshot, lang, timezone } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await loadLogoDataUrl();

  const generatedStr = `${lang === 'id' ? 'Dicetak' : 'Generated'}: ${formatLocalTimestamp(
    new Date().toISOString(),
    lang,
    timezone
  )} (${timezone})`;

  let currentY = drawReportHeader(
    doc,
    logo,
    lang === 'id'
      ? 'Laporan Komprehensif Pembayaran Tanah Utan Kayu'
      : 'Comprehensive Utan Kayu Land Payment Report',
    lang === 'id'
      ? 'Seluruh Kategori Pemilik & Rekapitulasi Dana Masuk'
      : 'All Owner Categories & Master Recapitulation',
    generatedStr
  );

  const rekap = snapshot.tabs.find((t) => t.meta.isSummary);
  if (rekap?.overview) {
    autoTable(doc, {
      startY: currentY,
      head: [
        [
          lang === 'id' ? 'Total Harga Tanah' : 'Total Obligation',
          lang === 'id' ? 'Total Dana Masuk' : 'Total Funds Paid',
          lang === 'id' ? 'Sisa Pembayaran' : 'Remaining Balance',
          lang === 'id' ? 'Progres' : 'Progress',
        ],
      ],
      body: [
        [
          formatRupiah(rekap.overview.totalObligation),
          formatRupiah(rekap.overview.totalPaid),
          formatRupiah(rekap.overview.remainingBalance),
          `${rekap.overview.progressPercent.toFixed(2)}%`,
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [158, 138, 78], textColor: [255, 255, 255] },
      margin: { left: 14, right: 14 },
    });
    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  for (let tIdx = 0; tIdx < snapshot.tabs.length; tIdx++) {
    const tab = snapshot.tabs[tIdx];
    if (tIdx > 0) {
      doc.addPage();
      currentY = drawReportHeader(
        doc,
        logo,
        `${lang === 'id' ? 'Kategori' : 'Category'}: ${tab.meta.name}`,
        lang === 'id' ? 'Rincian Pembayaran Tanah Utan Kayu' : 'Utan Kayu Land Payment Ledger',
        generatedStr
      );
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(17, 24, 39);
      doc.text(`${lang === 'id' ? 'Kategori' : 'Category'}: ${tab.meta.name}`, 14, currentY);
      currentY += 4;
    }

    const bodyRows = tab.rows.map((r, idx) => [
      String(idx + 1),
      r.dateRaw,
      r.description,
      r.amountFormatted,
      r.runningBalanceFormatted,
    ]);
    const totalVal = tab.declaredTotal ?? tab.computedTotal;

    autoTable(doc, {
      startY: currentY,
      head: [
        [
          'No',
          lang === 'id' ? 'Tanggal' : 'Date',
          lang === 'id' ? 'Rincian' : 'Description',
          lang === 'id' ? 'Jumlah' : 'Amount',
          tab.meta.isSummary
            ? lang === 'id'
              ? 'Sisa Total'
              : 'Remaining'
            : lang === 'id'
              ? 'Akumulasi'
              : 'Cumulative',
        ],
      ],
      body: [...bodyRows, ['', '', 'TOTAL', formatRupiah(totalVal), '']],
      theme: 'striped',
      styles: { fontSize: 7.8, cellPadding: 2.3 },
      headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 78 },
        3: { cellWidth: 33, halign: 'right' },
        4: { cellWidth: 33, halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.row.index === bodyRows.length) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [243, 240, 229];
        }
      },
      margin: { left: 14, right: 14, bottom: 20 },
    });
  }

  addFootersToAllPages(doc, lang);
  doc.save(`ISMAYA-PROPERTY-LENGKAP-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportActivityLogToPdf(params: {
  logs: ActivityLogEntry[];
  lang: Language;
  timezone: string;
}) {
  const { logs, lang, timezone } = params;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const logo = await loadLogoDataUrl();

  const generatedStr = `${lang === 'id' ? 'Dicetak' : 'Generated'}: ${formatLocalTimestamp(
    new Date().toISOString(),
    lang,
    timezone
  )} (${timezone})`;

  const startY = drawReportHeader(
    doc,
    logo,
    lang === 'id' ? 'Laporan Log Aktivitas Pengguna & Sinkronisasi' : 'User & Sync Activity Audit Log',
    lang === 'id' ? 'Audit Keamanan & Perubahan Data Sistem' : 'System Security & Data Change Audit Trail',
    generatedStr
  );

  autoTable(doc, {
    startY,
    head: [
      [
        'No',
        lang === 'id' ? 'Waktu Lokal' : 'Local Time',
        lang === 'id' ? 'Pengguna' : 'User',
        lang === 'id' ? 'Kategori' : 'Category',
        lang === 'id' ? 'Aktivitas' : 'Activity',
        lang === 'id' ? 'Detail' : 'Details',
      ],
    ],
    body: logs.map((log, i) => [
      String(i + 1),
      formatLocalTimestamp(log.timestamp, lang, timezone),
      `${log.actorDisplayName} (@${log.actorUsername})`,
      log.category,
      log.description,
      log.details || '-',
    ]),
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 42 },
      2: { cellWidth: 45 },
      3: { cellWidth: 30 },
      4: { cellWidth: 78 },
      5: { cellWidth: 64 },
    },
    margin: { left: 14, right: 14, bottom: 20 },
  });

  addFootersToAllPages(doc, lang);
  doc.save(`ISMAYA-PROPERTY-ACTIVITY-LOG-${new Date().toISOString().slice(0, 10)}.pdf`);
}
