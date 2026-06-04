'use client';

import React, { useState, useEffect } from 'react';
import { Scale, AlertTriangle, CheckCircle, HelpCircle, Loader2 } from 'lucide-react';
import type { ScanSummary, AnalysisResult, Finding } from '../types';
import { scoreColor } from '../types';

interface Props {
  token?: string;
  currentAnalysis: AnalysisResult | null;
  scans: ScanSummary[];
}

export function ComparePanel({ token, currentAnalysis, scans }: Props) {
  const [prodA, setProdA] = useState<string>('current');
  const [prodB, setProdB] = useState<string>('');
  
  const [resultA, setResultA] = useState<AnalysisResult | null>(null);
  const [resultB, setResultB] = useState<AnalysisResult | null>(null);
  
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  // Set default Product B if history exists
  useEffect(() => {
    if (scans.length > 0 && !prodB) {
      setProdB(String(scans[0].id));
    }
  }, [scans, prodB]);

  // Load Product A
  useEffect(() => {
    if (prodA === 'current') {
      setResultA(currentAnalysis);
    } else {
      const scan = scans.find(s => String(s.id) === prodA);
      if (scan && scan.input_text) {
        loadProduct(scan.input_text, setResultA, setLoadingA);
      }
    }
  }, [prodA, currentAnalysis, scans]);

  // Load Product B
  useEffect(() => {
    const scan = scans.find(s => String(s.id) === prodB);
    if (scan && scan.input_text) {
      loadProduct(scan.input_text, setResultB, setLoadingB);
    } else {
      setResultB(null);
    }
  }, [prodB, scans]);

  const loadProduct = async (
    text: string,
    setResult: React.Dispatch<React.SetStateAction<AnalysisResult | null>>,
    setLoading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          text,
          profile: {
            pregnant: false,
            sensitive_skin: false,
            acne_prone: false,
            fungal_acne: false,
            rosacea: false
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Helper to extract product name/summary from a result
  const getProdName = (res: AnalysisResult | null, fallback: string) => {
    if (!res) return fallback;
    const match = res.summary.match(/^Generally suitable for|Use with caution|Not recommended/);
    if (res.original_text.length < 30) return res.original_text;
    return fallback;
  };

  // Compute stats
  const getOverlapStats = () => {
    if (!resultA || !resultB) return null;

    const listA = resultA.matched.map(m => m.ingredient.toLowerCase());
    const listB = resultB.matched.map(m => m.ingredient.toLowerCase());
    const setA = new Set(listA);
    const setB = new Set(listB);

    const intersection = new Set(listA.filter(x => setB.has(x)));
    const union = new Set(listA.concat(listB));

    const overlapPct = union.size > 0 ? Math.round((intersection.size / union.size) * 100) : 0;

    // Findings overlap
    const findingsA = resultA.findings.filter(f => f.level === 'danger' || f.level === 'warning');
    const findingsB = resultB.findings.filter(f => f.level === 'danger' || f.level === 'warning');

    const namesA = new Set(findingsA.map(f => f.ingredient.toLowerCase()));
    const namesB = new Set(findingsB.map(f => f.ingredient.toLowerCase()));

    const commonFindings = findingsA.filter(f => namesB.has(f.ingredient.toLowerCase()));
    const uniqueA = findingsA.filter(f => !namesB.has(f.ingredient.toLowerCase()));
    const uniqueB = findingsB.filter(f => !namesA.has(f.ingredient.toLowerCase()));

    return {
      overlapPct,
      commonFindings,
      uniqueA,
      uniqueB,
      totalA: setA.size,
      totalB: setB.size,
      commonCount: intersection.size
    };
  };

  const stats = getOverlapStats();

  return (
    <div className="w-full max-w-4xl bg-white/80 dark:bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-200/60 dark:border-slate-800/60 p-6 shadow-xl animate-fade-in-up mt-8">
      <div className="flex items-center gap-3 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400">
          <Scale size={20} />
        </div>
        <div>
          <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg">Compare Products</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Side-by-side analysis and ingredient overlap</p>
        </div>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Product A</label>
          <select
            value={prodA}
            onChange={(e) => setProdA(e.target.value)}
            className="w-full border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 outline-none"
          >
            <option value="current">{currentAnalysis ? 'Current Analysis' : 'Select Product A'}</option>
            {scans.map(s => (
              <option key={s.id} value={s.id}>
                Scan from {s.created_at ? new Date(s.created_at).toLocaleDateString() : 'Unknown'} (Score: {s.safety_score ?? 'N/A'})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Product B</label>
          <select
            value={prodB}
            onChange={(e) => setProdB(e.target.value)}
            className="w-full border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 outline-none"
          >
            <option value="">Select a Product from History...</option>
            {scans.map(s => (
              <option key={s.id} value={s.id}>
                Scan from {s.created_at ? new Date(s.created_at).toLocaleDateString() : 'Unknown'} (Score: {s.safety_score ?? 'N/A'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadingA || loadingB ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Loader2 className="animate-spin mb-2" size={32} />
          <p className="text-sm font-medium">Fetching analysis results...</p>
        </div>
      ) : resultA && resultB ? (
        <div className="space-y-6">
          {/* Main comparison header */}
          <div className="grid grid-cols-3 gap-4 items-center bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80">
            {/* Column A */}
            <div className="text-center">
              <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm truncate">Product A</h4>
              <div className={`inline-block mt-2 px-3 py-1.5 rounded-full text-xs font-black text-white bg-gradient-to-tr ${scoreColor(resultA.safety_score)}`}>
                Score: {resultA.safety_score !== null ? `${resultA.safety_score}/100` : 'Withheld'}
              </div>
            </div>
            {/* Overlap */}
            <div className="text-center border-x border-slate-200 dark:border-slate-800 px-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Overlap</span>
              <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{stats?.overlapPct}%</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                {stats?.commonCount} common ingredients
              </span>
            </div>
            {/* Column B */}
            <div className="text-center">
              <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm truncate">Product B</h4>
              <div className={`inline-block mt-2 px-3 py-1.5 rounded-full text-xs font-black text-white bg-gradient-to-tr ${scoreColor(resultB.safety_score)}`}>
                Score: {resultB.safety_score !== null ? `${resultB.safety_score}/100` : 'Withheld'}
              </div>
            </div>
          </div>

          {/* Details side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Product A Findings */}
            <div className="space-y-3">
              <h5 className="font-bold text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">Product A Warnings</h5>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {resultA.findings.filter(f => f.level === 'danger' || f.level === 'warning').length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No warnings flagged.</p>
                ) : (
                  resultA.findings.filter(f => f.level === 'danger' || f.level === 'warning').map((f, i) => (
                    <div key={i} className="p-2.5 rounded-xl border border-rose-100 dark:border-rose-950/40 bg-rose-50/30 dark:bg-rose-950/10 flex items-start gap-2">
                      <AlertTriangle size={14} className="text-rose-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{f.ingredient}</p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight mt-0.5">{f.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Product B Findings */}
            <div className="space-y-3">
              <h5 className="font-bold text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">Product B Warnings</h5>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {resultB.findings.filter(f => f.level === 'danger' || f.level === 'warning').length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No warnings flagged.</p>
                ) : (
                  resultB.findings.filter(f => f.level === 'danger' || f.level === 'warning').map((f, i) => (
                    <div key={i} className="p-2.5 rounded-xl border border-rose-100 dark:border-rose-950/40 bg-rose-50/30 dark:bg-rose-950/10 flex items-start gap-2">
                      <AlertTriangle size={14} className="text-rose-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{f.ingredient}</p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight mt-0.5">{f.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Finding Overlaps Breakdown */}
          {stats && (stats.commonFindings.length > 0 || stats.uniqueA.length > 0 || stats.uniqueB.length > 0) && (
            <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-4">
              <h5 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Warning Overlaps</h5>

              {/* Shared warnings */}
              {stats.commonFindings.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">Flagged in Both Products</span>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.commonFindings.map((f, i) => (
                      <span key={i} className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 rounded-full">
                        ⚠️ {f.ingredient}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Unique to A */}
              {stats.uniqueA.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Flagged Only in Product A</span>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.uniqueA.map((f, i) => (
                      <span key={i} className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800/50 text-[11px] font-medium text-slate-700 dark:text-slate-300 rounded-full">
                        {f.ingredient}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Unique to B */}
              {stats.uniqueB.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Flagged Only in Product B</span>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.uniqueB.map((f, i) => (
                      <span key={i} className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800/50 text-[11px] font-medium text-slate-700 dark:text-slate-300 rounded-full">
                        {f.ingredient}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400">
          <HelpCircle className="mx-auto mb-2 opacity-60" size={36} />
          <p className="text-sm">Please select two products to display their comparison dashboard.</p>
        </div>
      )}
    </div>
  );
}
