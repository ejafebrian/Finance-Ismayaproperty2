'use client';

import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { getCopy } from '@/lib/i18n';
import type { Language, RekapOverviewMetrics } from '@/lib/types';

interface ChartsPanelProps {
  overview: RekapOverviewMetrics;
  lang: Language;
  onSelectTabGid: (gid: string) => void;
}

export default function ChartsPanel({
  overview,
  lang,
  onSelectTabGid,
}: ChartsPanelProps) {
  const copy = getCopy(lang);
  const maxOwnerAmount = Math.max(
    1,
    ...overview.ownerTotals.map((o) => o.amount)
  );
  const maxYearAmount = Math.max(
    1,
    ...overview.yearlyBreakdown.map((y) => y.totalAmount)
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Recipient / Owner Distribution */}
      <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4 mb-5">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            {copy.dashboard.ownerDistributionTitle}
          </h2>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {formatRupiah(overview.totalPaid)}
          </span>
        </div>

        <div className="space-y-4">
          {overview.ownerTotals.map((item) => {
            const widthPct = Math.max(3, Math.round((item.amount / maxOwnerAmount) * 100));
            const clickable = Boolean(item.gid);

            return (
              <div key={item.name} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    {clickable ? (
                      <button
                        type="button"
                        onClick={() => item.gid && onSelectTabGid(item.gid)}
                        className="inline-flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200 hover:text-[#8B7335] dark:hover:text-[#C5AE6B] transition-colors truncate text-left"
                      >
                        <span className="truncate">{item.name}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0 opacity-70" />
                      </button>
                    ) : (
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                        {item.name}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 font-mono tabular-nums">
                    <span className="text-slate-900 dark:text-slate-100 font-medium">
                      {formatRupiah(item.amount)}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 w-12 text-right">
                      {item.percentOfPaid.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-slate-900 dark:bg-[#C5AE6B] transition-all duration-300"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Yearly Installment Trend */}
      <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-4 mb-5">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            {copy.dashboard.yearlyTrendTitle}
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {overview.yearlyBreakdown.length > 0
              ? `${overview.yearlyBreakdown[0].year} – ${overview.yearlyBreakdown[overview.yearlyBreakdown.length - 1].year}`
              : '-'}
          </span>
        </div>

        <div className="space-y-3.5">
          {overview.yearlyBreakdown.map((yr) => {
            const pct = Math.max(
              3,
              Math.round((Math.max(0, yr.totalAmount) / maxYearAmount) * 100)
            );
            return (
              <div key={yr.year} className="grid grid-cols-12 items-center gap-3 text-xs sm:text-sm">
                <span className="col-span-2 font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
                  {yr.year}
                </span>
                <div className="col-span-5 h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#8B7335] dark:bg-[#C5AE6B]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="col-span-5 text-right font-mono tabular-nums">
                  <span className="text-slate-900 dark:text-slate-100 font-medium">
                    {formatRupiah(yr.totalAmount)}
                  </span>
                  <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500 ml-1.5">
                    ({yr.transactionCount})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
