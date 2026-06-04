'use client';

import { FlaskConical } from 'lucide-react';

interface Props {
  assessedCount: number;
  matchedCount: number;
  depthPct: number;
}

export function AssessmentDepthBanner({ assessedCount, matchedCount, depthPct }: Props) {
  if (matchedCount === 0) return null;

  const noData = assessedCount === 0;
  const barColor = noData
    ? 'bg-slate-300'
    : depthPct < 15
      ? 'bg-gradient-to-r from-rose-500 to-rose-400'
      : depthPct < 50
        ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
        : 'bg-gradient-to-r from-emerald-500 to-green-400';

  const wrapperClass = noData
    ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40'
    : depthPct < 15
      ? 'border-rose-200/80 bg-gradient-to-r from-rose-50 to-transparent dark:border-rose-800/50 dark:from-rose-950/30'
      : depthPct < 50
        ? 'border-amber-200/80 bg-gradient-to-r from-amber-50 to-transparent dark:border-amber-800/50 dark:from-amber-950/30'
        : 'border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-transparent dark:border-emerald-800/50 dark:from-emerald-950/30';

  return (
    <div className={`rounded-2xl border p-4 ${wrapperClass} animate-fade-in-up`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-xl flex-shrink-0 ${noData ? 'bg-slate-100 dark:bg-slate-700' : depthPct < 50 ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-emerald-100 dark:bg-emerald-900/40'}`}>
          <FlaskConical
            size={16}
            className={noData
              ? 'text-slate-400'
              : depthPct < 50
                ? 'text-amber-600'
                : 'text-emerald-600'}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Assessment Depth</p>
            <span className="text-sm font-black text-slate-700 dark:text-slate-200">
              {noData ? '0' : depthPct}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${barColor}`}
              style={{ width: `${noData ? 0 : depthPct}%` }}
            />
          </div>

          {noData ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <strong className="text-slate-600 dark:text-slate-300">0 of {matchedCount}</strong> recognised ingredients have curated risk data.
              All are from the EU registry — identity known, skin-risk unknown.{' '}
              <span className="font-semibold text-slate-600 dark:text-slate-300">Score withheld to avoid false confidence.</span>
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Curated risk data on{' '}
              <strong className="text-slate-600 dark:text-slate-300">{assessedCount} of {matchedCount}</strong> recognised ingredients.
              {depthPct < 50 && (
                <span className="text-amber-700 dark:text-amber-400"> Proceed with care for the remaining {matchedCount - assessedCount}.</span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
