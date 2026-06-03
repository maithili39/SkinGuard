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
  return (
    <div className={`rounded-xl border p-3.5 flex gap-3 items-start ${noData
      ? 'border-slate-300 bg-slate-50'
      : depthPct < 15
        ? 'border-rose-200 bg-rose-50'
        : depthPct < 50
          ? 'border-amber-200 bg-amber-50'
          : 'border-emerald-200 bg-emerald-50'
    }`}>
      <FlaskConical
        size={18}
        className={noData
          ? 'text-slate-400 flex-shrink-0 mt-0.5'
          : depthPct < 50
            ? 'text-amber-500 flex-shrink-0 mt-0.5'
            : 'text-emerald-500 flex-shrink-0 mt-0.5'}
      />
      <div>
        <p className="text-sm font-semibold text-slate-800 mb-0.5">Assessment Depth</p>
        {noData ? (
          <p className="text-xs text-slate-600">
            <strong>0 of {matchedCount}</strong> recognised ingredients have curated risk data.
            All are from the EU ingredient registry — identity known, skin-risk unknown.
            The score above is withheld to avoid a false sense of safety.
          </p>
        ) : (
          <p className="text-xs text-slate-600">
            We have curated risk data on <strong>{assessedCount} of {matchedCount}</strong> recognised ingredients ({depthPct}%).
            {depthPct < 50 && ' Findings reflect the assessed subset — proceed with care for the rest.'}
          </p>
        )}
      </div>
    </div>
  );
}
