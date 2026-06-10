'use client';

import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle, Plus, Trash2, Loader2, Sparkles } from 'lucide-react';
import type { ScanSummary } from '../types';

interface Props {
  scans: ScanSummary[];
}

interface RoutineProduct {
  name: string;
  text: string;
}

interface Conflict {
  product_a: string;
  product_b: string;
  ingredient_a: string;
  ingredient_b: string;
  conflict_type: string;
  severity: 'danger' | 'warning';
  message: string;
}

interface RoutineAnalysisResult {
  compatible: boolean;
  summary: string;
  product_actives: Record<string, Record<string, string>>;
  conflicts: Conflict[];
}

export function RoutineAnalyzer({ scans }: Props) {
  const [products, setProducts] = useState<RoutineProduct[]>([
    { name: 'Product 1', text: '' },
    { name: 'Product 2', text: '' }
  ]);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<RoutineAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAddProduct = () => {
    setProducts([...products, { name: `Product ${products.length + 1}`, text: '' }]);
  };

  const handleRemoveProduct = (index: number) => {
    const next = [...products];
    next.splice(index, 1);
    setProducts(next);
  };

  const handleProductChange = (index: number, field: keyof RoutineProduct, value: string) => {
    const next = [...products];
    next[index] = { ...next[index], [field]: value };
    setProducts(next);
  };

  const handleSelectFromHistory = (index: number, scanId: string) => {
    const scan = scans.find(s => String(s.id) === scanId);
    if (scan && scan.input_text) {
      const next = [...products];
      next[index] = {
        name: scan.summary ? scan.summary.split(' ')[0] + ' Product' : `Product from Scan`,
        text: scan.input_text
      };
      setProducts(next);
    }
  };

  const handleAnalyzeRoutine = async () => {
    const validProducts = products.filter(p => p.name.trim() && p.text.trim());
    if (validProducts.length < 2) {
      setError('Please add at least 2 products with ingredients to analyze.');
      return;
    }
    setError(null);
    setAnalyzing(true);
    setResult(null);

    try {
      const res = await fetch('/api/analyze/routine', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ products: validProducts })
      });

      if (!res.ok) {
        throw new Error(`Routine analysis failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Routine analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

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

      <div className="space-y-2 mb-8">
        {products.map((p, idx) => (
          <div 
            key={idx} 
            className="py-6 space-y-4 relative"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
              <input
                type="text"
                value={p.name}
                onChange={(e) => handleProductChange(idx, 'name', e.target.value)}
                placeholder={`Product ${idx + 1} Name`}
                style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: '1.25rem' }}
                className="text-[#1a1a1a] bg-transparent outline-none pb-1 transition-colors"
              />
              
              <div className="flex items-center gap-2">
                {scans.length > 0 && (
                  <select
                    onChange={(e) => handleSelectFromHistory(idx, e.target.value)}
                    defaultValue=""
                    className="text-xs border border-[#e8e4dc] rounded-lg px-3 py-2 bg-white text-[#6b6b6b] outline-none font-medium focus:border-[#4caf50] focus:ring-1 focus:ring-[#4caf50] transition"
                  >
                    <option value="" disabled>Load from history...</option>
                    {scans.map(s => (
                      <option key={s.id} value={s.id}>
                        Scan {s.created_at ? new Date(s.created_at).toLocaleDateString() : ''}
                      </option>
                    ))}
                  </select>
                )}

                {products.length > 2 && (
                  <button
                    onClick={() => handleRemoveProduct(idx)}
                    className="text-[#e53935] bg-white border border-[#e8e4dc] hover:bg-[#fdeaea] p-2 rounded-lg transition"
                    title="Remove product"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            <textarea
              value={p.text}
              onChange={(e) => handleProductChange(idx, 'text', e.target.value)}
              placeholder="Paste product ingredients list here (comma-separated)..."
              rows={2}
              className="w-full border border-[#e8e4dc] rounded-xl p-4 text-sm text-[#1a1a1a] focus:border-[#4caf50] focus:ring-1 focus:ring-[#4caf50] outline-none bg-[#faf9f6] focus:bg-white resize-none font-medium transition"
              style={{ fontFamily: "'Inter', sans-serif" }}
            />
          </div>
        ))}

        <div className="flex gap-3 flex-wrap sm:flex-nowrap pt-2 justify-end">
          <button
            onClick={handleAddProduct}
            className="flex items-center justify-center border border-[#e8e4dc] bg-white hover:bg-[#faf9f6] text-xs font-semibold text-[#1a1a1a] rounded-full px-4 py-2 transition shadow-sm"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            Add Product
          </button>
          
          <button
            onClick={handleAnalyzeRoutine}
            disabled={analyzing}
            className="bg-[#4caf50] hover:bg-[#43a047] disabled:opacity-60 text-white font-semibold text-xs rounded-full px-5 py-2 transition shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            {analyzing ? <Loader2 className="animate-spin" size={18} /> : null}
            {analyzing ? 'Checking Layering Safety...' : 'Analyze Layering Safety'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-[#fdeaea] border border-[#e53935] rounded-xl text-[#c62828] text-sm flex items-center gap-3 mb-8">
          <AlertTriangle size={18} />
          <span style={{ fontFamily: "'Inter', sans-serif" }}>{error}</span>
        </div>
      )}

      {result && (
        <div className="border-t border-[#e8e4dc] pt-8 space-y-8 mt-8">
          {/* Compatibility Banner */}
          <div 
            className={`p-6 flex items-start gap-4 ${
              result.compatible 
                ? 'bg-[#e8f5e9] text-[#2e7d32] border border-[#a5d6a7]'
                : 'bg-[#fdeaea] text-[#c62828] border border-[#ef9a9a]'
            }`}
            style={{ borderRadius: 16 }}
          >
            {result.compatible ? <CheckCircle size={24} className="mt-0.5 shrink-0" /> : <AlertTriangle size={24} className="mt-0.5 shrink-0" />}
            <div>
              <h4 className="font-bold text-lg" style={{ fontFamily: "'Nunito', sans-serif" }}>{result.compatible ? 'Compatible Layering' : 'Layering Alert'}</h4>
              <p className="text-sm leading-relaxed mt-1" style={{ fontFamily: "'Inter', sans-serif" }}>{result.summary}</p>
            </div>
          </div>

          {/* Active Ingredients breakdown */}
          <div className="space-y-4">
            <h4 className="font-bold text-[#1a1a1a] text-sm tracking-wide uppercase" style={{ fontFamily: "'Outfit', sans-serif" }}>Actives Detected per Product</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(result.product_actives).map(([name, actives]) => (
                <div 
                  key={name} 
                  className="p-5 bg-white border border-[#e8e4dc]"
                  style={{ borderRadius: 16 }}
                >
                  <h5 className="font-bold text-[#1a1a1a] text-sm mb-3" style={{ fontFamily: "'Nunito', sans-serif" }}>{name}</h5>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(actives).length === 0 ? (
                      <span className="text-xs text-[#9e9e9e] italic" style={{ fontFamily: "'Inter', sans-serif" }}>No warnings-related active layering ingredients.</span>
                    ) : (
                      Object.entries(actives).map(([cat, inci]) => (
                        <span key={cat} className="px-2.5 py-1 bg-[#e8f5e9] border border-[#c8e6c9] text-xs font-semibold text-[#2e7d32] rounded-lg" style={{ fontFamily: "'Inter', sans-serif" }}>
                          {cat} ({inci})
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Conflicts list */}
          {result.conflicts.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-bold text-[#1a1a1a] text-sm tracking-wide uppercase" style={{ fontFamily: "'Outfit', sans-serif" }}>Layering Conflict Details</h4>
              <div className="space-y-3">
                {result.conflicts.map((c, idx) => (
                  <div 
                    key={idx} 
                    className={`p-5 flex gap-4 items-start ${
                      c.severity === 'danger'
                        ? 'bg-[#fdeaea] border border-[#ef9a9a]'
                        : 'bg-[#fff3e0] border border-[#ffcc80]'
                    }`}
                    style={{ borderRadius: 16 }}
                  >
                    <AlertTriangle size={20} className={`mt-0.5 shrink-0 ${c.severity === 'danger' ? 'text-[#c62828]' : 'text-[#ef6c00]'}`} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-sm font-bold text-[#1a1a1a]" style={{ fontFamily: "'Nunito', sans-serif" }}>
                          {c.product_a}
                        </span>
                        <span className="text-xs font-medium text-[#9e9e9e]">and</span>
                        <span className="text-sm font-bold text-[#1a1a1a]" style={{ fontFamily: "'Nunito', sans-serif" }}>
                          {c.product_b}
                        </span>
                        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md ml-2 border ${
                          c.severity === 'danger' ? 'bg-[#ffcdd2] text-[#c62828] border-[#ef9a9a]' : 'bg-[#ffe0b2] text-[#ef6c00] border-[#ffcc80]'
                        }`} style={{ fontFamily: "'Outfit', sans-serif" }}>
                          {c.conflict_type}
                        </span>
                      </div>
                      <p className="text-sm text-[#424242] leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>{c.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
