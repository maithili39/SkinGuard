'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, CheckCircle, AlertTriangle, XCircle, Scale, Lightbulb,
  Info, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react';
import type { AnalysisResult } from '../types';
import { depthColor } from '../types';
import { ScoreDisplay } from './ScoreDisplay';
import { AssessmentDepthBanner } from './AssessmentDepthBanner';
import { FindingCard } from './FindingCard';

interface Props {
  results: AnalysisResult;
  onReanalyze?: (newText: string) => void;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function IngredientRow({ ing, idx }: { ing: any; idx: number }) {
  const [explanation, setExplanation] = useState<string | null>(ing.explanation);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ing.explanation && ing.matched_name) {
      setLoading(true);
      fetch(`/api/explain/${encodeURIComponent(ing.matched_name)}?llm=true`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.explanation) {
            setExplanation(data.explanation);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setExplanation(ing.explanation);
    }
  }, [ing.explanation, ing.matched_name]);

  return (
    <div
      className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 flex items-start justify-between gap-2 card-hover animate-fade-in-up"
      style={{ animationDelay: `${idx * 40}ms` }}
    >
      <div className="pr-2 min-w-0 flex-1">
        <p className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-1.5">
          {ing.matched_name}
          {loading && <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-ping" />}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
          {explanation || ing.ingredient?.function || 'Skincare ingredient'}
        </p>
      </div>
      <div className="flex flex-col gap-1 flex-shrink-0 items-end">
        {ing.ingredient?.comedogenic && (
          <span className="bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap border border-amber-200/60 dark:border-amber-700/40">
            Pore-clogging
          </span>
        )}
        {ing.ingredient?.irritant === 'yes' && (
          <span className="bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap border border-rose-200/60 dark:border-rose-700/40">
            Irritant
          </span>
        )}
        {!ing.ingredient?.comedogenic && ing.ingredient?.irritant !== 'yes' && (
          <span className="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap border border-emerald-200/60 dark:border-emerald-700/40">
            Safe
          </span>
        )}
        <span className="text-[9px] text-slate-400 text-right mt-1">
          {ing.confidence}%
        </span>
      </div>
    </div>
  );
}


export function ResultsDashboard({ results, onReanalyze }: Props) {
  const [showAllIngredients, setShowAllIngredients] = useState(false);

  const handleAcceptSuggestion = (rawToken: string, bestCandidate: string) => {
    if (!onReanalyze) return;
    let updatedText = results.original_text;
    const regex = new RegExp(escapeRegExp(rawToken), 'i');
    if (regex.test(updatedText)) {
      updatedText = updatedText.replace(regex, bestCandidate);
    } else {
      updatedText = `${updatedText}, ${bestCandidate}`;
    }
    onReanalyze(updatedText);
  };

  if (results.matched_count === 0) {
    return (
      <div className="w-full max-w-2xl mt-12 animate-fade-in-up">
        <div className="glass-panel rounded-3xl p-8 border border-amber-250/45 dark:border-amber-800/40 bg-gradient-to-br from-amber-50/15 via-transparent to-transparent shadow-glass text-center space-y-6">
          <div className="flex justify-center">
            <div className="p-4 bg-amber-50/80 dark:bg-amber-950/35 rounded-full">
              <AlertTriangle size={36} className="text-amber-500 animate-pulse" />
            </div>
          </div>
          
          <div className="space-y-2 max-w-md mx-auto">
            <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg">
              No Ingredients Recognized
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              We couldn&apos;t identify any standard cosmetic ingredients in the text you provided. Let&apos;s make sure the input is correct.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-800/60 rounded-2xl p-5 text-left space-y-3 max-w-md mx-auto">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Tips for a successful analysis:</p>
            <ul className="text-xs text-slate-500 dark:text-slate-450 space-y-2 list-disc list-inside">
              <li>
                <strong className="text-slate-700 dark:text-slate-200">Check the text:</strong> Make sure you are pasting a standard INCI ingredients list (e.g., starting with <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-rose-500 font-semibold font-mono">Aqua / Water</code>, <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-rose-500 font-semibold font-mono">Glycerin</code>, etc.).
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-200">Improve photo quality:</strong> If uploading a photo, ensure it is in focus, well-lit, and cropped closely to the ingredients block.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-205 dark:text-slate-200">Avoid description text:</strong> Do not paste full marketing claims, usage directions, or general product copy.
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const dangerFindings  = results.findings.filter((f) => f.level === 'danger');
  const warningFindings = results.findings.filter((f) => f.level === 'warning');
  const goodFindings    = results.findings.filter((f) => f.level === 'good');
  const allFindings     = [...dangerFindings, ...warningFindings, ...goodFindings];

  const ingredientsToShow = showAllIngredients
    ? results.found_ingredients
    : results.found_ingredients?.slice(0, 6);

  return (
    <div className="w-full max-w-4xl mt-12 animate-fade-in-up">
      {/* ── Header card ─────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 shadow-glass border border-white/50 dark:border-white/10 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-gradient-to-br from-primary-500 to-emerald-500 p-2 rounded-xl shadow-lg shadow-primary-500/30">
                <ShieldCheck size={20} className="text-white" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
                Analysis Results
              </h2>
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm max-w-lg">
              {results.summary}
            </p>
            {/* Coverage pill */}
            <span className={`inline-block mt-3 text-xs font-semibold px-3 py-1 rounded-full ${
              results.coverage_percent >= 80
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                : results.coverage_percent >= 50
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                  : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
            }`}>
              {results.coverage_percent}% of label recognised
            </span>
          </div>
          {/* Score ring */}
          <div className="flex-shrink-0">
            <ScoreDisplay score={results.safety_score} basis={results.score_basis} />
          </div>
        </div>
      </div>

      {/* ── Assessment depth ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <AssessmentDepthBanner
          assessedCount={results.assessed_count}
          matchedCount={results.matched_count}
          depthPct={results.assessment_depth_percent}
        />
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          {
            label: 'Ingredients Found',
            value: results.found_ingredients?.length ?? 0,
            icon: <CheckCircle size={18} className="text-emerald-500" />,
            bg: 'from-emerald-50 to-transparent dark:from-emerald-950/30',
            border: 'border-emerald-200/60 dark:border-emerald-800/40',
          },
          {
            label: 'Pore-clogging',
            value: results.comedogenic_alerts?.length ?? 0,
            icon: <AlertTriangle size={18} className="text-amber-500" />,
            bg: 'from-amber-50 to-transparent dark:from-amber-950/30',
            border: 'border-amber-200/60 dark:border-amber-800/40',
          },
          {
            label: 'Irritants',
            value: results.irritant_alerts?.length ?? 0,
            icon: <XCircle size={18} className="text-rose-500" />,
            bg: 'from-rose-50 to-transparent dark:from-rose-950/30',
            border: 'border-rose-200/60 dark:border-rose-800/40',
          },
        ].map(({ label, value, icon, bg, border }) => (
          <div key={label} className={`rounded-2xl border ${border} bg-gradient-to-br ${bg} p-4 flex flex-col items-center gap-1 text-center`}>
            {icon}
            <span className="text-2xl font-black text-slate-800 dark:text-slate-100">{value}</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-tight">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Pregnancy alert (if any) ─────────────────────────────────────────── */}
      {results.pregnancy_alerts?.length > 0 && (
        <div className="mb-6 rounded-2xl bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-950/40 border border-rose-200/80 dark:border-rose-800/50 p-5 flex gap-3 animate-fade-in-up shadow-sm">
          <div className="p-2 bg-rose-100 dark:bg-rose-900/40 rounded-xl flex-shrink-0">
            <AlertTriangle size={18} className="text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <h4 className="font-bold text-rose-800 dark:text-rose-300 text-sm mb-1">Pregnancy Warning</h4>
            <p className="text-rose-700 dark:text-rose-400 text-xs leading-relaxed">
              Not recommended during pregnancy:{' '}
              <strong>{results.pregnancy_alerts.map((a) => a.matched_name).join(', ')}</strong>
            </p>
          </div>
        </div>
      )}

      {/* ── Main grid ────────────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Findings */}
        <div className="glass-panel rounded-3xl p-5 shadow-glass border border-white/50 dark:border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary-500 inline-block" />
              Findings ({results.findings.length})
            </h3>
            <div className="flex gap-1.5">
              {dangerFindings.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300">
                  {dangerFindings.length} danger
                </span>
              )}
              {warningFindings.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                  {warningFindings.length} warning
                </span>
              )}
            </div>
          </div>

          {results.findings.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50 to-transparent dark:from-emerald-950/30 p-5 flex items-center gap-3">
              <CheckCircle size={20} className="text-emerald-500 flex-shrink-0" />
              <div>
                <p className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">No concerns flagged</p>
                <p className="text-emerald-600 dark:text-emerald-500 text-xs mt-0.5">
                  No issues found for your skin profile.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scroll pr-1">
              {allFindings.map((f, i) => (
                <FindingCard key={`f-${i}`} f={f} index={i} />
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
              <Scale size={9} />EU Regulation — legal fact
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/50">
              <Lightbulb size={9} />Expert Guidance — curated
            </span>
          </div>
        </div>

        {/* Right: Ingredients */}
        <div className="space-y-4">
          {/* Unmatched tokens */}
          {results.unmatched?.length > 0 && (
            <div className="rounded-2xl border border-amber-200/80 dark:border-amber-800/50 bg-gradient-to-br from-amber-50 to-transparent dark:from-amber-950/30 p-4 animate-fade-in-up">
              <h4 className="text-amber-800 dark:text-amber-300 font-bold mb-1.5 flex items-center gap-2 text-sm">
                <AlertTriangle size={14} />
                Couldn&apos;t identify ({results.unmatched.length})
              </h4>
              <p className="text-amber-700 dark:text-amber-400 text-xs mb-3">
                Not in database — possibly OCR errors or rare ingredients.
              </p>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {results.unmatched.map((u, idx) => (
                    <span key={idx} className="bg-white dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800/50">
                      {u.raw}
                    </span>
                  ))}
                </div>
                {onReanalyze && results.unmatched.some(u => u.best_candidate && u.best_confidence >= 50) && (
                  <div className="mt-1 pt-2.5 border-t border-amber-200/40 dark:border-amber-800/30">
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 font-bold mb-1.5 flex items-center gap-1">
                      Suggestions:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {results.unmatched
                        .filter(u => u.best_candidate && u.best_confidence >= 50)
                        .map((u, idx) => (
                          <button
                            key={`sug-${idx}`}
                            onClick={() => handleAcceptSuggestion(u.raw, u.best_candidate!)}
                            className="inline-flex items-center gap-1.5 bg-white hover:bg-amber-50 dark:bg-amber-900/25 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-[11px] px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800/60 transition-all font-semibold shadow-sm cursor-pointer hover:scale-[1.02]"
                          >
                            <span>Did you mean <strong className="text-amber-900 dark:text-amber-200">{u.best_candidate}</strong>?</span>
                            <span className="text-[9px] opacity-75 font-normal">({u.best_confidence}%)</span>
                            <span className="ml-0.5 bg-amber-500 dark:bg-amber-600 text-white text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Accept</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ingredient cards */}
          <div className="glass-panel rounded-3xl p-5 shadow-glass border border-white/50 dark:border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Sparkles size={14} className="text-primary-500" />
                Analysed Ingredients
              </h4>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${depthColor(results.assessment_depth_percent)}`}>
                {results.assessed_count} assessed
              </span>
            </div>

            <div className="space-y-2">
              {ingredientsToShow?.map((ing, idx) => (
                <IngredientRow key={idx} ing={ing} idx={idx} />
              ))}
            </div>

            {/* Show more / less toggle */}
            {(results.found_ingredients?.length ?? 0) > 6 && (
              <button
                onClick={() => setShowAllIngredients(!showAllIngredients)}
                className="mt-4 w-full flex items-center justify-center gap-2 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 py-2 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
              >
                {showAllIngredients ? (
                  <><ChevronUp size={14} /> Show fewer</>
                ) : (
                  <><ChevronDown size={14} /> Show all {results.found_ingredients.length} ingredients</>
                )}
              </button>
            )}
          </div>

          {/* Extracted text (collapsible raw) */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 p-4">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Extracted Text
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-white dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700/50 h-16 overflow-y-auto custom-scroll leading-relaxed">
              {results.original_text || 'No text extracted'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Disclaimer ────────────────────────────────────────────────────────── */}
      <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 flex gap-2.5">
        <Info size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{results.disclaimer}</p>
      </div>
    </div>
  );
}

export function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="glass-panel rounded-3xl p-6 shadow-card border border-white/50 dark:border-white/10 flex flex-col items-center text-center card-hover group">
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-700 p-4 rounded-2xl mb-4 group-hover:scale-110 transition-transform duration-300 shadow-sm">
        {icon}
      </div>
      <h4 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-2">{title}</h4>
      <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}
