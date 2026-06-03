'use client';

import React from 'react';
import {
  ShieldCheck, CheckCircle, AlertTriangle, XCircle, Scale, Lightbulb, Info, Star,
} from 'lucide-react';
import type { AnalysisResult } from '../types';
import { scoreColor, depthColor } from '../types';
import { ScoreDisplay } from './ScoreDisplay';
import { AssessmentDepthBanner } from './AssessmentDepthBanner';
import { FindingCard } from './FindingCard';

interface Props {
  results: AnalysisResult;
}

export function ResultsDashboard({ results }: Props) {
  const dangerFindings = results.findings.filter((f) => f.level === 'danger');
  const warningFindings = results.findings.filter((f) => f.level === 'warning');
  const goodFindings = results.findings.filter((f) => f.level === 'good');

  return (
    <div className="w-full max-w-4xl mt-16 glass-panel rounded-3xl p-8 shadow-xl border border-white/60 animate-fade-in-up text-left">
      {/* Header row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
            <ShieldCheck className="text-primary-600" size={32} />
            Analysis Results
          </h2>
          <p className="text-slate-600 mt-2 leading-relaxed max-w-md">{results.summary}</p>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <ScoreDisplay score={results.safety_score} basis={results.score_basis} />
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            results.coverage_percent >= 80
              ? 'bg-emerald-100 text-emerald-700'
              : results.coverage_percent >= 50
                ? 'bg-amber-100 text-amber-700'
                : 'bg-rose-100 text-rose-700'
          }`}>
            {results.coverage_percent}% of label recognised
          </span>
        </div>
      </div>

      {/* Assessment depth banner */}
      <div className="mb-6">
        <AssessmentDepthBanner
          assessedCount={results.assessed_count}
          matchedCount={results.matched_count}
          depthPct={results.assessment_depth_percent}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Left: Findings */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
            Findings ({results.findings.length})
          </h3>
          {results.findings.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
              <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
              <p className="text-sm text-emerald-700">No concerns flagged for your profile.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {dangerFindings.map((f, i) => <FindingCard key={`d-${i}`} f={f} />)}
              {warningFindings.map((f, i) => <FindingCard key={`w-${i}`} f={f} />)}
              {goodFindings.map((f, i) => <FindingCard key={`g-${i}`} f={f} />)}
            </div>
          )}
          {/* Legend */}
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
              <Scale size={9} />EU Regulation — legal fact
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
              <Lightbulb size={9} />Expert Guidance — curated opinion
            </span>
          </div>
          {/* Stats */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Safety Profile</h4>
            <div className="space-y-3">
              {[
                ['Found Ingredients', results.found_ingredients?.length ?? 0, 'text-emerald-500', CheckCircle],
                ['Comedogenic Alerts', results.comedogenic_alerts?.length ?? 0, 'text-amber-500', AlertTriangle],
                ['Irritants Found', results.irritant_alerts?.length ?? 0, 'text-rose-500', XCircle],
              ].map(([label, count, color, Icon]: any) => (
                <div key={label} className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-b-0">
                  <span className="text-slate-700 flex items-center gap-2 text-sm">
                    <Icon size={15} className={color} />{label}
                  </span>
                  <span className="font-bold text-slate-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Pregnancy alert */}
          {results.pregnancy_alerts?.length > 0 && (
            <div className="bg-rose-50 p-5 rounded-2xl border border-rose-100 shadow-sm">
              <h4 className="text-rose-800 font-bold mb-2 flex items-center gap-2 text-sm">
                <AlertTriangle size={16} /> Pregnancy Warning
              </h4>
              <p className="text-rose-600 text-sm">
                Not recommended during pregnancy:{' '}
                {results.pregnancy_alerts.map((a) => a.matched_name).join(', ')}
              </p>
            </div>
          )}
        </div>

        {/* Right: Ingredients & Unmatched */}
        <div className="space-y-5">
          {/* Extracted text */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Extracted Text</h4>
            <p className="text-xs text-slate-500 font-mono bg-white p-3 rounded-lg border border-slate-200 h-20 overflow-y-auto">
              {results.original_text || 'No text extracted'}
            </p>
          </div>
          {/* Unmatched tokens */}
          {results.unmatched?.length > 0 && (
            <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100">
              <h4 className="text-amber-800 font-bold mb-1 flex items-center gap-2 text-sm">
                <AlertTriangle size={15} /> Couldn&apos;t identify ({results.unmatched.length})
              </h4>
              <p className="text-amber-700 text-xs mb-3">
                Not in our database — possibly OCR errors or rare ingredients.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {results.unmatched.map((u, idx) => (
                  <span key={idx} className="bg-white text-amber-800 text-xs px-2.5 py-1 rounded-full border border-amber-200">
                    {u.raw}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Ingredient cards */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Analysed Ingredients
              <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] ${depthColor(results.assessment_depth_percent)}`}>
                {results.assessed_count} assessed
              </span>
            </h4>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {results.found_ingredients?.map((ing, idx) => (
                <div key={idx} className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm flex items-start justify-between gap-2">
                  <div className="pr-2 min-w-0">
                    <p className="font-bold text-slate-800 text-sm">{ing.matched_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      {ing.explanation || ing.ingredient?.function || 'Skincare ingredient'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {ing.ingredient?.comedogenic && (
                      <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
                        Pore-clogging
                      </span>
                    )}
                    {ing.ingredient?.irritant === 'yes' && (
                      <span className="bg-rose-100 text-rose-700 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
                        Irritant
                      </span>
                    )}
                    {!ing.ingredient?.comedogenic && ing.ingredient?.irritant !== 'yes' && (
                      <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
                        Safe
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Disclaimer */}
      <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200 flex gap-2.5">
        <Info size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">{results.disclaimer}</p>
      </div>
    </div>
  );
}

export function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col items-center text-center transition-transform hover:-translate-y-1 hover:shadow-md">
      <div className="bg-slate-50 p-3 rounded-xl mb-4">{icon}</div>
      <h4 className="text-lg font-bold text-slate-800 mb-2">{title}</h4>
      <p className="text-slate-600 text-sm leading-relaxed">{description}</p>
    </div>
  );
}
