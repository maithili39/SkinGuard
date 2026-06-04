'use client';

import React, { useState, useEffect } from 'react';
import { History, X, Loader2, Clock, RotateCcw } from 'lucide-react';
import type { ScanSummary } from '../types';
import { formatDate } from '../types';

interface Props {
  email: string;
  token: string;
  onClose: () => void;
  onSelectScan: (inputText: string) => void;
}

function ScoreSparkline({ scans }: { scans: ScanSummary[] }) {
  const scores = scans
    .slice(0, 10) // scans is sorted desc (newest first), so slice(0, 10) is last 10
    .reverse()    // oldest first for left-to-right timeline
    .map(s => s.safety_score)
    .filter((s): s is number => s !== null);

  if (scores.length < 2) return null;

  const width = 280;
  const height = 44;
  const padding = 6;
  
  const points = scores.map((score, idx) => {
    const x = padding + (idx * (width - padding * 2)) / (scores.length - 1);
    const y = padding + ((100 - score) * (height - padding * 2)) / 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-200/50 dark:border-slate-800/40 mb-4">
      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 px-0.5">
        <span className="flex items-center gap-1">📊 Score Trend (Last {scores.length} Scans)</span>
        <span className="text-emerald-600 dark:text-emerald-400">
          Avg: {Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}
        </span>
      </div>
      <div className="relative h-11 w-full flex items-center justify-center">
        <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path
            d={`M ${padding},${height} L ${points} L ${padding + (scores.length - 1) * (width - padding * 2) / (scores.length - 1)},${height} Z`}
            fill="url(#sparkline-grad)"
          />
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
          {scores.length > 0 && (() => {
            const lastIdx = scores.length - 1;
            const lastScore = scores[lastIdx];
            const cx = padding + (lastIdx * (width - padding * 2)) / (scores.length - 1);
            const cy = padding + ((100 - lastScore) * (height - padding * 2)) / 100;
            return <circle cx={cx} cy={cy} r="3.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />;
          })()}
        </svg>
      </div>
    </div>
  );
}

export function HistoryDrawer({ email, token, onClose, onSelectScan }: Props) {
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/scans', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error('Failed to load history');
        const data = await res.json();
        setScans(data.scans || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/35 backdrop-blur-sm z-40" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-white dark:bg-slate-950 shadow-2xl z-50 flex flex-col animate-slide-in-right border-l border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <History size={20} className="text-primary-600 dark:text-primary-400" />
            <h2 className="font-extrabold text-slate-800 dark:text-white">Scan History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Signed in as <span className="font-bold text-slate-700 dark:text-slate-300">{email}</span>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-primary-500" size={24} />
            </div>
          )}
          {error && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-xl text-sm border border-rose-200 dark:border-rose-800/50">
              {error}
            </div>
          )}
          {!loading && !error && scans.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-20 px-4">
              <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-full mb-4 text-slate-400 dark:text-slate-500">
                <History size={36} className="opacity-70" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base mb-1">No scan history</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs max-w-[200px] mb-5">
                You haven&apos;t analyzed any skincare products yet.
              </p>
              <button
                onClick={onClose}
                className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold px-5 py-2.5 rounded-full shadow-md shadow-primary-500/25 transition-all cursor-pointer"
              >
                Scan a Product
              </button>
            </div>
          )}

          {!loading && !error && scans.length > 0 && (
            <>
              <ScoreSparkline scans={scans} />
              <div className="space-y-3">
                {scans.map((scan) => (
                  <div key={scan.id} className="bg-slate-50/50 dark:bg-slate-900/20 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 hover:border-slate-200 dark:hover:border-slate-700 transition-all shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1 mb-1.5 font-semibold">
                          <Clock size={10} />
                          {formatDate(scan.created_at)}
                        </p>
                        <p className="text-xs text-slate-750 dark:text-slate-300 leading-relaxed line-clamp-2 font-medium">
                          {scan.summary || 'No summary available'}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-semibold">
                          {scan.coverage_percent}% of label recognised
                        </p>
                      </div>
                      <div className={`flex-shrink-0 text-center px-3 py-1.5 rounded-xl font-black text-lg ${
                        scan.safety_score === null
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                          : scan.safety_score >= 80
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/40'
                            : scan.safety_score >= 50
                              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-900/40'
                              : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-100 dark:border-rose-900/40'
                      }`}>
                        {scan.safety_score ?? 'N/A'}
                      </div>
                    </div>

                    {scan.input_text && (
                      <button
                        onClick={() => {
                          onSelectScan(scan.input_text!);
                          onClose();
                        }}
                        className="mt-3 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1 cursor-pointer transition-colors bg-primary-50 dark:bg-primary-950/40 hover:bg-primary-100/70 dark:hover:bg-primary-900/40 px-2.5 py-1.5 rounded-xl border border-primary-200/50 dark:border-primary-800/40 w-fit"
                      >
                        <RotateCcw size={12} />
                        Load & Re-analyse
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
