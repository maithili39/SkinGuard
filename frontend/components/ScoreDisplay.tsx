'use client';

import { HelpCircle } from 'lucide-react';
import { scoreColor } from '../types';

export function ScoreDisplay({ score, basis }: { score: number | null; basis: string }) {
  if (score === null) {
    return (
      <div className="flex flex-col items-end">
        <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Safety Score</div>
        <div className="flex items-center gap-2">
          <HelpCircle size={28} className="text-slate-400" />
          <span className="text-4xl font-black text-slate-400">N/A</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-1 text-right max-w-[180px]">
          Insufficient risk data — score withheld
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end">
      <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Safety Score</div>
      <div className={`text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r ${scoreColor(score)}`}>
        {score}<span className="text-2xl text-slate-400">/100</span>
      </div>
      <div className="text-[11px] text-slate-400 mt-1">
        {basis === 'indicative' ? 'Indicative guidance — not a clinical measure' : basis}
      </div>
    </div>
  );
}
