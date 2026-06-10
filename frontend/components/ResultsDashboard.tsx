'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle, AlertTriangle, XCircle, Lightbulb,
  ChevronDown, ExternalLink, Info, Shield
} from 'lucide-react';
import type { AnalysisResult, Finding } from '../types';

interface Props {
  results: AnalysisResult;
  onReanalyze?: (newText: string) => void;
}

const BENEFICIAL_MAP: Record<string, string> = {
  "niacinamide": "brightening, oil control and barrier repair",
  "hyaluronic acid": "deep multi-layer hydration",
  "glycerin": "gentle skin-identical humectant",
  "ceramide np": "barrier repair and reinforcement",
  "panthenol": "soothing, anti-inflammatory and hydrating",
  "centella asiatica extract": "calming botanical, redness and sensitivity",
  "azelaic acid": "acne, hyperpigmentation and rosacea",
  "zinc oxide": "broad-spectrum mineral UV and anti-inflammatory",
  "bakuchiol": "plant-based retinol alternative — pregnancy-friendly",
  "ascorbic acid": "Vitamin C — antioxidant and brightening",
  "squalane": "lightweight non-comedogenic emollient",
};

const CIRCUMFERENCE = 2 * Math.PI * 52;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function RiskDot({ level }: { level: string }) {
  const cls = level === 'danger' ? 'risk-dot risk-dot-bad' : level === 'warning' ? 'risk-dot risk-dot-moderate' : 'risk-dot risk-dot-good';
  return <div className={cls} />;
}

function IngredientRow({ ing, idx, finding, alertLevel }: { ing: any; idx: number; finding: Finding | undefined; alertLevel: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(ing.explanation);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && !explanation && ing.matched_name) {
      setLoading(true);
      fetch(`/api/explain/${encodeURIComponent(ing.matched_name)}?llm=true`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.explanation) setExplanation(d.explanation); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen, explanation, ing.matched_name]);

  const badgeClass = alertLevel === 'danger' ? 'risk-badge-bad' : alertLevel === 'warning' ? 'risk-badge-moderate' : 'risk-badge-good';
  const badgeLabel = alertLevel === 'danger' ? 'High risk' : alertLevel === 'warning' ? 'Moderate' : 'Low risk';

  let sourceLabel = 'Standard ingredient';
  if (finding) {
    if (finding.kind === 'regulatory') sourceLabel = 'EU Regulatory';
    else if (finding.source?.includes('curated')) sourceLabel = 'Curated data';
    else sourceLabel = 'Safety registry';
  } else if (BENEFICIAL_MAP[ing.matched_name?.toLowerCase()]) {
    sourceLabel = 'Active ingredient';
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border)', animationDelay: `${idx * 20}ms` }} className="animate-fade-up">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="ingredient-row"
        style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
      >
        <RiskDot level={alertLevel} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-dark)', fontFamily: "'Nunito', sans-serif" }}>
              {ing.matched_name}
              {loading && <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--green-primary)', marginLeft: 6, animation: 'pulse 1s infinite', verticalAlign: 'middle' }} />}
            </span>
            <span className={badgeClass} style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 50, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Nunito Sans', sans-serif" }}>
              {badgeLabel}
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', fontFamily: "'Nunito Sans', sans-serif" }}>
            {ing.ingredient?.function || 'Cosmetic ingredient'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: 'var(--text-light)', background: 'var(--bg-section)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 6, fontFamily: "'Nunito Sans', sans-serif" }}>
            {ing.confidence}% match
          </span>
          <ChevronDown size={13} style={{ color: 'var(--text-light)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>
      </button>

      {isOpen && (
        <div style={{ paddingLeft: 28, paddingBottom: 16, paddingTop: 4 }} className="animate-fade-in">
          <p style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.7, marginBottom: 10, fontFamily: "'Nunito Sans', sans-serif" }}>
            {explanation || 'Analyzed against cosmetic safety databases.'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11 }}>
            <span style={{ background: 'var(--bg-section)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 6, color: 'var(--text-muted)', fontFamily: "'Nunito Sans', sans-serif" }}>
              Source: {sourceLabel}
            </span>
            {finding?.source && (
              <span style={{ color: 'var(--text-light)', fontFamily: "'Nunito Sans', sans-serif" }}>Ref: {finding.source}</span>
            )}
          </div>
          {finding?.alternatives && finding.alternatives.length > 0 && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--green-light)', border: '1px solid rgba(30,122,78,0.2)', borderRadius: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 3, fontFamily: "'Nunito Sans', sans-serif" }}>Safer alternatives</span>
              <span style={{ fontSize: 12, color: '#1a4a2e', fontFamily: "'Nunito Sans', sans-serif" }}>{finding.alternatives.join(' · ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ResultsDashboard({ results, onReanalyze }: Props) {
  const [activeTab, setActiveTab] = useState<'all' | 'flagged' | 'beneficial'>('all');
  const dialRef = useRef<SVGCircleElement>(null);

  const score = results.safety_score;
  const isPregnancyFlagged = results.pregnancy_alerts?.length > 0;
  const dangerFindings = results.findings.filter(f => f.level === 'danger');
  const warningFindings = results.findings.filter(f => f.level === 'warning');

  useEffect(() => {
    if (!dialRef.current) return;
    const s = score ?? 0;
    const offset = CIRCUMFERENCE * (1 - s / 100);
    dialRef.current.style.strokeDashoffset = String(CIRCUMFERENCE);
    const raf = requestAnimationFrame(() => {
      if (dialRef.current) {
        dialRef.current.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.22, 1, 0.36, 1)';
        dialRef.current.style.strokeDashoffset = String(offset);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const handleAcceptSuggestion = (rawToken: string, best: string) => {
    if (!onReanalyze) return;
    let updated = results.original_text;
    const rx = new RegExp(escapeRegExp(rawToken), 'i');
    updated = rx.test(updated) ? updated.replace(rx, best) : `${updated}, ${best}`;
    onReanalyze(updated);
  };

  if (results.matched_count === 0) {
    return (
      <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--risk-moderate-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertTriangle size={24} style={{ color: 'var(--risk-moderate)' }} />
        </div>
        <h3 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--text-dark)', marginBottom: 8 }}>No Ingredients Recognized</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 360, margin: '0 auto', fontFamily: "'Nunito Sans', sans-serif" }}>
          No standard INCI ingredients were identified from the scanned text. Check image quality or spelling and try again.
        </p>
      </div>
    );
  }

  /* Score verdict */
  let verdictLabel = 'Excellent';
  let verdictDesc = 'No high or moderate risk ingredients detected. Very safe formula.';
  let verdictBadgeClass = 'risk-badge-good';
  let dialColor = '#3dba4e';
  let VerdictIcon = CheckCircle;

  if (score === null) {
    verdictLabel = 'Insufficient data';
    verdictDesc = 'Insufficient data to calculate a safety score.';
    verdictBadgeClass = '';
    dialColor = '#c0c0c0';
    VerdictIcon = Info;
  } else if (score < 50) {
    verdictLabel = 'Bad';
    verdictDesc = isPregnancyFlagged
      ? 'Contains ingredients contraindicated during pregnancy.'
      : `Contains ${dangerFindings.length} high-risk ingredient${dangerFindings.length !== 1 ? 's' : ''}.`;
    verdictBadgeClass = 'risk-badge-bad';
    dialColor = '#e84b3c';
    VerdictIcon = XCircle;
  } else if (score < 80) {
    verdictLabel = 'Not Great';
    verdictDesc = `Contains ${warningFindings.length} moderate-risk ingredient${warningFindings.length !== 1 ? 's' : ''}.`;
    verdictBadgeClass = 'risk-badge-moderate';
    dialColor = '#f0a832';
    VerdictIcon = AlertTriangle;
  } else if (score < 95) {
    verdictLabel = 'Good';
    verdictDesc = 'Formula is generally safe with minor potential concerns.';
    verdictBadgeClass = 'risk-badge-good';
    dialColor = '#3dba4e';
    VerdictIcon = CheckCircle;
  }

  /* Sort ingredients */
  const allList: any[] = [];
  const watchList: any[] = [];
  const beneficialList: any[] = [];

  results.found_ingredients?.forEach((ing, index) => {
    const finding = results.findings.find(f => f.ingredient.toLowerCase() === ing.matched_name.toLowerCase());
    const isWatch = finding && (finding.level === 'danger' || finding.level === 'warning');
    const isBeneficial = Boolean(BENEFICIAL_MAP[ing.matched_name?.toLowerCase()]);
    const alertLevel = isWatch ? finding!.level : 'safe';
    const item = { ing: { ...ing, originalIndex: index }, finding, alertLevel };

    allList.push(item);
    if (isWatch) watchList.push(item);
    if (isBeneficial) beneficialList.push(item);
  });

  const sortFn = (a: any, b: any) => {
    const av = a.alertLevel === 'danger' ? 2 : a.alertLevel === 'warning' ? 1 : 0;
    const bv = b.alertLevel === 'danger' ? 2 : b.alertLevel === 'warning' ? 1 : 0;
    return av !== bv ? bv - av : a.ing.originalIndex - b.ing.originalIndex;
  };

  allList.sort(sortFn); watchList.sort(sortFn); beneficialList.sort(sortFn);
  const displayList = activeTab === 'flagged' ? watchList : activeTab === 'beneficial' ? beneficialList : allList;

  const ocrErrors = results.unmatched?.filter(u => u.category === 'ocr_error') || [];
  const brandNames = results.unmatched?.filter(u => u.category === 'brand_name') || [];
  const genuineUnknowns = results.unmatched?.filter(u => u.category === 'unknown_inci') || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Score card */}
      <div className="card" style={{ padding: '32px', display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Dial */}
        <div style={{ position: 'relative', width: 130, height: 130, flexShrink: 0, margin: '0 auto' }}>
          <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%' }}>
            <circle cx="60" cy="60" r="52" fill="none" stroke="#f0f0f0" strokeWidth="8" />
            <circle
              ref={dialRef}
              cx="60" cy="60" r="52"
              fill="none"
              stroke={dialColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE}
              className="score-ring-fill"
              style={{ filter: `drop-shadow(0 0 8px ${dialColor}55)`, transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 34, fontWeight: 900, color: 'var(--text-dark)', lineHeight: 1, fontFamily: "'Nunito', sans-serif" }}>{score ?? '—'}</span>
            <span style={{ fontSize: 10, color: 'var(--text-light)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Nunito Sans', sans-serif" }}>/ 100</span>
          </div>
        </div>

        {/* Verdict */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <span className={verdictBadgeClass} style={{ fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 50, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'inline-block', marginBottom: 10, fontFamily: "'Nunito Sans', sans-serif" }}>
            {verdictLabel}
          </span>
          <p style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.65, marginBottom: 16, fontFamily: "'Nunito Sans', sans-serif" }}>{verdictDesc}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Matched', val: `${results.matched_count} / ${results.assessed_count || results.matched_count}` },
              { label: 'Coverage', val: `${results.coverage_percent}%` },
            ].map((s, i) => (
              <div key={i} style={{ padding: '10px 14px', background: 'var(--bg-section)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Nunito Sans', sans-serif" }}>{s.label}</p>
                <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-dark)', lineHeight: 1.2, fontFamily: "'Nunito', sans-serif" }}>{s.val}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pregnancy alert */}
      {isPregnancyFlagged && (
        <div style={{ display: 'flex', gap: 12, padding: '14px 18px', background: '#fdeaea', border: '1px solid rgba(232,75,60,0.25)', borderRadius: 12 }}>
          <AlertTriangle size={17} style={{ color: '#e84b3c', flexShrink: 0, marginTop: 1 }} />
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9a1e18', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 3, fontFamily: "'Nunito Sans', sans-serif" }}>Pregnancy Safety Alert</span>
            <p style={{ fontSize: 13, color: '#7a1510', lineHeight: 1.6, fontFamily: "'Nunito Sans', sans-serif" }}>
              Contains compounds flagged as pregnancy risks: <strong>{results.pregnancy_alerts.map(a => a.matched_name).join(', ')}</strong>
            </p>
            <p style={{ fontSize: 11, color: '#9a4040', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(232,75,60,0.15)', lineHeight: 1.5, fontFamily: "'Nunito Sans', sans-serif" }}>
              Systemic absorption rates vary. Consult your dermatologist or obstetrician before use.
            </p>
          </div>
        </div>
      )}

      {/* Ingredient list */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Tabs */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          {[
            { id: 'all', label: `All (${allList.length})` },
            { id: 'flagged', label: `Concerns (${watchList.length})` },
            { id: 'beneficial', label: `Actives (${beneficialList.length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`filter-pill ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Ingredient rows */}
        <div style={{ padding: '0 20px' }}>
          {displayList.length === 0 ? (
            <p style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontFamily: "'Nunito Sans', sans-serif", fontStyle: 'italic' }}>No ingredients matched this filter.</p>
          ) : (
            displayList.map((item, idx) => (
              <IngredientRow key={idx} ing={item.ing} idx={idx} finding={item.finding} alertLevel={item.alertLevel} />
            ))
          )}
        </div>
      </div>

      {/* Unrecognized tokens */}
      {results.unmatched?.length > 0 && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <h4 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 16, color: 'var(--text-dark)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 7 }}>
            <AlertTriangle size={14} style={{ color: 'var(--risk-moderate)' }} /> Unrecognized Ingredients ({results.unmatched.length})
          </h4>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, fontFamily: "'Nunito Sans', sans-serif", lineHeight: 1.6 }}>
            These terms could not be matched to the database. Correct any typos or search external sources.
          </p>

          {ocrErrors.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--risk-moderate)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8, fontFamily: "'Nunito Sans', sans-serif" }}>Possible Spelling Errors</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {ocrErrors.map((u, i) => (
                  <div key={i} style={{ background: 'var(--bg-section)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', display: 'block', marginBottom: 6 }}>{u.raw}</span>
                    {u.best_candidate && (
                      <button onClick={() => handleAcceptSuggestion(u.raw, u.best_candidate!)} style={{ width: '100%', background: 'var(--green-light)', border: '1px solid rgba(30,122,78,0.2)', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: 'var(--green-primary)', cursor: 'pointer', textAlign: 'left', fontFamily: "'Nunito Sans', sans-serif", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Correct to: <strong>{u.best_candidate}</strong></span>
                        <span style={{ background: 'var(--green-primary)', color: 'white', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>Accept</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {brandNames.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8, fontFamily: "'Nunito Sans', sans-serif" }}>Proprietary Blends</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {brandNames.map((u, i) => (
                  <span key={i} style={{ background: '#e8f0fe', color: '#2a5298', border: '1px solid rgba(42,82,152,0.2)', padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600, fontFamily: "'Nunito Sans', sans-serif" }}>{u.raw}</span>
                ))}
              </div>
            </div>
          )}

          {genuineUnknowns.length > 0 && (
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8, fontFamily: "'Nunito Sans', sans-serif" }}>Unknown INCI</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {genuineUnknowns.map((u, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-section)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{u.raw}</span>
                    <a href={`https://www.google.com/search?q=${encodeURIComponent(u.raw + ' skincare INCI')}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--green-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, fontFamily: "'Nunito Sans', sans-serif" }}>
                      Search <ExternalLink size={9} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Safer alternatives tip */}
      {results.findings.some(f => f.level === 'danger' || f.level === 'warning') && (
        <div style={{ display: 'flex', gap: 14, padding: '16px 20px', background: 'var(--green-light)', border: '1px solid rgba(30,122,78,0.2)', borderRadius: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(30,122,78,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Lightbulb size={16} style={{ color: 'var(--green-primary)' }} />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-dark)', marginBottom: 4, fontFamily: "'Nunito', sans-serif" }}>Recommended Safer Alternatives</p>
            <p style={{ fontSize: 13, color: '#1a4a2e', lineHeight: 1.6, fontFamily: "'Nunito Sans', sans-serif" }}>
              Look for products formulated with: <strong>Squalane</strong> (instead of comedogenic oils) · <strong>Azelaic Acid</strong> (instead of high-strength acids) · Fragrance-free formulas.
            </p>
          </div>
        </div>
      )}

      {/* Raw extracted text */}
      <div style={{ padding: '14px 18px', background: 'var(--bg-section)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontFamily: "'Nunito Sans', sans-serif" }}>Extracted label text</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', lineHeight: 1.6, maxHeight: 64, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {results.original_text || 'No text extracted'}
        </p>
      </div>
    </div>
  );
}
