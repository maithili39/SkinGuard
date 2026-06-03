'use client';

import React, { useState, useEffect } from 'react';
import { History, X, Loader2, Clock } from 'lucide-react';
import type { ScanSummary } from '../types';
import { formatDate } from '../types';

interface Props {
  email: string;
  token: string;
  onClose: () => void;
}

export function HistoryDrawer({ email, token, onClose }: Props) {
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(email)}/scans`, {
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
  }, [email, token]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <History size={20} className="text-primary-600" />
            <h2 className="font-bold text-slate-800">Scan History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 bg-slate-50 border-b border-slate-100">
          <p className="text-xs text-slate-500">
            Signed in as <span className="font-medium text-slate-700">{email}</span>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-primary-400" size={24} />
            </div>
          )}
          {error && (
            <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-sm border border-rose-200">
              {error}
            </div>
          )}
          {!loading && !error && scans.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <History size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No scans yet. Analyze a product to start your history.</p>
            </div>
          )}
          {scans.map((scan) => (
            <div key={scan.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 flex items-center gap-1 mb-1.5">
                    <Clock size={10} />
                    {formatDate(scan.created_at)}
                  </p>
                  <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">
                    {scan.summary || 'No summary available'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1.5">
                    {scan.coverage_percent}% of label recognised
                  </p>
                </div>
                <div className={`flex-shrink-0 text-center px-3 py-1.5 rounded-xl font-black text-lg ${
                  scan.safety_score === null
                    ? 'bg-slate-100 text-slate-400'
                    : scan.safety_score >= 80
                      ? 'bg-emerald-100 text-emerald-700'
                      : scan.safety_score >= 50
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-rose-100 text-rose-700'
                }`}>
                  {scan.safety_score ?? 'N/A'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
