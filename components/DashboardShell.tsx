'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Globe,
  Menu,
  Moon,
  RefreshCw,
  Scale,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { getCopy } from '@/lib/i18n';
import { formatRupiah } from '@/lib/format';
import {
  exportAllTabsToPdf,
  exportReconciliationToPdf,
  exportRekapSubSectionToPdf,
  exportTabToPdf,
} from '@/lib/pdf-export';
import type {
  Language,
  ParsedSheetTab,
  ReconciliationAdjustment,
  SpreadsheetSnapshot,
  ThemeMode,
} from '@/lib/types';
import ChartsPanel from './ChartsPanel';
import ReconciliationPanel from './ReconciliationPanel';

const LOGO_SRC = '/assets/aistudio/436288cc-2e74-4fc9-b640-0cf371e4aa32_53fea3f7.png';
const AUTO_SYNC_INTERVAL_SEC = 15;

interface DashboardShellProps {
  lang: Language;
  theme: ThemeMode;
  timezone: string;
  onToggleLang: () => void;
  onToggleTheme: () => void;
}

type ActiveView =
  | { kind: 'sheet'; gid: string }
  | { kind: 'reconciliation' };

export default function DashboardShell({
  lang,
  theme,
  timezone,
  onToggleLang,
  onToggleTheme,
}: DashboardShellProps) {
  const copy = getCopy(lang);

  const [snapshot, setSnapshot] = useState<SpreadsheetSnapshot | null>(null);
  const [adjustments, setAdjustments] = useState<ReconciliationAdjustment[]>([]);
  const [loadingSheet, setLoadingSheet] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [countdown, setCountdown] = useState(AUTO_SYNC_INTERVAL_SEC);
  const [justUpdatedNotice, setJustUpdatedNotice] = useState(false);

  const [activeView, setActiveView] = useState<ActiveView>({
    kind: 'sheet',
    gid: '1525379144',
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);

  // Real-time search & year filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  // Local timezone live clock
  const [clockText, setClockText] = useState('');

  useEffect(() => {
    const tick = () => {
      try {
        setClockText(
          new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: timezone,
          }).format(new Date())
        );
      } catch {
        setClockText(new Date().toLocaleTimeString());
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lang, timezone]);

  const fetchSpreadsheet = useCallback(async (manual = false) => {
    setSyncing(true);
    setSyncError('');
    try {
      const res = await fetch(`/api/sheets${manual ? '?manual=1' : ''}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Sync error');
      }
      const nextSnap = data.snapshot as SpreadsheetSnapshot;
      setSnapshot(nextSnap);
      setCountdown(AUTO_SYNC_INTERVAL_SEC);

      if (data.changed) {
        setJustUpdatedNotice(true);
        setTimeout(() => setJustUpdatedNotice(false), 6000);
      }

      // Ensure active sheet gid exists
      setActiveView((prev) => {
        if (prev.kind === 'sheet') {
          const exists = nextSnap.tabs.some((t) => t.meta.gid === prev.gid);
          if (!exists && nextSnap.tabs.length > 0) {
            return { kind: 'sheet', gid: nextSnap.tabs[0].meta.gid };
          }
        }
        return prev;
      });
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : copy.dashboard.errorSync);
    } finally {
      setLoadingSheet(false);
      setSyncing(false);
    }
  }, [copy.dashboard.errorSync]);

  // Initial load + real-time polling + visibility focus refresh
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [res, adjRes] = await Promise.all([
          fetch('/api/sheets', { cache: 'no-store' }),
          fetch('/api/reconciliation', { cache: 'no-store' }).catch(() => null),
        ]);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Sync error');
        if (cancelled) return;
        const nextSnap = data.snapshot as SpreadsheetSnapshot;
        setSnapshot(nextSnap);
        setCountdown(AUTO_SYNC_INTERVAL_SEC);
        if (adjRes && adjRes.ok) {
          const adjData = await adjRes.json().catch(() => ({}));
          if (!cancelled && Array.isArray(adjData.adjustments)) {
            setAdjustments(adjData.adjustments);
          }
        }
        setActiveView((prev) => {
          if (prev.kind === 'sheet') {
            const exists = nextSnap.tabs.some((t) => t.meta.gid === prev.gid);
            if (!exists && nextSnap.tabs.length > 0) {
              return { kind: 'sheet', gid: nextSnap.tabs[0].meta.gid };
            }
          }
          return prev;
        });
      } catch (err) {
        if (!cancelled) {
          setSyncError(err instanceof Error ? err.message : copy.dashboard.errorSync);
        }
      } finally {
        if (!cancelled) setLoadingSheet(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [copy.dashboard.errorSync]);

  useEffect(() => {
    if (!autoSync) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchSpreadsheet(false);
          return AUTO_SYNC_INTERVAL_SEC;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoSync, fetchSpreadsheet]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && autoSync) {
        fetchSpreadsheet(false);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [autoSync, fetchSpreadsheet]);

  const activeTab: ParsedSheetTab | null = useMemo(() => {
    if (!snapshot || activeView.kind !== 'sheet') return null;
    return (
      snapshot.tabs.find((t) => t.meta.gid === activeView.gid) ||
      snapshot.tabs[0] ||
      null
    );
  }, [snapshot, activeView]);

  const availableYears = useMemo(() => {
    if (!activeTab) return [];
    const yrs = new Set<number>();
    for (const r of activeTab.rows) {
      if (r.year) yrs.add(r.year);
    }
    return [...yrs].sort((a, b) => b - a);
  }, [activeTab]);

  const filteredRows = useMemo(() => {
    if (!activeTab) return [];
    const q = searchQuery.trim().toLowerCase();
    return activeTab.rows.filter((row) => {
      if (selectedYear !== 'all' && String(row.year) !== selectedYear) {
        return false;
      }
      if (!q) return true;
      return (
        row.description.toLowerCase().includes(q) ||
        row.dateRaw.toLowerCase().includes(q) ||
        row.amountFormatted.toLowerCase().includes(q) ||
        row.note.toLowerCase().includes(q)
      );
    });
  }, [activeTab, searchQuery, selectedYear]);

  const filteredSum = useMemo(
    () => filteredRows.reduce((sum, r) => sum + (r.amount ?? 0), 0),
    [filteredRows]
  );

  const isFiltered = searchQuery.trim() !== '' || selectedYear !== 'all';

  const formatLocalSyncTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: 'numeric',
        month: 'short',
        timeZone: timezone,
      }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleTimeString();
    }
  };

  const handleDownloadActiveTabPdf = async () => {
    if (!activeTab || !snapshot) return;
    setPdfMenuOpen(false);
    await exportTabToPdf({
      tab: activeTab,
      snapshotFetchedAt: snapshot.fetchedAt,
      lang,
      timezone,
      filteredRows: isFiltered ? filteredRows : undefined,
    });
  };

  const handleDownloadAllPdf = async () => {
    if (!snapshot) return;
    setPdfMenuOpen(false);
    await exportAllTabsToPdf({
      snapshot,
      lang,
      timezone,
    });
  };

  const handleDownloadSubSectionPdf = async (section: 'legal' | 'summary') => {
    if (!activeTab || !snapshot) return;
    await exportRekapSubSectionToPdf({
      section,
      tab: activeTab,
      snapshotFetchedAt: snapshot.fetchedAt,
      lang,
      timezone,
    });
  };

  const reconciliationOverview = useMemo(() => {
    if (!snapshot?.reconciliation) {
      return { allKlop: true, klopCount: 0, totalChecks: 0, netVariance: 0 };
    }
    const adjMap = new Map(adjustments.map((a) => [a.checkId, a]));
    let klopCount = 0;
    let netVariance = 0;
    for (const c of snapshot.reconciliation.checks) {
      const adj = adjMap.get(c.id);
      const diff = Math.round(c.actualAmount + (adj ? adj.nominalDelta : 0) - c.expectedAmount);
      if (diff === 0) klopCount++;
      netVariance += Math.abs(diff);
    }
    const totalChecks = snapshot.reconciliation.checks.length;
    return {
      allKlop: totalChecks > 0 && klopCount === totalChecks,
      klopCount,
      totalChecks,
      netVariance,
    };
  }, [snapshot, adjustments]);

  const selectSheetTab = (gid: string) => {
    setActiveView({ kind: 'sheet', gid });
    setSearchQuery('');
    setSelectedYear('all');
    setMobileMenuOpen(false);
  };

  const selectReconciliation = () => {
    setActiveView({ kind: 'reconciliation' });
    setMobileMenuOpen(false);
  };

  const activeBreadcrumbLabel =
    activeView.kind === 'sheet'
      ? activeTab?.meta.name || '...'
      : copy.nav.reconciliation;

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="px-4 pt-5 pb-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-10 h-7 shrink-0">
              <Image
                src={LOGO_SRC}
                alt="ISMAYA PROPERTY"
                fill
                sizes="40px"
                className="object-contain"
                referrerPolicy="no-referrer"
                priority
              />
            </div>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                {copy.brandName}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Utan Kayu Ledger
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label={copy.nav.closeMenu}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Spreadsheet Tab Categories */}
        <div className="px-3 space-y-1">
          <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
            {copy.nav.dashboardSection}
          </p>
          {(snapshot?.tabs || []).map((tab) => {
            const isActive =
              activeView.kind === 'sheet' && activeView.gid === tab.meta.gid;
            return (
              <button
                key={tab.meta.gid}
                type="button"
                onClick={() => selectSheetTab(tab.meta.gid)}
                className={`w-full min-h-[42px] px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center justify-between gap-2 transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-[#C5AE6B] dark:text-slate-950'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="w-4 h-4 shrink-0 opacity-80" />
                  <span className="truncate">{tab.meta.name}</span>
                </span>
                <span
                  className={`text-xs font-mono tabular-nums shrink-0 ${
                    isActive
                      ? 'text-slate-300 dark:text-slate-800'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {tab.transactionCount}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={selectReconciliation}
            className={`w-full min-h-[42px] px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center justify-between gap-2 transition-colors mt-2 ${
              activeView.kind === 'reconciliation'
                ? 'bg-slate-900 text-white dark:bg-[#C5AE6B] dark:text-slate-950'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Scale className="w-4 h-4 shrink-0 opacity-80" />
              <span className="truncate">{copy.nav.reconciliation}</span>
            </span>
            {snapshot && (
              <span
                className={`text-[11px] font-mono tabular-nums shrink-0 ${
                  activeView.kind === 'reconciliation'
                    ? 'text-slate-300 dark:text-slate-900'
                    : reconciliationOverview.allKlop
                      ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'text-amber-600 dark:text-amber-400 font-semibold'
                }`}
              >
                {reconciliationOverview.allKlop
                  ? '100%'
                  : `${reconciliationOverview.klopCount}/${reconciliationOverview.totalChecks}`}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Sidebar Ledger Info Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-1">
        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          {copy.brandName}
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          {copy.brandSubtitle}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 h-screen overflow-y-auto">
        {sidebarContent}
      </aside>

      {/* Mobile / Tablet Slide-over Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-full overflow-y-auto z-10">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top Workspace Header (Single compact row, <= 15% mobile height) */}
        <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
              aria-label={copy.nav.openMenu}
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400 dark:text-slate-500 whitespace-nowrap">
                {copy.dashboard.overviewBreadcrumb}
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-700">/</span>
              <h1 className="font-display font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activeBreadcrumbLabel}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Local Timezone Clock */}
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 pr-3">
              <Clock className="w-3.5 h-3.5 text-[#8B7335] dark:text-[#C5AE6B]" />
              <span>{clockText}</span>
              <span aria-hidden="true">·</span>
              <span>{timezone}</span>
            </div>

            {/* Real-time Sync Button */}
            <button
              type="button"
              onClick={() => fetchSpreadsheet(true)}
              disabled={syncing}
              title={
                snapshot
                  ? `${copy.header.lastSynced}: ${formatLocalSyncTime(snapshot.fetchedAt)}`
                  : copy.header.syncNow
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {syncing ? copy.header.syncing : copy.header.syncNow}
              </span>
              {autoSync && !syncing && (
                <span className="hidden md:inline font-mono tabular-nums text-slate-400 dark:text-slate-500">
                  {countdown}s
                </span>
              )}
            </button>

            {/* Language Switcher */}
            <button
              type="button"
              onClick={onToggleLang}
              className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              aria-label="Switch language"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'id' ? 'ID' : 'EN'}</span>
            </button>

            {/* Dark Mode Toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              aria-label={theme === 'dark' ? copy.header.lightMode : copy.header.darkMode}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-[#C5AE6B]" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Primary CTA: Download PDF */}
            {snapshot && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPdfMenuOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-semibold rounded-lg bg-slate-900 dark:bg-[#C5AE6B] text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-[#d3be80] transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{copy.header.downloadPdf}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {pdfMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setPdfMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1.5 z-40">
                      {activeView.kind === 'sheet' && activeTab && (
                        <button
                          type="button"
                          onClick={handleDownloadActiveTabPdf}
                          className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                        >
                          <FileText className="w-4 h-4 text-[#8B7335] dark:text-[#C5AE6B]" />
                          <span>
                            {copy.header.downloadCurrentPdf} ({activeTab.meta.name})
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleDownloadAllPdf}
                        className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <Download className="w-4 h-4 text-[#8B7335] dark:text-[#C5AE6B]" />
                        <span>{copy.header.downloadAllPdf}</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setPdfMenuOpen(false);
                          await exportReconciliationToPdf({
                            snapshot,
                            adjustments,
                            lang,
                            timezone,
                          });
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <Scale className="w-4 h-4 text-[#8B7335] dark:text-[#C5AE6B]" />
                        <span>{copy.reconciliation.downloadPdfBtn}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Workspace Main Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto space-y-6">
          {/* Sub-header sync strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoSync((v) => !v)}
                className="font-medium text-slate-700 dark:text-slate-300 hover:text-[#8B7335] dark:hover:text-[#C5AE6B] transition-colors"
              >
                {autoSync ? copy.header.autoSyncOn : copy.header.autoSyncOff}
              </button>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {copy.header.lastSynced}:{' '}
                {snapshot ? formatLocalSyncTime(snapshot.fetchedAt) : '-'} ({timezone})
              </span>
              {justUpdatedNotice && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {copy.dashboard.syncUpdatedBanner}
                  </span>
                </>
              )}
            </div>

            {snapshot && (
              <a
                href={snapshot.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 hover:text-[#8B7335] dark:hover:text-[#C5AE6B] transition-colors"
              >
                <span>{copy.dashboard.openSpreadsheet}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {loadingSheet ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-28 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse p-5"
                  />
                ))}
              </div>
              <div className="h-80 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse p-6 flex items-center justify-center text-sm text-slate-500">
                {copy.dashboard.loadingData}
              </div>
            </div>
          ) : syncError && !snapshot ? (
            <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-xl p-8 text-center space-y-4">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                {copy.dashboard.errorSync}: {syncError}
              </p>
              <button
                type="button"
                onClick={() => fetchSpreadsheet(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 dark:bg-[#C5AE6B] text-white dark:text-slate-950"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{copy.dashboard.retrySync}</span>
              </button>
            </div>
          ) : activeView.kind === 'reconciliation' && snapshot ? (
            <ReconciliationPanel
              snapshot={snapshot}
              adjustments={adjustments}
              lang={lang}
              timezone={timezone}
              onAdjustmentsChange={setAdjustments}
              onSelectTabGid={selectSheetTab}
            />
          ) : activeTab ? (
            <div className="space-y-6">
              {/* Mobile/Tablet Quick Category Switcher Strip */}
              {snapshot && (
                <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto pb-1">
                  {snapshot.tabs.map((tab) => {
                    const isActive = tab.meta.gid === activeTab.meta.gid;
                    return (
                      <button
                        key={tab.meta.gid}
                        type="button"
                        onClick={() => selectSheetTab(tab.meta.gid)}
                        className={`px-3 py-2 min-h-[40px] rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                          isActive
                            ? 'bg-slate-900 text-white dark:bg-[#C5AE6B] dark:text-slate-950'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {tab.meta.name}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={selectReconciliation}
                    className="px-3 py-2 min-h-[40px] rounded-lg text-xs font-medium whitespace-nowrap shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                  >
                    <Scale className="w-3.5 h-3.5 text-[#8B7335] dark:text-[#C5AE6B]" />
                    <span>{copy.nav.reconciliation}</span>
                  </button>
                </div>
              )}

              {/* Live 100% Klop / Reconciliation Status Strip */}
              {snapshot && (
                <div
                  className={`rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    reconciliationOverview.allKlop
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
                      : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 text-xs sm:text-sm">
                    {reconciliationOverview.allKlop ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    )}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {reconciliationOverview.allKlop
                        ? copy.reconciliation.status100Klop
                        : `${reconciliationOverview.klopCount}/${reconciliationOverview.totalChecks} ${copy.reconciliation.checksPassedLabel}`}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {reconciliationOverview.allKlop
                        ? `— ${copy.reconciliation.bannerAllMatched}`
                        : `— ${copy.reconciliation.netVarianceLabel}: ${formatRupiah(reconciliationOverview.netVariance)}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={selectReconciliation}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 self-start sm:self-auto"
                  >
                    <Scale className="w-3.5 h-3.5 text-[#8B7335] dark:text-[#C5AE6B]" />
                    <span>{copy.reconciliation.openReconciliationBtn}</span>
                  </button>
                </div>
              )}

              {/* KPI Strip */}
              {activeTab.meta.isSummary && activeTab.overview ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {copy.dashboard.totalPrice}
                      </p>
                      <p className="mt-2 font-mono tabular-nums text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {formatRupiah(activeTab.overview.totalObligation)}
                      </p>
                      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                        Utan Kayu Gang Duren 2
                      </p>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {copy.dashboard.totalPaid}
                      </p>
                      <p className="mt-2 font-mono tabular-nums text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                        {formatRupiah(activeTab.overview.totalPaid)}
                      </p>
                      <p className="mt-1.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {activeTab.transactionCount} {copy.dashboard.transactionsCount}
                      </p>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {copy.dashboard.remainingDebt}
                      </p>
                      <p className="mt-2 font-mono tabular-nums text-xl sm:text-2xl font-bold text-amber-700 dark:text-amber-400">
                        {formatRupiah(activeTab.overview.remainingBalance)}
                      </p>
                      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                        {(100 - activeTab.overview.progressPercent).toFixed(2)}% {copy.dashboard.ofTotal}
                      </p>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {copy.dashboard.completionRate}
                        </p>
                        <p className="mt-2 font-mono tabular-nums text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                          {activeTab.overview.progressPercent.toFixed(2)}%
                        </p>
                      </div>
                      <div className="mt-3 w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
                          style={{ width: `${activeTab.overview.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Charts Panel */}
                  <ChartsPanel
                    overview={activeTab.overview}
                    lang={lang}
                    onSelectTabGid={selectSheetTab}
                  />
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {copy.dashboard.tabTotalReceived}
                    </p>
                    <p className="mt-2 font-mono tabular-nums text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                      {formatRupiah(activeTab.declaredTotal ?? activeTab.computedTotal)}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {activeTab.meta.name}
                    </p>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {copy.dashboard.tabTransactions}
                    </p>
                    <p className="mt-2 font-mono tabular-nums text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {activeTab.transactionCount}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {copy.dashboard.transactionsCount}
                    </p>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {copy.dashboard.tabLatestPayment}
                    </p>
                    <p className="mt-2 font-mono tabular-nums text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                      {activeTab.latestDate || '-'}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      Google Sheets
                    </p>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {copy.dashboard.tabAverage}
                    </p>
                    <p className="mt-2 font-mono tabular-nums text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                      {formatRupiah(activeTab.averageAmount)}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {copy.dashboard.ofTotal}
                    </p>
                  </div>
                </div>
              )}

              {/* Primary Ledger Table Section */}
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {activeTab.title}
                      </h2>
                      <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
                        {copy.dashboard.showingRows} {filteredRows.length} {copy.dashboard.ofRows}{' '}
                        {activeTab.rows.length} {copy.dashboard.rowsUnit}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleDownloadActiveTabPdf}
                      disabled={filteredRows.length === 0}
                      className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Download className="w-4 h-4 text-[#8B7335] dark:text-[#C5AE6B]" />
                      <span>{copy.header.downloadCurrentPdf}</span>
                    </button>
                  </div>

                  {/* Real-time Search & Year Filter */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={copy.dashboard.searchPlaceholder}
                        className="w-full min-h-[42px] pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8B7335] dark:focus:ring-[#C5AE6B]"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="min-h-[42px] px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                      >
                        <option value="all">{copy.dashboard.allYears}</option>
                        {availableYears.map((yr) => (
                          <option key={yr} value={String(yr)}>
                            {yr}
                          </option>
                        ))}
                      </select>

                      {isFiltered && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setSelectedYear('all');
                          }}
                          className="min-h-[42px] px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                        >
                          {copy.dashboard.clearFilter}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {filteredRows.length === 0 ? (
                  <div className="p-10 text-center space-y-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {copy.dashboard.noDataTitle}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {copy.dashboard.noDataDesc}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Desktop & Tablet Table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-600 dark:text-slate-400">
                            <th className="py-3 px-4 w-12 text-center">{copy.dashboard.colNo}</th>
                            <th className="py-3 px-4 whitespace-nowrap">{copy.dashboard.colDate}</th>
                            <th className="py-3 px-4">{copy.dashboard.colDescription}</th>
                            <th className="py-3 px-4 text-right whitespace-nowrap">
                              {copy.dashboard.colAmount}
                            </th>
                            <th className="py-3 px-4 text-right whitespace-nowrap">
                              {activeTab.meta.isSummary
                                ? copy.dashboard.colRemaining
                                : copy.dashboard.colRunningTotal}
                            </th>
                            {activeTab.meta.isSummary && (
                              <th className="py-3 px-4">{copy.dashboard.colNote}</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                          {filteredRows.map((row, idx) => (
                            <tr
                              key={row.id}
                              className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              <td className="py-2.5 px-4 text-center font-mono text-xs tabular-nums text-slate-400 dark:text-slate-500">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-4 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                {row.dateRaw}
                              </td>
                              <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100">
                                {row.description}
                              </td>
                              <td
                                className={`py-2.5 px-4 text-right font-mono tabular-nums font-medium whitespace-nowrap ${
                                  (row.amount ?? 0) < 0
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {row.amountFormatted}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                {row.runningBalanceFormatted}
                              </td>
                              {activeTab.meta.isSummary && (
                                <td className="py-2.5 px-4 text-xs text-slate-500 dark:text-slate-400">
                                  {row.note || '-'}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-semibold text-sm">
                            <td colSpan={3} className="py-3 px-4 text-right text-slate-700 dark:text-slate-300">
                              {copy.dashboard.totalLabel}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {formatRupiah(
                                isFiltered
                                  ? filteredSum
                                  : activeTab.declaredTotal ?? filteredSum
                              )}
                            </td>
                            <td colSpan={activeTab.meta.isSummary ? 2 : 1} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Mobile Responsive Card List */}
                    <div className="sm:hidden divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredRows.map((row, idx) => (
                        <div key={row.id} className="p-4 space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            <span>
                              #{idx + 1} · {row.dateRaw}
                            </span>
                            <span>
                              {activeTab.meta.isSummary
                                ? `${copy.dashboard.colRemaining}: ${row.runningBalanceFormatted}`
                                : `${copy.dashboard.colRunningTotal}: ${row.runningBalanceFormatted}`}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {row.description}
                          </p>
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <span
                              className={`font-mono tabular-nums text-sm font-bold ${
                                (row.amount ?? 0) < 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {row.amountFormatted}
                            </span>
                            {row.note && (
                              <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[55%]">
                                {row.note}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="p-4 bg-slate-50 dark:bg-slate-950 flex items-center justify-between font-semibold text-sm">
                        <span>{copy.dashboard.totalLabel}</span>
                        <span className="font-mono tabular-nums">
                          {formatRupiah(
                            isFiltered ? filteredSum : activeTab.declaredTotal ?? filteredSum
                          )}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </section>

              {/* Rekapitulasi Sub-Tables: Legalitas & Category Summary */}
              {activeTab.meta.isSummary && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Legal Costs Table */}
                  {activeTab.legalCosts && activeTab.legalCosts.rows.length > 0 && (
                    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
                      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                          {copy.dashboard.legalSectionTitle}
                        </h3>
                        <button
                          type="button"
                          onClick={() => handleDownloadSubSectionPdf('legal')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                        >
                          <Download className="w-3.5 h-3.5 text-[#8B7335] dark:text-[#C5AE6B]" />
                          <span>PDF</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-600 dark:text-slate-400">
                              <th className="py-2.5 px-4 whitespace-nowrap">{copy.dashboard.colDate}</th>
                              <th className="py-2.5 px-4">{copy.dashboard.colDescription}</th>
                              <th className="py-2.5 px-4 text-right whitespace-nowrap">
                                {copy.dashboard.colAmount}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs sm:text-sm">
                            {activeTab.legalCosts.rows.map((item) => (
                              <tr key={item.id}>
                                <td className="py-2.5 px-4 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                  {item.dateRaw}
                                </td>
                                <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100">
                                  <div>{item.description}</div>
                                  {item.note && (
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                      {item.note}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium whitespace-nowrap">
                                  {item.amountFormatted}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-semibold text-sm">
                              <td colSpan={2} className="py-3 px-4 text-right">
                                {copy.dashboard.totalLabel}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                                {formatRupiah(activeTab.legalCosts.total)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </section>
                  )}

                  {/* Summary Breakdown Table */}
                  {activeTab.summaryItems && activeTab.summaryItems.length > 0 && (
                    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
                      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                          {copy.dashboard.summarySectionTitle}
                        </h3>
                        <button
                          type="button"
                          onClick={() => handleDownloadSubSectionPdf('summary')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                        >
                          <Download className="w-3.5 h-3.5 text-[#8B7335] dark:text-[#C5AE6B]" />
                          <span>PDF</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-600 dark:text-slate-400">
                              <th className="py-2.5 px-4 whitespace-nowrap">{copy.dashboard.colDate}</th>
                              <th className="py-2.5 px-4">{copy.dashboard.colDescription}</th>
                              <th className="py-2.5 px-4 text-right whitespace-nowrap">
                                {copy.dashboard.colAmount}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs sm:text-sm">
                            {activeTab.summaryItems.map((item) => {
                              const linkedTab = snapshot?.tabs.find(
                                (t) => t.meta.name === item.linkedTabName
                              );
                              return (
                                <tr key={item.id}>
                                  <td className="py-2.5 px-4 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                    {item.dateRaw}
                                  </td>
                                  <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100">
                                    <div className="flex items-center justify-between gap-2">
                                      <span>{item.label}</span>
                                      {linkedTab && (
                                        <button
                                          type="button"
                                          onClick={() => selectSheetTab(linkedTab.meta.gid)}
                                          className="inline-flex items-center gap-1 text-xs font-medium text-[#8B7335] dark:text-[#C5AE6B] hover:underline whitespace-nowrap"
                                        >
                                          <span>{copy.dashboard.openTabDetail}</span>
                                          <ArrowUpRight className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium whitespace-nowrap">
                                    {item.amountFormatted}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-semibold text-sm">
                              <td colSpan={2} className="py-3 px-4 text-right">
                                {copy.dashboard.totalPaid}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                                {formatRupiah(activeTab.overview?.totalPaid ?? activeTab.declaredTotal)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </main>

        {/* Company Copyright Footer */}
        <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-4 px-4 sm:px-6 lg:px-8">
          <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {copy.footer.copyright}
            </span>
            <span>
              {copy.footer.systemLabel} · {timezone}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
