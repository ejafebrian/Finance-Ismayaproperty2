'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { getCopy } from '@/lib/i18n';
import { exportActivityLogToPdf } from '@/lib/pdf-export';
import { authFetch, setClientSessionToken } from '@/lib/client-auth';
import type {
  ActivityCategory,
  ActivityLogEntry,
  Language,
  PublicUser,
  UserRole,
} from '@/lib/types';

export type AdminSectionTab = 'profile' | 'users' | 'logs';

interface AdminPanelProps {
  activeSection: AdminSectionTab;
  currentUser: PublicUser;
  lang: Language;
  timezone: string;
  onUserUpdated: (user: PublicUser) => void;
  onLogRecorded?: () => void;
}

export default function AdminPanel({
  activeSection,
  currentUser,
  lang,
  timezone,
  onUserUpdated,
  onLogRecorded,
}: AdminPanelProps) {
  const copy = getCopy(lang);

  // Profile Edit State
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [newUsername, setNewUsername] = useState(currentUser.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Users Management State
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PublicUser | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('staff');
  const [formActive, setFormActive] = useState(true);
  const [userSaving, setUserSaving] = useState(false);
  const [userFormError, setUserFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PublicUser | null>(null);

  // Activity Logs State
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [logCategory, setLogCategory] = useState<'all' | ActivityCategory>('all');

  const fetchUsers = useCallback(async () => {
    if (currentUser.role !== 'admin') return;
    setUsersLoading(true);
    setUsersError('');
    try {
      const res = await authFetch('/api/admin/users', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setUsers(data.users || []);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Error');
    } finally {
      setUsersLoading(false);
    }
  }, [currentUser.role]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await authFetch('/api/logs', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && Array.isArray(data.logs)) {
        setLogs(data.logs);
      }
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (activeSection === 'users' && currentUser.role === 'admin') {
      (async () => {
        try {
          const res = await authFetch('/api/admin/users', { cache: 'no-store' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to load users');
          if (!cancelled) setUsers(data.users || []);
        } catch (err) {
          if (!cancelled) setUsersError(err instanceof Error ? err.message : 'Error');
        } finally {
          if (!cancelled) setUsersLoading(false);
        }
      })();
    } else if (activeSection === 'logs') {
      (async () => {
        try {
          const res = await authFetch('/api/logs', { cache: 'no-store' });
          const data = await res.json();
          if (!cancelled && res.ok && Array.isArray(data.logs)) {
            setLogs(data.logs);
          }
        } finally {
          if (!cancelled) setLogsLoading(false);
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [activeSection, currentUser.role]);

  const formatLocalTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: timezone,
      }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleString();
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    if (newPassword && newPassword !== confirmPassword) {
      setProfileError(copy.admin.passwordMismatch);
      return;
    }

    setProfileSaving(true);
    try {
      const res = await authFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newUsername: newUsername.trim(),
          newDisplayName: displayName.trim(),
          newPassword: newPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileError(data.error || 'Gagal memperbarui akun.');
        return;
      }

      if (data.token) {
        setClientSessionToken(data.token);
      }
      if (data.user) {
        onUserUpdated(data.user);
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setProfileSuccess(copy.admin.profileSuccess);
      onLogRecorded?.();
    } catch {
      setProfileError('Terjadi kesalahan jaringan.');
    } finally {
      setProfileSaving(false);
    }
  };

  const openAddUserModal = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormDisplayName('');
    setFormPassword('');
    setFormRole('staff');
    setFormActive(true);
    setUserFormError('');
    setUserModalOpen(true);
  };

  const openEditUserModal = (user: PublicUser) => {
    setEditingUser(user);
    setFormUsername(user.username);
    setFormDisplayName(user.displayName);
    setFormPassword('');
    setFormRole(user.role);
    setFormActive(user.active);
    setUserFormError('');
    setUserModalOpen(true);
  };

  const handleSaveUserModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError('');
    setUserSaving(true);

    try {
      if (editingUser) {
        const res = await authFetch(`/api/admin/users/${editingUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: formUsername.trim(),
            displayName: formDisplayName.trim(),
            password: formPassword || undefined,
            role: formRole,
            active: formActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setUserFormError(data.error || 'Gagal memperbarui pengguna.');
          return;
        }
        if (editingUser.id === currentUser.id && data.user) {
          onUserUpdated(data.user);
        }
      } else {
        const res = await authFetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: formUsername.trim(),
            displayName: formDisplayName.trim(),
            password: formPassword,
            role: formRole,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setUserFormError(data.error || 'Gagal menambah pengguna.');
          return;
        }
      }

      setUserModalOpen(false);
      await fetchUsers();
      onLogRecorded?.();
    } catch {
      setUserFormError('Kesalahan sistem saat menyimpan.');
    } finally {
      setUserSaving(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      const res = await authFetch(`/api/admin/users/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setUsersError(data.error || 'Gagal menghapus pengguna.');
      } else {
        await fetchUsers();
        onLogRecorded?.();
      }
    } finally {
      setDeleteTarget(null);
    }
  };

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return logs.filter((entry) => {
      if (logCategory !== 'all' && entry.category !== logCategory) return false;
      if (!q) return true;
      return (
        entry.actorUsername.toLowerCase().includes(q) ||
        entry.actorDisplayName.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q) ||
        (entry.details || '').toLowerCase().includes(q)
      );
    });
  }, [logs, logSearch, logCategory]);

  const categoryLabel = (cat: ActivityCategory) => {
    switch (cat) {
      case 'auth':
        return copy.admin.catAuth;
      case 'credentials':
        return copy.admin.catCredentials;
      case 'user_management':
        return copy.admin.catUsers;
      case 'spreadsheet_sync':
        return copy.admin.catSync;
      case 'export':
        return copy.admin.catExport;
      case 'reconciliation':
        return copy.admin.catReconciliation;
    }
  };

  const handleExportLogsPdf = async () => {
    await exportActivityLogToPdf({
      logs: filteredLogs,
      lang,
      timezone,
    });
    await authFetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'export',
        action: 'EXPORT_ACTIVITY_LOG_PDF',
        description: `Mengunduh laporan PDF Log Aktivitas (${filteredLogs.length} entri).`,
      }),
    });
    fetchLogs();
  };

  if (activeSection === 'profile') {
    return (
      <section className="max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5 text-[#8B7335] dark:text-[#C5AE6B]" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              {copy.admin.profileTitle}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {copy.admin.profileSubtitle}
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                {copy.admin.displayNameLabel}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full min-h-[42px] px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#8B7335] dark:focus:ring-[#C5AE6B]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                {copy.admin.newUsernameLabel}
              </label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
                minLength={3}
                className="w-full min-h-[42px] px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#8B7335] dark:focus:ring-[#C5AE6B]"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                {copy.admin.currentPasswordLabel}
              </label>
              <button
                type="button"
                onClick={() => setShowPasswords((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              >
                {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPasswords ? copy.login.hidePassword : copy.login.showPassword}</span>
              </button>
            </div>
            <input
              type={showPasswords ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full min-h-[42px] px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#8B7335] dark:focus:ring-[#C5AE6B]"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {copy.admin.newPasswordLabel}
                </label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full min-h-[42px] px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#8B7335] dark:focus:ring-[#C5AE6B]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {copy.admin.confirmPasswordLabel}
                </label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full min-h-[42px] px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#8B7335] dark:focus:ring-[#C5AE6B]"
                />
              </div>
            </div>
          </div>

          {profileError && (
            <div className="px-3.5 py-2.5 text-sm rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300">
              {profileError}
            </div>
          )}

          {profileSuccess && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 text-sm rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{profileSuccess}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={profileSaving}
            className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 text-sm font-semibold rounded-lg bg-slate-900 dark:bg-[#C5AE6B] text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-[#d3be80] disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            {profileSaving ? copy.admin.savingText : copy.admin.saveProfileButton}
          </button>
        </form>
      </section>
    );
  }

  if (activeSection === 'users') {
    return (
      <section className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-[#8B7335] dark:text-[#C5AE6B]" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {copy.admin.usersTitle}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {copy.admin.usersSubtitle}
                </p>
              </div>
            </div>

            {currentUser.role === 'admin' && (
              <button
                type="button"
                onClick={openAddUserModal}
                className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 dark:bg-[#C5AE6B] text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-[#d3be80] transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>{copy.admin.addUserButton}</span>
              </button>
            )}
          </div>

          {usersError && (
            <div className="mb-4 px-3.5 py-2.5 text-sm rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300">
              {usersError}
            </div>
          )}

          {usersLoading ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Memuat daftar pengguna...
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <th className="py-3 px-4">{copy.admin.displayNameLabel}</th>
                    <th className="py-3 px-4">Username</th>
                    <th className="py-3 px-4">{copy.admin.roleLabel}</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Last Login</th>
                    <th className="py-3 px-4 text-right">{copy.admin.actionsLabel}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-2">
                          <span>{u.displayName}</span>
                          {u.id === currentUser.id && (
                            <span className="text-xs text-[#8B7335] dark:text-[#C5AE6B]">
                              · You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                        @{u.username}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        {u.role === 'admin' ? copy.admin.roleAdmin : copy.admin.roleStaff}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={
                            u.active
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-slate-400 dark:text-slate-500'
                          }
                        >
                          {u.active ? copy.admin.statusActive : copy.admin.statusInactive}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {u.lastLoginAt ? formatLocalTime(u.lastLoginAt) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditUserModal(u)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{copy.admin.editBtn}</span>
                          </button>
                          {u.id !== currentUser.id && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{copy.admin.deleteBtn}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add / Edit User Modal */}
        {userModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  {editingUser ? copy.admin.editUserTitle : copy.admin.createUserTitle}
                </h3>
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveUserModal} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    {copy.admin.displayNameLabel}
                  </label>
                  <input
                    type="text"
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    required
                    className="w-full min-h-[42px] px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    required
                    minLength={3}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    {copy.login.passwordLabel}
                  </label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    required={!editingUser}
                    minLength={6}
                    placeholder={editingUser ? copy.admin.optionalPasswordHint : ''}
                    className="w-full min-h-[42px] px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      {copy.admin.roleLabel}
                    </label>
                    <select
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value as UserRole)}
                      className="w-full min-h-[42px] px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      <option value="admin">{copy.admin.roleAdmin}</option>
                      <option value="staff">{copy.admin.roleStaff}</option>
                    </select>
                  </div>

                  {editingUser && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                        Status
                      </label>
                      <select
                        value={formActive ? 'active' : 'inactive'}
                        onChange={(e) => setFormActive(e.target.value === 'active')}
                        className="w-full min-h-[42px] px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      >
                        <option value="active">{copy.admin.statusActive}</option>
                        <option value="inactive">{copy.admin.statusInactive}</option>
                      </select>
                    </div>
                  )}
                </div>

                {userFormError && (
                  <div className="px-3 py-2 text-xs rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300">
                    {userFormError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setUserModalOpen(false)}
                    className="px-4 py-2 min-h-[40px] text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {copy.admin.cancelBtn}
                  </button>
                  <button
                    type="submit"
                    disabled={userSaving}
                    className="px-4 py-2 min-h-[40px] text-sm font-semibold rounded-lg bg-slate-900 dark:bg-[#C5AE6B] text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-[#d3be80] disabled:opacity-60"
                  >
                    {userSaving ? copy.admin.savingText : copy.admin.saveProfileButton}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
                {copy.admin.confirmDeleteTitle}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
                {copy.admin.confirmDeleteDesc} ({deleteTarget.displayName} · @{deleteTarget.username})
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 min-h-[40px] text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {copy.admin.cancelBtn}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteUser}
                  className="px-4 py-2 min-h-[40px] text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700"
                >
                  {copy.admin.confirmDeleteBtn}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  // Activity Log Section
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5 text-[#8B7335] dark:text-[#C5AE6B]" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              {copy.admin.logsTitle}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {copy.admin.logsSubtitle}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportLogsPdf}
          disabled={filteredLogs.length === 0}
          className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>{copy.admin.exportLogsPdf}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            placeholder={copy.admin.searchLogsPlaceholder}
            className="w-full min-h-[42px] pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8B7335] dark:focus:ring-[#C5AE6B]"
          />
        </div>

        <select
          value={logCategory}
          onChange={(e) => setLogCategory(e.target.value as 'all' | ActivityCategory)}
          className="min-h-[42px] px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
        >
          <option value="all">{copy.admin.allCategories}</option>
          <option value="auth">{copy.admin.catAuth}</option>
          <option value="credentials">{copy.admin.catCredentials}</option>
          <option value="user_management">{copy.admin.catUsers}</option>
          <option value="spreadsheet_sync">{copy.admin.catSync}</option>
          <option value="reconciliation">{copy.admin.catReconciliation}</option>
          <option value="export">{copy.admin.catExport}</option>
        </select>
      </div>

      {logsLoading ? (
        <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          Memuat log aktivitas...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
          {copy.admin.noLogsFound}
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-600 dark:text-slate-400">
                <th className="py-3 px-4 whitespace-nowrap">{copy.admin.colTime}</th>
                <th className="py-3 px-4 whitespace-nowrap">{copy.admin.colActor}</th>
                <th className="py-3 px-4 whitespace-nowrap">{copy.admin.colCategory}</th>
                <th className="py-3 px-4">{copy.admin.colAction}</th>
                <th className="py-3 px-4">{copy.admin.colDetails}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {formatLocalTime(log.timestamp)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {log.actorDisplayName}
                    </span>
                    <span className="text-xs font-mono text-slate-400 dark:text-slate-500 ml-1.5">
                      @{log.actorUsername}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-xs font-medium text-[#8B7335] dark:text-[#C5AE6B]">
                    {categoryLabel(log.category)}
                  </td>
                  <td className="py-3 px-4 text-slate-800 dark:text-slate-200">
                    {log.description}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {log.details || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
