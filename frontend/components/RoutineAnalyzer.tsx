'use client';

import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle, Plus, Trash2, Loader2, Sparkles } from 'lucide-react';
import type { ScanSummary } from '../types';

interface Props {
  token?: string;
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

export function RoutineAnalyzer({ token, scans }: Props) {
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
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ products: validProducts })
      });

      if (!res.ok) {
        throw new Error(`Routine analysis failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="w-full max-w-4xl bg-white/80 dark:bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-200/60 dark:border-slate-800/60 p-6 shadow-xl animate-fade-in-up mt-8">
      <div className="flex items-center gap-3 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl text-emerald-600 dark:text-emerald-400">
          <Sparkles size={20} />
        </div>
        <div>
          <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg">Routine Compatibility Analyzer</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Layering safety check for active skincare ingredients</p>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        {products.map((p, idx) => (
          <div key={idx} className="p-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-2xl border border-slate-150 dark:border-slate-800/40 space-y-3 relative">
            <div className="flex items-center justify-between gap-3">
              <input
                type="text"
                value={p.name}
                onChange={(e) => handleProductChange(idx, 'name', e.target.value)}
                placeholder={`Product ${idx + 1} Name`}
                className="font-extrabold text-sm text-slate-700 dark:text-slate-200 bg-transparent border-b border-dashed border-slate-350 dark:border-slate-700 focus:border-primary-500 outline-none pb-0.5"
              />
              
              <div className="flex items-center gap-2">
                {scans.length > 0 && (
                  <select
                    onChange={(e) => handleSelectFromHistory(idx, e.target.value)}
                    defaultValue=""
                    className="text-xs border border-slate-300 dark:border-slate-800 rounded-lg px-2 py-1 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 outline-none"
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
                    className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 p-1.5 rounded-lg transition"
                    title="Remove product"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>

            <textarea
              value={p.text}
              onChange={(e) => handleProductChange(idx, 'text', e.target.value)}
              placeholder="Paste product ingredients list here..."
              rows={2}
              className="w-full border border-slate-250 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-600 dark:text-slate-300 focus:border-primary-400 focus:ring-1 focus:ring-primary-100 outline-none bg-white dark:bg-slate-900 resize-none"
            />
          </div>
        ))}

        <div className="flex gap-3">
          <button
            onClick={handleAddProduct}
            className="flex items-center gap-1.5 border border-dashed border-slate-350 dark:border-slate-700 hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 text-xs font-bold text-slate-500 rounded-xl px-4 py-2.5 transition"
          >
            <Plus size={14} /> Add Product to Routine
          </button>
          
          <button
            onClick={handleAnalyzeRoutine}
            disabled={analyzing}
            className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-bold text-sm rounded-xl py-2.5 transition shadow-lg shadow-primary-500/20 flex items-center justify-center gap-2"
          >
            {analyzing ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
            {analyzing ? 'Checking Layering safety...' : 'Analyze Layering Safety'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 mb-6">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="border-t border-slate-100 dark:border-slate-800 pt-6 space-y-6">
          {/* Compatibility Banner */}
          <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
            result.compatible 
              ? 'bg-emerald-50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/10 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
          }`}>
            {result.compatible ? <CheckCircle size={20} className="mt-0.5 shrink-0" /> : <AlertTriangle size={20} className="mt-0.5 shrink-0" />}
            <div>
              <h4 className="font-extrabold text-sm">{result.compatible ? 'Compatible Layering' : 'Layering Alert'}</h4>
              <p className="text-xs leading-relaxed mt-0.5">{result.summary}</p>
            </div>
          </div>

          {/* Active Ingredients breakdown */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">Actives Detected per Product</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(result.product_actives).map(([name, actives]) => (
                <div key={name} className="p-3.5 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/20">
                  <h5 className="font-extrabold text-slate-800 dark:text-slate-200 text-xs">{name}</h5>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Object.keys(actives).length === 0 ? (
                      <span className="text-[10px] text-slate-400 italic">No warnings-related active layering ingredients.</span>
                    ) : (
                      Object.entries(actives).map(([cat, inci]) => (
                        <span key={cat} className="px-2 py-0.5 bg-primary-50 dark:bg-primary-950/40 border border-primary-100 dark:border-primary-900 text-[10px] font-bold text-primary-700 dark:text-primary-400 rounded-md">
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
            <div className="space-y-3">
              <h4 className="font-extrabold text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">Layering Conflict Details</h4>
              <div className="space-y-3">
                {result.conflicts.map((c, idx) => (
                  <div key={idx} className={`p-4 rounded-xl border flex gap-3 items-start ${
                    c.severity === 'danger'
                      ? 'border-rose-100 dark:border-rose-950/40 bg-rose-50/20 dark:bg-rose-950/5'
                      : 'border-amber-100 dark:border-amber-950/40 bg-amber-50/20 dark:bg-amber-950/5'
                  }`}>
                    <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${c.severity === 'danger' ? 'text-rose-500' : 'text-amber-500'}`} />
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                          {c.product_a}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">and</span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                          {c.product_b}
                        </span>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ml-1.5 ${
                          c.severity === 'danger' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}>
                          {c.conflict_type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-2">{c.message}</p>
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
