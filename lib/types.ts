export type Language = 'id' | 'en';
export type ThemeMode = 'light' | 'dark';
export type UserRole = 'admin' | 'staff';

export interface SheetTabMeta {
  name: string;
  gid: string;
  slug: string;
  isSummary: boolean;
}

export interface PaymentRow {
  id: string;
  rowIndex: number;
  dateRaw: string;
  dateIso: string | null;
  year: number | null;
  description: string;
  amount: number | null;
  amountFormatted: string;
  runningBalance: number | null;
  runningBalanceFormatted: string;
  note: string;
  extraColumns?: string[];
}

export interface RekapSummaryItem {
  id: string;
  dateRaw: string;
  label: string;
  amount: number;
  amountFormatted: string;
  linkedTabName?: string;
}

export interface LegalCostItem {
  id: string;
  dateRaw: string;
  description: string;
  amount: number;
  amountFormatted: string;
  note: string;
}

export interface RekapOverviewMetrics {
  totalObligation: number;
  totalPaid: number;
  remainingBalance: number;
  progressPercent: number;
  bookingFee: number;
  downPayment: number;
  legalFeesTotal: number;
  ownerTotals: {
    name: string;
    gid?: string;
    amount: number;
    percentOfPaid: number;
    transactionCount: number;
  }[];
  yearlyBreakdown: {
    year: number;
    totalAmount: number;
    transactionCount: number;
  }[];
}

export interface ParsedSheetTab {
  meta: SheetTabMeta;
  title: string;
  headers: string[];
  rows: PaymentRow[];
  declaredTotal: number | null;
  computedTotal: number;
  transactionCount: number;
  latestDate: string | null;
  averageAmount: number;
  legalCosts?: {
    title: string;
    rows: LegalCostItem[];
    total: number;
  };
  summaryItems?: RekapSummaryItem[];
  overview?: RekapOverviewMetrics;
}

export interface ReconciliationCheckItem {
  id: string;
  scope: 'summary_balance' | 'cross_tab' | 'tab_internal' | 'legal_section';
  label: string;
  sourceLabel: string;
  targetLabel: string;
  expectedAmount: number;
  actualAmount: number;
  rawDifference: number;
  rawMatchPercent: number;
  note?: string;
  suggestedReason?: string;
  linkedGid?: string;
}

export interface ReconciliationAdjustment {
  id: string;
  checkId: string;
  mode: 'percent' | 'nominal';
  percentValue: number;
  nominalDelta: number;
  reason: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ReconciliationSummary {
  checks: ReconciliationCheckItem[];
  rawMatchedCount: number;
  totalChecks: number;
  rawOverallPercent: number;
}

export interface SpreadsheetSnapshot {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  fetchedAt: string;
  signature: string;
  tabs: ParsedSheetTab[];
  reconciliation: ReconciliationSummary;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export type ActivityCategory =
  | 'auth'
  | 'credentials'
  | 'user_management'
  | 'spreadsheet_sync'
  | 'export'
  | 'reconciliation';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  actorUsername: string;
  actorDisplayName: string;
  actorRole: UserRole | 'system';
  category: ActivityCategory;
  action: string;
  description: string;
  details?: string;
}
