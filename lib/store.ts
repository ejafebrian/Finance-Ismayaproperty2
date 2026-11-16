import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ReconciliationAdjustment } from './types';

interface StoreState {
  lastSheetSignature: string | null;
  lastSheetSummary: {
    totalPaid: number;
    remainingBalance: number;
    tabCount: number;
    rowCounts: Record<string, number>;
  } | null;
  reconciliationAdjustments: ReconciliationAdjustment[];
}

const globalForStore = globalThis as unknown as {
  __ismayaStoreState?: StoreState;
  __ismayaStoreDir?: string;
};

function isDirectoryWritable(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const probeFile = path.join(dirPath, `.write-test-${process.pid}`);
    fs.writeFileSync(probeFile, 'ok', 'utf8');
    fs.unlinkSync(probeFile);
    return true;
  } catch {
    return false;
  }
}

function getWritableDataDir(): string | null {
  if (globalForStore.__ismayaStoreDir) {
    return globalForStore.__ismayaStoreDir;
  }
  const projectDataDir = path.join(process.cwd(), '.data');
  if (isDirectoryWritable(projectDataDir)) {
    globalForStore.__ismayaStoreDir = projectDataDir;
    return projectDataDir;
  }
  const tmpDataDir = path.join(os.tmpdir(), 'ismaya-property-data');
  if (isDirectoryWritable(tmpDataDir)) {
    globalForStore.__ismayaStoreDir = tmpDataDir;
    return tmpDataDir;
  }
  return null;
}

function createInitialStore(): StoreState {
  return {
    lastSheetSignature: null,
    lastSheetSummary: null,
    reconciliationAdjustments: [],
  };
}

function tryReadStoreFile(filePath: string): StoreState | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreState>;
    return {
      lastSheetSignature:
        typeof parsed.lastSheetSignature === 'string' ? parsed.lastSheetSignature : null,
      lastSheetSummary: parsed.lastSheetSummary || null,
      reconciliationAdjustments: Array.isArray(parsed.reconciliationAdjustments)
        ? parsed.reconciliationAdjustments
        : [],
    };
  } catch {
    return null;
  }
}

function readStore(): StoreState {
  if (globalForStore.__ismayaStoreState) {
    if (!Array.isArray(globalForStore.__ismayaStoreState.reconciliationAdjustments)) {
      globalForStore.__ismayaStoreState.reconciliationAdjustments = [];
    }
    return globalForStore.__ismayaStoreState;
  }

  const writableDir = getWritableDataDir();
  const writablePath = writableDir ? path.join(writableDir, 'ismaya-store.json') : null;
  const projectPath = path.join(process.cwd(), '.data', 'ismaya-store.json');

  let loaded: StoreState | null = null;
  if (writablePath) {
    loaded = tryReadStoreFile(writablePath);
  }
  if (!loaded && projectPath !== writablePath) {
    loaded = tryReadStoreFile(projectPath);
  }
  if (!loaded) {
    loaded = createInitialStore();
  }

  globalForStore.__ismayaStoreState = loaded;
  if (writablePath && !fs.existsSync(writablePath)) {
    writeStore(loaded);
  }
  return loaded;
}

function writeStore(state: StoreState): void {
  globalForStore.__ismayaStoreState = state;
  const writableDir = getWritableDataDir();
  if (!writableDir) return;

  try {
    const storePath = path.join(writableDir, 'ismaya-store.json');
    const tmpPath = `${storePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmpPath, storePath);
  } catch (err) {
    // Non-fatal: keep in-memory state working even on read-only containers
    console.warn('[ismaya-store] Unable to persist store to disk:', err);
  }
}

export function recordSpreadsheetSyncIfChanged(params: {
  signature: string;
  totalPaid: number;
  remainingBalance: number;
  tabCount: number;
  rowCounts: Record<string, number>;
}): { changed: boolean } {
  const store = readStore();
  const prevSig = store.lastSheetSignature;
  const changed = prevSig !== null && prevSig !== params.signature;

  if (prevSig === null || changed) {
    store.lastSheetSignature = params.signature;
    store.lastSheetSummary = {
      totalPaid: params.totalPaid,
      remainingBalance: params.remainingBalance,
      tabCount: params.tabCount,
      rowCounts: params.rowCounts,
    };
    writeStore(store);
  }

  return { changed };
}

export function getReconciliationAdjustments(): ReconciliationAdjustment[] {
  const store = readStore();
  return Array.isArray(store.reconciliationAdjustments)
    ? store.reconciliationAdjustments
    : [];
}

export function upsertReconciliationAdjustment(params: {
  checkId: string;
  checkLabel: string;
  mode: 'percent' | 'nominal';
  percentValue: number;
  nominalDelta: number;
  reason: string;
}): ReconciliationAdjustment[] {
  const store = readStore();
  const current = Array.isArray(store.reconciliationAdjustments)
    ? [...store.reconciliationAdjustments]
    : [];

  const now = new Date().toISOString();
  const existingIdx = current.findIndex((a) => a.checkId === params.checkId);
  const entry: ReconciliationAdjustment = {
    id: existingIdx >= 0 ? current[existingIdx].id : `adj_${crypto.randomBytes(6).toString('hex')}`,
    checkId: params.checkId,
    mode: params.mode,
    percentValue: params.percentValue,
    nominalDelta: params.nominalDelta,
    reason: params.reason.trim() || 'Penyesuaian rekonsiliasi saldo',
    updatedAt: now,
    updatedBy: 'dashboard',
  };

  if (existingIdx >= 0) {
    current[existingIdx] = entry;
  } else {
    current.push(entry);
  }

  store.reconciliationAdjustments = current;
  writeStore(store);

  return current;
}

export function deleteReconciliationAdjustment(checkId: string): ReconciliationAdjustment[] {
  const store = readStore();
  const current = Array.isArray(store.reconciliationAdjustments)
    ? store.reconciliationAdjustments
    : [];
  const next = current.filter((a) => a.checkId !== checkId);
  store.reconciliationAdjustments = next;
  writeStore(store);

  return next;
}
