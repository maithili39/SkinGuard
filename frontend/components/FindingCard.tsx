'use client';

import { XCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import type { Finding } from '../types';
import { KindBadge } from './KindBadge';

export function FindingCard({ f, index = 0 }: { f: Finding; index?: number }) {
  const styles = {
    danger: {
      wrapper: 'border-rose-200/80 bg-gradient-to-r from-rose-50 to-rose-50/40 dark:from-rose-950/40 dark:border-rose-800/50',
      accent: 'bg-rose-500',
      text: 'text-rose-700 dark:text-rose-300',
    },
    warning: {
      wrapper: 'border-amber-200/80 bg-gradient-to-r from-amber-50 to-amber-50/40 dark:from-amber-950/40 dark:border-amber-800/50',
      accent: 'bg-amber-500',
      text: 'text-amber-700 dark:text-amber-300',
    },
    good: {
      wrapper: 'border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-emerald-50/40 dark:from-emerald-950/40 dark:border-emerald-800/50',
      accent: 'bg-emerald-500',
      text: 'text-emerald-700 dark:text-emerald-300',
    },
  };

  const icons = {
    danger:  <XCircle     size={15} className="text-rose-500 flex-shrink-0 mt-0.5" />,
    warning: <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />,
    good:    <CheckCircle  size={15} className="text-emerald-500 flex-shrink-0 mt-0.5" />,
  };

  const s = styles[f.level];

  return (
    <div
      className={`rounded-xl border p-3 ${s.wrapper} flex gap-3 card-hover animate-fade-in-up`}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      {/* Colored left accent bar */}
      <div className={`w-1 rounded-full self-stretch flex-shrink-0 ${s.accent} opacity-70`} />
      {icons[f.level]}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">{f.ingredient}</span>
          <KindBadge kind={f.kind} />
        </div>
        <p className={`text-xs leading-relaxed ${s.text}`}>{f.message}</p>
        {f.alternatives && f.alternatives.length > 0 && (
          <div className="mt-2 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-white/40 dark:bg-black/15 px-2.5 py-1.5 rounded-lg border border-slate-200/40 dark:border-white/5 inline-flex items-center gap-1.5">
            <span className="text-primary-600 dark:text-primary-400 font-semibold">Try instead:</span>
            <span>{f.alternatives.join(', ')}</span>
          </div>
        )}
        {f.source && (
          <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
            <span className="inline-block w-1 h-1 rounded-full bg-slate-300" />
            {f.source}
          </p>
        )}
      </div>
    </div>
  );
}
