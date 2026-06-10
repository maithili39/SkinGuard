'use client';

import React, { useState, useEffect } from 'react';
import { Scale, AlertTriangle, HelpCircle, Loader2 } from 'lucide-react';
import type { ScanSummary, AnalysisResult } from '../types';
import { scoreColor } from '../types';

interface Props {
  currentAnalysis: AnalysisResult | null;
  scans: ScanSummary[];
}

export function ComparePanel({ currentAnalysis, scans }: Props) {
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
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
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
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setLoading(false);
    }
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
    <div 
      className="w-full p-8"
      style={{ 
        background: 'white', 
        borderRadius: 24,
        border: '1px solid #e8e4dc',
        boxShadow: '0 12px 40px rgba(0,0,0,0.06)'
      }}
    >

      {/* Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <label className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider block mb-2" style={{ fontFamily: "'Nunito', sans-serif" }}>Product A</label>
          <select
            value={prodA}
            onChange={(e) => setProdA(e.target.value)}
            className="w-full border border-[#e8e4dc] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] bg-[#faf9f6] outline-none focus:border-[#4caf50] focus:ring-1 focus:ring-[#4caf50] transition"
            style={{ fontFamily: "'Inter', sans-serif" }}
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
          <label className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider block mb-2" style={{ fontFamily: "'Nunito', sans-serif" }}>Product B</label>
          <select
            value={prodB}
            onChange={(e) => setProdB(e.target.value)}
            className="w-full border border-[#e8e4dc] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] bg-[#faf9f6] outline-none focus:border-[#4caf50] focus:ring-1 focus:ring-[#4caf50] transition"
            style={{ fontFamily: "'Inter', sans-serif" }}
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
        <div className="flex flex-col items-center justify-center py-16 text-[#6b6b6b]">
          <Loader2 className="animate-spin mb-3 text-[#4caf50]" size={32} />
          <p className="text-sm font-medium" style={{ fontFamily: "'Inter', sans-serif" }}>Fetching analysis results...</p>
        </div>
      ) : resultA && resultB ? (
        <div className="space-y-8">
          {/* Main comparison header */}
          <div className="grid grid-cols-3 gap-4 items-center bg-[#faf9f6] p-6 rounded-2xl border border-[#e8e4dc]">
            {/* Column A */}
            <div className="text-center">
              <h4 className="font-bold text-[#1a1a1a] text-base truncate" style={{ fontFamily: "'Nunito', sans-serif" }}>Product A</h4>
              <div className={`inline-block mt-2 px-4 py-1.5 rounded-full text-xs font-bold text-white bg-gradient-to-tr ${scoreColor(resultA.safety_score)}`}>
                Score: {resultA.safety_score !== null ? `${resultA.safety_score}/100` : 'Withheld'}
              </div>
            </div>
            {/* Overlap */}
            <div className="text-center border-x border-[#d4c9b8] px-2">
              <span className="text-[10px] font-bold text-[#6b6b6b] uppercase tracking-widest block" style={{ fontFamily: "'Inter', sans-serif" }}>Overlap</span>
              <span className="text-3xl font-bold text-[#4caf50] mt-1 block" style={{ fontFamily: "'Playfair Display', serif" }}>{stats?.overlapPct}%</span>
              <span className="text-xs text-[#6b6b6b] block mt-1" style={{ fontFamily: "'Inter', sans-serif" }}>
                {stats?.commonCount} common ingredients
              </span>
            </div>
            {/* Column B */}
            <div className="text-center">
              <h4 className="font-bold text-[#1a1a1a] text-base truncate" style={{ fontFamily: "'Nunito', sans-serif" }}>Product B</h4>
              <div className={`inline-block mt-2 px-4 py-1.5 rounded-full text-xs font-bold text-white bg-gradient-to-tr ${scoreColor(resultB.safety_score)}`}>
                Score: {resultB.safety_score !== null ? `${resultB.safety_score}/100` : 'Withheld'}
              </div>
            </div>
          </div>

          {/* Details side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Product A Findings */}
            <div className="space-y-4">
              <h5 className="font-bold text-[#1a1a1a] text-xs uppercase tracking-wider" style={{ fontFamily: "'Nunito', sans-serif" }}>Product A Warnings</h5>
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {resultA.findings.filter(f => f.level === 'danger' || f.level === 'warning').length === 0 ? (
                  <p className="text-sm text-[#9e9e9e] italic" style={{ fontFamily: "'Inter', sans-serif" }}>No warnings flagged.</p>
                ) : (
                  resultA.findings.filter(f => f.level === 'danger' || f.level === 'warning').map((f, i) => (
                    <div key={i} className="p-3.5 rounded-xl border border-[#ef9a9a] bg-[#fdeaea] flex items-start gap-3">
                      <AlertTriangle size={16} className="text-[#c62828] mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-[#1a1a1a]" style={{ fontFamily: "'Nunito', sans-serif" }}>{f.ingredient}</p>
                        <p className="text-xs text-[#424242] leading-relaxed mt-1" style={{ fontFamily: "'Inter', sans-serif" }}>{f.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Product B Findings */}
            <div className="space-y-4">
              <h5 className="font-bold text-[#1a1a1a] text-xs uppercase tracking-wider" style={{ fontFamily: "'Nunito', sans-serif" }}>Product B Warnings</h5>
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {resultB.findings.filter(f => f.level === 'danger' || f.level === 'warning').length === 0 ? (
                  <p className="text-sm text-[#9e9e9e] italic" style={{ fontFamily: "'Inter', sans-serif" }}>No warnings flagged.</p>
                ) : (
                  resultB.findings.filter(f => f.level === 'danger' || f.level === 'warning').map((f, i) => (
                    <div key={i} className="p-3.5 rounded-xl border border-[#ef9a9a] bg-[#fdeaea] flex items-start gap-3">
                      <AlertTriangle size={16} className="text-[#c62828] mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-[#1a1a1a]" style={{ fontFamily: "'Nunito', sans-serif" }}>{f.ingredient}</p>
                        <p className="text-xs text-[#424242] leading-relaxed mt-1" style={{ fontFamily: "'Inter', sans-serif" }}>{f.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Finding Overlaps Breakdown */}
          {stats && (stats.commonFindings.length > 0 || stats.uniqueA.length > 0 || stats.uniqueB.length > 0) && (
            <div className="bg-[#faf9f6] p-6 rounded-2xl border border-[#e8e4dc] space-y-5 mt-4">
              <h5 className="font-bold text-[#1a1a1a] text-sm" style={{ fontFamily: "'Nunito', sans-serif" }}>Warning Overlaps</h5>

              {/* Shared warnings */}
              {stats.commonFindings.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-[#d84315] uppercase tracking-wider block" style={{ fontFamily: "'Inter', sans-serif" }}>Flagged in Both Products</span>
                  <div className="flex flex-wrap gap-2">
                    {stats.commonFindings.map((f, i) => (
                      <span key={i} className="px-3 py-1.5 bg-[#fbe9e7] border border-[#ffccbc] text-xs font-semibold text-[#bf360c] rounded-lg" style={{ fontFamily: "'Inter', sans-serif" }}>
                        {f.ingredient}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Unique to A */}
              {stats.uniqueA.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-[#6b6b6b] uppercase tracking-wider block" style={{ fontFamily: "'Inter', sans-serif" }}>Flagged Only in Product A</span>
                  <div className="flex flex-wrap gap-2">
                    {stats.uniqueA.map((f, i) => (
                      <span key={i} className="px-3 py-1.5 bg-white border border-[#e8e4dc] text-xs font-medium text-[#1a1a1a] rounded-lg" style={{ fontFamily: "'Inter', sans-serif" }}>
                        {f.ingredient}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Unique to B */}
              {stats.uniqueB.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-[#6b6b6b] uppercase tracking-wider block" style={{ fontFamily: "'Inter', sans-serif" }}>Flagged Only in Product B</span>
                  <div className="flex flex-wrap gap-2">
                    {stats.uniqueB.map((f, i) => (
                      <span key={i} className="px-3 py-1.5 bg-white border border-[#e8e4dc] text-xs font-medium text-[#1a1a1a] rounded-lg" style={{ fontFamily: "'Inter', sans-serif" }}>
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
        <div className="text-center py-12 border border-dashed border-[#d4c9b8] rounded-2xl text-[#9e9e9e] bg-[#faf9f6]">
          <HelpCircle className="mx-auto mb-3 opacity-60 text-[#d4c9b8]" size={40} />
          <p className="text-sm font-medium" style={{ fontFamily: "'Inter', sans-serif" }}>Please select two products to display their comparison dashboard.</p>
        </div>
      )}
    </div>
  );
}
