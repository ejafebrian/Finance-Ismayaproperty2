'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Percent,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { getCopy } from '@/lib/i18n';
import { exportReconciliationToPdf } from '@/lib/pdf-export';
import type {
  Language,
  ReconciliationAdjustment,
  ReconciliationCheckItem,
  SpreadsheetSnapshot,
} from '@/lib/types';

interface ReconciliationPanelProps {
  snapshot: SpreadsheetSnapshot;
  adjustments: ReconciliationAdjustment[];
  lang: Language;
  timezone: string;
  onAdjustmentsChange: (next: ReconciliationAdjustment[]) => void;
  onSelectTabGid: (gid: string) => void;
}

type FilterMode = 'all' | 'mismatch' | 'matched';

function calcMatchPercent(expectedAmount: number, actualAmount: number): number {
  if (Math.round(expectedAmount) === Math.round(actualAmount)) return 100;
  const denom = Math.max(Math.abs(expectedAmount), Math.abs(actualAmount), 1);
  const raw = (1 - Math.abs(actualAmount - expectedAmount) / denom) * 100;
  const rounded = Math.max(0, Math.min(100, Math.round(raw * 100) / 100));
  return rounded >= 100 ? 99.99 : rounded;
}

export default function ReconciliationPanel({
  snapshot,
  adjustments,
  lang,
  timezone,
  onAdjustmentsChange,
  onSelectTabGid,
}: ReconciliationPanelProps) {
  const copy = getCopy(lang);
  const [filter, setFilter] = useState<FilterMode>('all');

  // Modal state
  const [editingCheck, setEditingCheck] = useState<ReconciliationCheckItem | null>(null);
  const [adjMode, setAdjMode] = useState<'percent' | 'nominal'>('percent');
  const [percentStr, setPercentStr] = useState('0');
  const [nominalStr, setNominalStr] = useState('0');
  const [exactMatchActive, setExactMatchActive] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const enrichedChecks = useMemo(() => {
    const adjMap = new Map(adjustments.map((a) => [a.checkId, a]));
    return snapshot.reconciliation.checks.map((check) => {
      const adj = adjMap.get(check.id) || null;
      const adjustedActual = check.actualAmount + (adj ? adj.nominalDelta : 0);
      const effectiveDiff = Math.round(adjustedActual - check.expectedAmount);
      const isKlop = effectiveDiff === 0;
      const effectivePercent = isKlop
        ? 100
        : calcMatchPercent(check.expectedAmount, adjustedActual);

      return {
        check,
        adj,
        adjustedActual,
        effectiveDiff,
        isKlop,
        effectivePercent,
        isAdjusted: Boolean(adj),
      };
    });
  }, [snapshot.reconciliation.checks, adjustments]);

  const summaryStats = useMemo(() => {
    const total = enrichedChecks.length;
    const klopCount = enrichedChecks.filter((e) => e.isKlop).length;
    const netAbsDiff = enrichedChecks.reduce((sum, e) => sum + Math.abs(e.effectiveDiff), 0);
    const allKlop = total > 0 && klopCount === total;
    const avgPercent =
      total > 0
        ? Math.round(
            (enrichedChecks.reduce((sum, e) => sum + e.effectivePercent, 0) / total) * 100
          ) / 100
        : 100;

    return {
      total,
      klopCount,
      netAbsDiff,
      allKlop,
      overallPercent: allKlop ? 100 : Math.min(99.99, avgPercent),
      activeCount: adjustments.length,
    };
  }, [enrichedChecks, adjustments.length]);

  const filteredChecks = useMemo(() => {
    return enrichedChecks.filter((item) => {
      if (filter === 'mismatch') return !item.isKlop;
      if (filter === 'matched') return item.isKlop;
      return true;
    });
  }, [enrichedChecks, filter]);

  const openAdjustModal = (check: ReconciliationCheckItem, existing: ReconciliationAdjustment | null) => {
    setEditingCheck(check);
    setModalError('');
    if (existing) {
      setAdjMode(existing.mode);
      setPercentStr(String(existing.percentValue));
      setNominalStr(String(Math.round(existing.nominalDelta)));
      setExactMatchActive(
        Math.round(check.actualAmount + existing.nominalDelta - check.expectedAmount) === 0
      );
      setReason(existing.reason);
    } else {
      setAdjMode('percent');
      setPercentStr('0');
      setNominalStr('0');
      setExactMatchActive(false);
      setReason(check.suggestedReason || '');
    }
  };

  const handleAutoMatch100 = () => {
    if (!editingCheck) return;
    const neededDelta = editingCheck.expectedAmount - editingCheck.actualAmount;
    const neededPct =
      editingCheck.actualAmount !== 0
        ? (neededDelta / editingCheck.actualAmount) * 100
        : 0;
    setExactMatchActive(true);
    setPercentStr(neededPct.toFixed(4));
    setNominalStr(String(Math.round(neededDelta)));
    if (!reason.trim() && editingCheck.suggestedReason) {
      setReason(editingCheck.suggestedReason);
    }
  };

  const previewValues = useMemo(() => {
    if (!editingCheck) return null;
    const parsedPct = Number(percentStr);
    const parsedNom = Number(nominalStr);
    let delta = 0;
    let pct = 0;

    if (exactMatchActive) {
      delta = editingCheck.expectedAmount - editingCheck.actualAmount;
      pct =
        editingCheck.actualAmount !== 0
          ? (delta / editingCheck.actualAmount) * 100
          : 0;
    } else if (adjMode === 'percent') {
      pct = Number.isFinite(parsedPct) ? parsedPct : 0;
      delta = Math.round((editingCheck.actualAmount * pct) / 100);
    } else {
      delta = Number.isFinite(parsedNom) ? Math.round(parsedNom) : 0;
      pct =
        editingCheck.actualAmount !== 0
          ? (delta / editingCheck.actualAmount) * 100
          : 0;
    }

    const after = editingCheck.actualAmount + delta;
    const diff = Math.round(after - editingCheck.expectedAmount);
    const matchPct = diff === 0 ? 100 : calcMatchPercent(editingCheck.expectedAmount, after);

    return {
      delta,
      pct,
      after,
      diff,
      matchPct,
      isKlop: diff === 0,
    };
  }, [editingCheck, adjMode, percentStr, nominalStr, exactMatchActive]);

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCheck || !previewValues) return;
    setModalError('');

    setSaving(true);
    try {
      const res = await fetch('/api/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkId: editingCheck.id,
          checkLabel: editingCheck.label,
          mode: adjMode,
          percentValue: previewValues.pct,
          nominalDelta: previewValues.delta,
          reason: reason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setModalError(data.error || 'Gagal menyimpan penyesuaian.');
        return;
      }
      if (Array.isArray(data.adjustments)) {
        onAdjustmentsChange(data.adjustments);
      }
      setEditingCheck(null);
    } catch {
      setModalError('Kesalahan jaringan saat menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetAdjustment = async (checkId: string) => {
    try {
      const res = await fetch(
        `/api/reconciliation?checkId=${encodeURIComponent(checkId)}`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.adjustments)) {
        onAdjustmentsChange(data.adjustments);
      }
    } catch {
      // ignore
    }
  };

  const handleDownloadPdf = async () => {
    await exportReconciliationToPdf({
      snapshot,
      adjustments,
      lang,
      timezone,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: 100% Klop or Variance Alert */}
      <section
        className={`rounded-xl border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          summaryStats.allKlop
            ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
            : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
        }`}
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              summaryStats.allKlop
                ? 'bg-emerald-600 text-white'
                : 'bg-amber-600 text-white'
            }`}
          >
            {summaryStats.allKlop ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
                {copy.reconciliation.title}
              </h2>
              <span
                className={`text-xs font-mono font-semibold px-2 py-0.5 rounded border ${
                  summaryStats.allKlop
                    ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                    : 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                }`}
              >
                {summaryStats.allKlop
                  ? copy.reconciliation.status100Klop
                  : `${summaryStats.overallPercent.toFixed(2)}%`}
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              {summaryStats.allKlop
                ? copy.reconciliation.bannerAllMatched
                : copy.reconciliation.bannerHasMismatch}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDownloadPdf}
          className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-slate-900 dark:bg-[#C5AE6B] text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-[#d3be80] transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>{copy.reconciliation.downloadPdfBtn}</span>
        </button>
      </section>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {copy.reconciliation.overallMatchLabel}
          </p>
          <p
            className={`mt-2 font-mono tabular-nums text-xl sm:text-2xl font-bold ${
              summaryStats.allKlop
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {summaryStats.allKlop
              ? copy.reconciliation.status100Klop
              : `${summaryStats.overallPercent.toFixed(2)}%`}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {copy.reconciliation.rawLabel}: {snapshot.reconciliation.rawOverallPercent.toFixed(2)}%
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {copy.reconciliation.checksPassedLabel}
          </p>
          <p className="mt-2 font-mono tabular-nums text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {summaryStats.klopCount} / {summaryStats.total}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {copy.reconciliation.rawLabel}: {snapshot.reconciliation.rawMatchedCount} /{' '}
            {snapshot.reconciliation.totalChecks}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {copy.reconciliation.netVarianceLabel}
          </p>
          <p
            className={`mt-2 font-mono tabular-nums text-xl sm:text-2xl font-bold ${
              summaryStats.netAbsDiff === 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {formatRupiah(summaryStats.netAbsDiff)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {summaryStats.netAbsDiff === 0
              ? copy.reconciliation.status100Klop
              : copy.reconciliation.statusMismatch}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {copy.reconciliation.activeAdjustmentsLabel}
          </p>
          <p className="mt-2 font-mono tabular-nums text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {summaryStats.activeCount}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {copy.reconciliation.modePercent} &amp; {copy.reconciliation.modeNominal}
          </p>
        </div>
      </div>

      {/* Audit Table Section */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {copy.reconciliation.subtitle}
          </p>

          <div className="flex items-center gap-1.5 shrink-0">
            {(
              [
                ['all', copy.reconciliation.filterAll],
                ['mismatch', copy.reconciliation.filterMismatchOnly],
                ['matched', copy.reconciliation.filterMatchedOnly],
              ] as [FilterMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilter(mode)}
                className={`px-3 py-1.5 min-h-[38px] text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  filter === mode
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-[#C5AE6B] dark:text-slate-950 dark:border-[#C5AE6B]'
                    : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-600 dark:text-slate-400">
                <th className="py-3 px-4">{copy.reconciliation.colCheckItem}</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">
                  {copy.reconciliation.colOfficial}
                </th>
                <th className="py-3 px-4 text-right whitespace-nowrap">
                  {copy.reconciliation.colComputed}
                </th>
                <th className="py-3 px-4 text-right whitespace-nowrap">
                  {copy.reconciliation.colVariance}
                </th>
                <th className="py-3 px-4 text-right whitespace-nowrap">
                  {copy.reconciliation.colConformity}
                </th>
                <th className="py-3 px-4 text-right whitespace-nowrap">
                  {copy.reconciliation.colAction}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {filteredChecks.map(
                ({ check, adj, adjustedActual, effectiveDiff, isKlop, effectivePercent }) => (
                  <tr
                    key={check.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors align-top"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {check.label}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {check.sourceLabel} ↔ {check.targetLabel}
                      </div>
                      {check.note && (
                        <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                          {check.note}
                        </div>
                      )}
                      {adj && (
                        <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 font-mono">
                          {copy.reconciliation.adjustedBadge}:{' '}
                          {adj.percentValue >= 0 ? '+' : ''}
                          {adj.percentValue.toFixed(2)}% ({adj.nominalDelta >= 0 ? '+' : '-'}
                          {formatRupiah(Math.abs(adj.nominalDelta))}) · {adj.reason}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap text-slate-900 dark:text-slate-100">
                      {formatRupiah(check.expectedAmount)}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="text-slate-900 dark:text-slate-100 font-medium">
                        {formatRupiah(adjustedActual)}
                      </div>
                      {adj && (
                        <div className="text-xs text-slate-400 line-through">
                          {formatRupiah(check.actualAmount)}
                        </div>
                      )}
                    </td>

                    <td
                      className={`py-3.5 px-4 text-right font-mono tabular-nums font-medium whitespace-nowrap ${
                        isKlop
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {isKlop
                        ? 'Rp 0'
                        : `${effectiveDiff > 0 ? '+' : '-'}${formatRupiah(Math.abs(effectiveDiff))}`}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 font-mono text-xs font-semibold px-2.5 py-1 rounded border ${
                          isKlop
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {isKlop ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {adj
                                ? copy.reconciliation.statusAdjustedKlop
                                : copy.reconciliation.status100Klop}
                            </span>
                          </>
                        ) : (
                          <span>{effectivePercent.toFixed(2)}%</span>
                        )}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openAdjustModal(check, adj)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-[#8B7335] dark:text-[#C5AE6B]" />
                          <span>{copy.reconciliation.adjustBtn}</span>
                        </button>

                        {adj && (
                          <button
                            type="button"
                            onClick={() => handleResetAdjustment(check.id)}
                            title={copy.reconciliation.resetBtn}
                            className="inline-flex items-center justify-center w-8 h-[34px] rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {check.linkedGid && (
                          <button
                            type="button"
                            onClick={() => check.linkedGid && onSelectTabGid(check.linkedGid)}
                            title={copy.reconciliation.openTabBtn}
                            className="inline-flex items-center justify-center w-8 h-[34px] rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-[#8B7335] dark:hover:text-[#C5AE6B] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
          {filteredChecks.map(
            ({ check, adj, adjustedActual, effectiveDiff, isKlop, effectivePercent }) => (
              <div key={check.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {check.label}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {check.sourceLabel} ↔ {check.targetLabel}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-[11px] font-semibold px-2 py-0.5 rounded border ${
                      isKlop
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    {isKlop
                      ? adj
                        ? copy.reconciliation.statusAdjustedKlop
                        : copy.reconciliation.status100Klop
                      : `${effectivePercent.toFixed(2)}%`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="block text-[11px] text-slate-400 font-sans">
                      {copy.reconciliation.colOfficial}
                    </span>
                    <span className="font-semibold">{formatRupiah(check.expectedAmount)}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400 font-sans">
                      {copy.reconciliation.colComputed}
                    </span>
                    <span className="font-semibold">{formatRupiah(adjustedActual)}</span>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400 font-sans">
                      {copy.reconciliation.colVariance}
                    </span>
                    <span
                      className={
                        isKlop
                          ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                          : 'text-amber-700 dark:text-amber-400 font-semibold'
                      }
                    >
                      {isKlop
                        ? 'Rp 0'
                        : `${effectiveDiff > 0 ? '+' : '-'}${formatRupiah(Math.abs(effectiveDiff))}`}
                    </span>
                  </div>
                </div>

                {check.note && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">{check.note}</p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openAdjustModal(check, adj)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Percent className="w-3.5 h-3.5 text-[#8B7335] dark:text-[#C5AE6B]" />
                    <span>{copy.reconciliation.adjustBtn}</span>
                  </button>
                  {adj && (
                    <button
                      type="button"
                      onClick={() => handleResetAdjustment(check.id)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                    >
                      {copy.reconciliation.resetBtn}
                    </button>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </section>

      {/* Percentage / Nominal Adjustment Modal */}
      {editingCheck && previewValues && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  {copy.reconciliation.modalTitle}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {editingCheck.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCheck(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="space-y-4">
              {/* Mode Toggle + Quick 100% Klop Button */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-950">
                  <button
                    type="button"
                    onClick={() => {
                      setAdjMode('percent');
                      setExactMatchActive(false);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      adjMode === 'percent'
                        ? 'bg-slate-900 text-white dark:bg-[#C5AE6B] dark:text-slate-950'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {copy.reconciliation.modePercent}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdjMode('nominal');
                      setExactMatchActive(false);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      adjMode === 'nominal'
                        ? 'bg-slate-900 text-white dark:bg-[#C5AE6B] dark:text-slate-950'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {copy.reconciliation.modeNominal}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAutoMatch100}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{copy.reconciliation.autoMatchBtn}</span>
                </button>
              </div>

              {adjMode === 'percent' ? (
                <div className="space-y-2.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    {copy.reconciliation.percentInputLabel}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.0001"
                      min="-100"
                      max="500"
                      value={percentStr}
                      onChange={(e) => {
                        setExactMatchActive(false);
                        setPercentStr(e.target.value);
                      }}
                      className="w-full min-h-[42px] px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                    <span className="text-sm font-mono font-semibold text-slate-500">%</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="0.1"
                    value={Math.max(-100, Math.min(100, Number(percentStr) || 0))}
                    onChange={(e) => {
                      setExactMatchActive(false);
                      setPercentStr(e.target.value);
                    }}
                    className="w-full accent-[#8B7335] dark:accent-[#C5AE6B]"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                    {copy.reconciliation.nominalInputLabel}
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={nominalStr}
                    onChange={(e) => {
                      setExactMatchActive(false);
                      setNominalStr(e.target.value);
                    }}
                    className="w-full min-h-[42px] px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>
              )}

              {/* Live Calculation Preview Box */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs font-mono tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-sans">
                    {copy.reconciliation.previewBefore}
                  </span>
                  <span>{formatRupiah(editingCheck.actualAmount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-sans">
                    {copy.reconciliation.previewDelta}
                  </span>
                  <span>
                    {previewValues.delta >= 0 ? '+' : '-'}
                    {formatRupiah(Math.abs(previewValues.delta))} ({previewValues.pct.toFixed(2)}%)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-sans">
                    {copy.reconciliation.previewAfter}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatRupiah(previewValues.after)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-slate-500 font-sans">
                    {copy.reconciliation.previewNewDiff}
                  </span>
                  <span
                    className={`font-semibold ${
                      previewValues.isKlop
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {previewValues.isKlop
                      ? 'Rp 0'
                      : `${previewValues.diff > 0 ? '+' : '-'}${formatRupiah(Math.abs(previewValues.diff))}`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-sans">
                    {copy.reconciliation.previewStatus}
                  </span>
                  <span
                    className={`font-semibold ${
                      previewValues.isKlop
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {previewValues.isKlop
                      ? copy.reconciliation.status100Klop
                      : `${previewValues.matchPct.toFixed(2)}%`}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {copy.reconciliation.reasonLabel}
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={copy.reconciliation.reasonPlaceholder}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#8B7335] dark:focus:ring-[#C5AE6B]"
                />
              </div>

              {modalError && (
                <div className="px-3 py-2 text-xs rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300">
                  {modalError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCheck(null)}
                  className="px-4 py-2 min-h-[40px] text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {copy.reconciliation.cancelBtn}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 min-h-[40px] text-sm font-semibold rounded-lg bg-slate-900 dark:bg-[#C5AE6B] text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-[#d3be80] disabled:opacity-60"
                >
                  {saving ? copy.reconciliation.savingBtn : copy.reconciliation.saveBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
