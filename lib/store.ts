import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ActivityCategory, ActivityLogEntry, PublicUser, UserRole } from './types';

interface StoredUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  passwordSalt: string;
  passwordHash: string;
  tokenVersion: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

interface StoreState {
  users: StoredUser[];
  logs: ActivityLogEntry[];
  lastSheetSignature: string | null;
  lastSheetSummary: {
    totalPaid: number;
    remainingBalance: number;
    tabCount: number;
    rowCounts: Record<string, number>;
  } | null;
}

export const SESSION_COOKIE_NAME = 'ismaya_session';

const DATA_DIR = path.join(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'ismaya-store.json');

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'change-me-to-a-random-secret-string') {
    return process.env.SESSION_SECRET;
  }
  // Stable per-installation secret derived from app path + fallback seed
  return crypto
    .createHash('sha256')
    .update(`ismaya-property-utar-kayu-${process.cwd()}`)
    .digest('hex');
}

function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { salt: actualSalt, hash: derived };
}

function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createInitialStore(): StoreState {
  const now = new Date().toISOString();
  const users: StoredUser[] = [];

  const defaultHash = hashPassword('Ismaya@2026');
  users.push({
    id: 'usr_admin_01',
    username: 'ismaya.admin',
    displayName: 'Administrator Utama',
    role: 'admin',
    active: true,
    passwordSalt: defaultHash.salt,
    passwordHash: defaultHash.hash,
    tokenVersion: 1,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  });

  const envUser = (process.env.ADMIN_INITIAL_USERNAME || '').trim();
  const envPass = process.env.ADMIN_INITIAL_PASSWORD || '';
  if (envUser && envPass && envUser.toLowerCase() !== 'ismaya.admin') {
    const envHashed = hashPassword(envPass);
    users.push({
      id: 'usr_admin_env',
      username: envUser,
      displayName: 'Administrator',
      role: 'admin',
      active: true,
      passwordSalt: envHashed.salt,
      passwordHash: envHashed.hash,
      tokenVersion: 1,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    });
  }

  return {
    users,
    logs: [
      {
        id: `log_${crypto.randomBytes(6).toString('hex')}`,
        timestamp: now,
        actorUsername: 'system',
        actorDisplayName: 'System',
        actorRole: 'system',
        category: 'auth',
        action: 'SYSTEM_INITIALIZED',
        description: 'Sistem ledger pembayaran tanah ISMAYA PROPERTY diinisialisasi.',
      },
    ],
    lastSheetSignature: null,
    lastSheetSummary: null,
  };
}

function readStore(): StoreState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      const initial = createInitialStore();
      fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as StoreState;
    if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
      const initial = createInitialStore();
      fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    return parsed;
  } catch {
    return createInitialStore();
  }
}

function writeStore(state: StoreState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpPath, STORE_PATH);
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export interface SessionPayload {
  uid: string;
  tv: number;
  exp: number;
}

export function signSessionToken(user: StoredUser): string {
  const payload: SessionPayload = {
    uid: user.id,
    tv: user.tokenVersion,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): PublicUser | null {
  if (!token || !token.includes('.')) return null;
  try {
    const [encoded, sig] = token.split('.');
    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.uid || Date.now() > payload.exp) return null;

    const store = readStore();
    const user = store.users.find((u) => u.id === payload.uid && u.active);
    if (!user || user.tokenVersion !== payload.tv) return null;
    return toPublicUser(user);
  } catch {
    return null;
  }
}

export function extractTokenFromRequest(req: {
  cookies: { get: (name: string) => { value: string } | undefined };
  headers: { get: (name: string) => string | null };
}): string | null {
  const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.get('authorization');
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  return null;
}

export function getCookieOptions(req: {
  headers: { get: (name: string) => string | null };
  url?: string;
}, maxAge: number) {
  const proto = req.headers.get('x-forwarded-proto') || '';
  const isHttps =
    proto.includes('https') ||
    (req.url ? req.url.startsWith('https://') : false) ||
    process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    secure: isHttps,
    path: '/',
    maxAge,
  };
}

export function authenticateUser(
  username: string,
  password: string
): { user: StoredUser; publicUser: PublicUser } | null {
  const store = readStore();
  const normalized = username.trim().toLowerCase();
  const idx = store.users.findIndex((u) => u.username.toLowerCase() === normalized);
  if (idx === -1) return null;

  const user = store.users[idx];
  if (!user.active) return null;
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) return null;

  const now = new Date().toISOString();
  store.users[idx] = { ...user, lastLoginAt: now };
  store.logs.unshift({
    id: `log_${crypto.randomBytes(6).toString('hex')}`,
    timestamp: now,
    actorUsername: user.username,
    actorDisplayName: user.displayName,
    actorRole: user.role,
    category: 'auth',
    action: 'USER_LOGIN',
    description: `${user.displayName} (@${user.username}) berhasil masuk ke sistem.`,
  });
  store.logs = store.logs.slice(0, 500);
  writeStore(store);

  return { user: store.users[idx], publicUser: toPublicUser(store.users[idx]) };
}

export function appendLog(params: {
  actorUsername: string;
  actorDisplayName: string;
  actorRole: UserRole | 'system';
  category: ActivityCategory;
  action: string;
  description: string;
  details?: string;
}): ActivityLogEntry {
  const store = readStore();
  const entry: ActivityLogEntry = {
    id: `log_${crypto.randomBytes(6).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ...params,
  };
  store.logs.unshift(entry);
  store.logs = store.logs.slice(0, 500);
  writeStore(store);
  return entry;
}

export function getLogs(limit = 200): ActivityLogEntry[] {
  const store = readStore();
  return store.logs.slice(0, limit);
}

export function updateOwnAccount(params: {
  userId: string;
  currentPassword: string;
  newUsername?: string;
  newDisplayName?: string;
  newPassword?: string;
}): { ok: true; user: StoredUser; publicUser: PublicUser } | { ok: false; error: string } {
  const store = readStore();
  const idx = store.users.findIndex((u) => u.id === params.userId);
  if (idx === -1) return { ok: false, error: 'Akun tidak ditemukan.' };

  const current = store.users[idx];
  if (!verifyPassword(params.currentPassword, current.passwordSalt, current.passwordHash)) {
    return { ok: false, error: 'Kata sandi saat ini tidak sesuai.' };
  }

  const changes: string[] = [];
  let nextUsername = current.username;
  let nextDisplayName = current.displayName;
  let nextSalt = current.passwordSalt;
  let nextHash = current.passwordHash;
  let nextTokenVersion = current.tokenVersion;

  if (params.newUsername && params.newUsername.trim() && params.newUsername.trim() !== current.username) {
    const candidate = params.newUsername.trim();
    if (candidate.length < 3 || candidate.length > 40) {
      return { ok: false, error: 'Username harus 3–40 karakter.' };
    }
    const duplicate = store.users.some(
      (u) => u.id !== current.id && u.username.toLowerCase() === candidate.toLowerCase()
    );
    if (duplicate) {
      return { ok: false, error: 'Username sudah digunakan oleh pengguna lain.' };
    }
    changes.push(`Username: "${current.username}" → "${candidate}"`);
    nextUsername = candidate;
  }

  if (params.newDisplayName && params.newDisplayName.trim() && params.newDisplayName.trim() !== current.displayName) {
    const candidateName = params.newDisplayName.trim();
    changes.push(`Nama tampilan: "${current.displayName}" → "${candidateName}"`);
    nextDisplayName = candidateName;
  }

  if (params.newPassword && params.newPassword.length > 0) {
    if (params.newPassword.length < 6) {
      return { ok: false, error: 'Kata sandi baru minimal 6 karakter.' };
    }
    const hashed = hashPassword(params.newPassword);
    nextSalt = hashed.salt;
    nextHash = hashed.hash;
    nextTokenVersion += 1;
    changes.push('Kata sandi diperbarui');
  }

  if (changes.length === 0) {
    return { ok: false, error: 'Tidak ada perubahan data yang dikirim.' };
  }

  const now = new Date().toISOString();
  store.users[idx] = {
    ...current,
    username: nextUsername,
    displayName: nextDisplayName,
    passwordSalt: nextSalt,
    passwordHash: nextHash,
    tokenVersion: nextTokenVersion,
    updatedAt: now,
  };

  store.logs.unshift({
    id: `log_${crypto.randomBytes(6).toString('hex')}`,
    timestamp: now,
    actorUsername: nextUsername,
    actorDisplayName: nextDisplayName,
    actorRole: current.role,
    category: 'credentials',
    action: 'CREDENTIALS_UPDATED',
    description: `${nextDisplayName} memperbarui kredensial akunnya sendiri.`,
    details: changes.join(' · '),
  });
  store.logs = store.logs.slice(0, 500);
  writeStore(store);

  return {
    ok: true,
    user: store.users[idx],
    publicUser: toPublicUser(store.users[idx]),
  };
}

export function listAllUsers(): PublicUser[] {
  const store = readStore();
  return store.users.map(toPublicUser);
}

export function createManagedUser(
  actor: PublicUser,
  params: { username: string; displayName: string; password: string; role: UserRole }
): { ok: true; user: PublicUser } | { ok: false; error: string } {
  const store = readStore();
  const username = params.username.trim();
  const displayName = params.displayName.trim();

  if (username.length < 3 || username.length > 40) {
    return { ok: false, error: 'Username harus 3–40 karakter.' };
  }
  if (!displayName) {
    return { ok: false, error: 'Nama tampilan wajib diisi.' };
  }
  if (!params.password || params.password.length < 6) {
    return { ok: false, error: 'Kata sandi minimal 6 karakter.' };
  }
  if (store.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: 'Username sudah terdaftar.' };
  }

  const now = new Date().toISOString();
  const { salt, hash } = hashPassword(params.password);
  const newUser: StoredUser = {
    id: `usr_${crypto.randomBytes(6).toString('hex')}`,
    username,
    displayName,
    role: params.role,
    active: true,
    passwordSalt: salt,
    passwordHash: hash,
    tokenVersion: 1,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };

  store.users.push(newUser);
  store.logs.unshift({
    id: `log_${crypto.randomBytes(6).toString('hex')}`,
    timestamp: now,
    actorUsername: actor.username,
    actorDisplayName: actor.displayName,
    actorRole: actor.role,
    category: 'user_management',
    action: 'USER_CREATED',
    description: `Admin menambahkan akun baru @${username} (${params.role}).`,
    details: `Nama: ${displayName} · Peran: ${params.role}`,
  });
  store.logs = store.logs.slice(0, 500);
  writeStore(store);

  return { ok: true, user: toPublicUser(newUser) };
}

export function updateManagedUser(
  actor: PublicUser,
  targetId: string,
  params: {
    username?: string;
    displayName?: string;
    password?: string;
    role?: UserRole;
    active?: boolean;
  }
): { ok: true; user: PublicUser } | { ok: false; error: string } {
  const store = readStore();
  const idx = store.users.findIndex((u) => u.id === targetId);
  if (idx === -1) return { ok: false, error: 'Pengguna tidak ditemukan.' };

  const target = store.users[idx];
  const changes: string[] = [];

  let nextUsername = target.username;
  let nextDisplayName = target.displayName;
  let nextRole = target.role;
  let nextActive = target.active;
  let nextSalt = target.passwordSalt;
  let nextHash = target.passwordHash;
  let nextTokenVersion = target.tokenVersion;

  if (params.username && params.username.trim() !== target.username) {
    const candidate = params.username.trim();
    if (candidate.length < 3 || candidate.length > 40) {
      return { ok: false, error: 'Username harus 3–40 karakter.' };
    }
    if (store.users.some((u) => u.id !== targetId && u.username.toLowerCase() === candidate.toLowerCase())) {
      return { ok: false, error: 'Username sudah digunakan pengguna lain.' };
    }
    changes.push(`Username: "${target.username}" → "${candidate}"`);
    nextUsername = candidate;
  }

  if (params.displayName && params.displayName.trim() !== target.displayName) {
    changes.push(`Nama: "${target.displayName}" → "${params.displayName.trim()}"`);
    nextDisplayName = params.displayName.trim();
  }

  if (params.role && params.role !== target.role) {
    if (target.role === 'admin' && params.role !== 'admin') {
      const otherAdmins = store.users.filter((u) => u.id !== targetId && u.role === 'admin' && u.active);
      if (otherAdmins.length === 0) {
        return { ok: false, error: 'Harus ada minimal satu Administrator aktif.' };
      }
    }
    changes.push(`Peran: ${target.role} → ${params.role}`);
    nextRole = params.role;
  }

  if (typeof params.active === 'boolean' && params.active !== target.active) {
    if (!params.active && target.role === 'admin') {
      const otherAdmins = store.users.filter((u) => u.id !== targetId && u.role === 'admin' && u.active);
      if (otherAdmins.length === 0) {
        return { ok: false, error: 'Tidak dapat menonaktifkan satu-satunya Administrator aktif.' };
      }
    }
    changes.push(`Status: ${target.active ? 'Aktif' : 'Nonaktif'} → ${params.active ? 'Aktif' : 'Nonaktif'}`);
    nextActive = params.active;
    if (!params.active) nextTokenVersion += 1;
  }

  if (params.password && params.password.length > 0) {
    if (params.password.length < 6) {
      return { ok: false, error: 'Kata sandi minimal 6 karakter.' };
    }
    const hashed = hashPassword(params.password);
    nextSalt = hashed.salt;
    nextHash = hashed.hash;
    nextTokenVersion += 1;
    changes.push('Kata sandi direset oleh Admin');
  }

  const now = new Date().toISOString();
  store.users[idx] = {
    ...target,
    username: nextUsername,
    displayName: nextDisplayName,
    role: nextRole,
    active: nextActive,
    passwordSalt: nextSalt,
    passwordHash: nextHash,
    tokenVersion: nextTokenVersion,
    updatedAt: now,
  };

  if (changes.length > 0) {
    store.logs.unshift({
      id: `log_${crypto.randomBytes(6).toString('hex')}`,
      timestamp: now,
      actorUsername: actor.username,
      actorDisplayName: actor.displayName,
      actorRole: actor.role,
      category: 'user_management',
      action: 'USER_UPDATED',
      description: `Admin memperbarui data pengguna @${nextUsername}.`,
      details: changes.join(' · '),
    });
    store.logs = store.logs.slice(0, 500);
  }
  writeStore(store);

  return { ok: true, user: toPublicUser(store.users[idx]) };
}

export function deleteManagedUser(
  actor: PublicUser,
  targetId: string
): { ok: true } | { ok: false; error: string } {
  const store = readStore();
  if (actor.id === targetId) {
    return { ok: false, error: 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif.' };
  }
  const target = store.users.find((u) => u.id === targetId);
  if (!target) return { ok: false, error: 'Pengguna tidak ditemukan.' };

  if (target.role === 'admin' && target.active) {
    const otherAdmins = store.users.filter((u) => u.id !== targetId && u.role === 'admin' && u.active);
    if (otherAdmins.length === 0) {
      return { ok: false, error: 'Tidak dapat menghapus satu-satunya Administrator aktif.' };
    }
  }

  store.users = store.users.filter((u) => u.id !== targetId);
  store.logs.unshift({
    id: `log_${crypto.randomBytes(6).toString('hex')}`,
    timestamp: new Date().toISOString(),
    actorUsername: actor.username,
    actorDisplayName: actor.displayName,
    actorRole: actor.role,
    category: 'user_management',
    action: 'USER_DELETED',
    description: `Admin menghapus pengguna @${target.username} (${target.displayName}).`,
  });
  store.logs = store.logs.slice(0, 500);
  writeStore(store);

  return { ok: true };
}

export function recordSpreadsheetSyncIfChanged(params: {
  signature: string;
  totalPaid: number;
  remainingBalance: number;
  tabCount: number;
  rowCounts: Record<string, number>;
  actor?: PublicUser | null;
  manual?: boolean;
}): { changed: boolean } {
  const store = readStore();
  const prevSig = store.lastSheetSignature;
  const changed = prevSig !== null && prevSig !== params.signature;

  if (prevSig === null || changed || params.manual) {
    const now = new Date().toISOString();
    if (prevSig === null) {
      store.logs.unshift({
        id: `log_${crypto.randomBytes(6).toString('hex')}`,
        timestamp: now,
        actorUsername: params.actor?.username || 'system',
        actorDisplayName: params.actor?.displayName || 'Google Sheets Sync',
        actorRole: params.actor?.role || 'system',
        category: 'spreadsheet_sync',
        action: 'SPREADSHEET_BASELINE_SYNCED',
        description: `Sinkronisasi awal Google Spreadsheet selesai (${params.tabCount} tab kategori).`,
        details: `Signature: ${params.signature}`,
      });
    } else if (changed) {
      const prevPaid = store.lastSheetSummary?.totalPaid ?? 0;
      const diff = params.totalPaid - prevPaid;
      const diffText =
        diff !== 0
          ? `Perubahan total dana masuk: ${diff > 0 ? '+' : ''}Rp ${new Intl.NumberFormat('id-ID').format(diff)}`
          : 'Pembaruan baris atau catatan pada tab spreadsheet';
      store.logs.unshift({
        id: `log_${crypto.randomBytes(6).toString('hex')}`,
        timestamp: now,
        actorUsername: params.actor?.username || 'system',
        actorDisplayName: params.actor?.displayName || 'Google Sheets Auto-Sync',
        actorRole: params.actor?.role || 'system',
        category: 'spreadsheet_sync',
        action: 'SPREADSHEET_DATA_CHANGED',
        description: 'Perubahan data terdeteksi secara real-time pada Google Spreadsheet.',
        details: `${diffText} · Signature: ${prevSig} → ${params.signature}`,
      });
    } else if (params.manual && params.actor) {
      store.logs.unshift({
        id: `log_${crypto.randomBytes(6).toString('hex')}`,
        timestamp: now,
        actorUsername: params.actor.username,
        actorDisplayName: params.actor.displayName,
        actorRole: params.actor.role,
        category: 'spreadsheet_sync',
        action: 'SPREADSHEET_MANUAL_SYNC',
        description: `${params.actor.displayName} melakukan sinkronisasi manual Google Spreadsheet (data terkini).`,
      });
    }

    store.lastSheetSignature = params.signature;
    store.lastSheetSummary = {
      totalPaid: params.totalPaid,
      remainingBalance: params.remainingBalance,
      tabCount: params.tabCount,
      rowCounts: params.rowCounts,
    };
    store.logs = store.logs.slice(0, 500);
    writeStore(store);
  }

  return { changed };
}
