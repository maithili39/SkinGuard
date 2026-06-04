'use client';

import React, { useEffect, useRef } from 'react';
import { HelpCircle } from 'lucide-react';
import { scoreColor, scoreRingColor } from '../types';

const CIRCUMFERENCE = 2 * Math.PI * 45; // r=45

export function ScoreDisplay({ score, basis }: { score: number | null; basis: string }) {
  const circleRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    if (circleRef.current === null) return;
    const pct = score ?? 0;
    const offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
    // Animate via direct DOM for reliable SVG stroke-dashoffset animation
    circleRef.current.style.strokeDashoffset = String(CIRCUMFERENCE);
    const raf = requestAnimationFrame(() => {
      if (circleRef.current) {
        circleRef.current.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
        circleRef.current.style.strokeDashoffset = String(offset);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [score]);

  if (score === null) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="relative w-24 h-24 flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="8" />
            <circle cx="50" cy="50" r="45" fill="none" stroke="#cbd5e1" strokeWidth="8"
              strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * 0.75}
              strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <HelpCircle size={22} className="text-slate-400" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Safety Score</p>
          <p className="text-[10px] text-slate-400 mt-0.5 max-w-[120px] leading-tight">
            Insufficient data — withheld
          </p>
        </div>
      </div>
    );
  }

  const ringColor = scoreRingColor(score);
  const label = score >= 80 ? 'Safe' : score >= 50 ? 'Caution' : 'Risk';
  const labelColor = score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-rose-600';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-24 flex items-center justify-center">
        {/* Pulse ring for low scores */}
        {score < 50 && (
          <div
            className="absolute inset-0 rounded-full animate-pulse-ring"
            style={{ border: `3px solid ${ringColor}`, opacity: 0.4 }}
          />
        )}
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" aria-hidden="true">
          {/* Track */}
          <circle cx="50" cy="50" r="45" fill="none"
            stroke="rgba(148,163,184,0.12)" strokeWidth="8" />
          {/* Progress */}
          <circle
            ref={circleRef}
            cx="50" cy="50" r="45" fill="none"
            stroke={ringColor} strokeWidth="8"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE}
            strokeLinecap="round"
          />
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-black bg-clip-text text-transparent bg-gradient-to-b ${scoreColor(score)}`}>
            {score}
          </span>
          <span className="text-[9px] text-slate-400 -mt-0.5">/100</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Safety Score</p>
        <p className={`text-xs font-semibold ${labelColor} mt-0.5`}>{label}</p>
        <p className="text-[10px] text-slate-400">
          {basis === 'indicative' ? 'Indicative guidance' : basis}
        </p>
      </div>
    </div>
  );
}
