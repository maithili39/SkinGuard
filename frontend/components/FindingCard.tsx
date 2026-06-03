'use client';

import { XCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import type { Finding } from '../types';
import { KindBadge } from './KindBadge';

export function FindingCard({ f }: { f: Finding }) {
  const colors = {
    danger: 'border-rose-200 bg-rose-50',
    warning: 'border-amber-200 bg-amber-50',
    good: 'border-emerald-200 bg-emerald-50',
  };
  const icons = {
    danger: <XCircle size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />,
    warning: <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />,
    good: <CheckCircle size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />,
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[f.level]} flex gap-2.5`}>
      {icons[f.level]}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span className="font-semibold text-slate-800 text-sm">{f.ingredient}</span>
          <KindBadge kind={f.kind} />
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">{f.message}</p>
        {f.source && (
          <p className="text-[10px] text-slate-400 mt-1 italic">Source: {f.source}</p>
        )}
      </div>
    </div>
  );
}
