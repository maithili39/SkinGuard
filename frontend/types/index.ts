// Shared TypeScript types for SkinGuard frontend.
// Import from here rather than re-defining inline in each component.

export interface SkinProfile {
  pregnant: boolean;
  sensitive_skin: boolean;
  acne_prone: boolean;
  fungal_acne: boolean;
  rosacea: boolean;
}

export interface UserState {
  email: string;
  token: string;
  profile: SkinProfile & { avoid_list: string[] };
}

export interface Finding {
  ingredient: string;
  level: 'danger' | 'warning' | 'good';
  concern: string;
  message: string;
  source: string | null;
  kind: 'regulatory' | 'advice';
  alternatives?: string[];
}

export interface ScanSummary {
  id: number;
  created_at: string | null;
  safety_score: number | null;
  coverage_percent: number;
  summary: string | null;
  input_text?: string;
}

export interface AnalysisResult {
  safety_score: number | null;
  score_basis: string;
  coverage_percent: number;
  matched_count: number;
  assessed_count: number;
  assessment_depth_percent: number;
  summary: string;
  findings: Finding[];
  matched: { raw: string; ingredient: string; confidence: number }[];
  unmatched: { raw: string; best_confidence: number; best_candidate?: string }[];
  found_ingredients: {
    matched_name: string;
    confidence: number;
    explanation: string | null;
    ingredient: { function: string | null; comedogenic: boolean; irritant: string | null };
  }[];
  comedogenic_alerts: { ingredient: string; message: string }[];
  irritant_alerts: { ingredient: string; message: string }[];
  pregnancy_alerts: { matched_name: string }[];
  disclaimer: string;
  original_text: string;
}

// ── Helper functions ───────────────────────────────────────────────────────────

export function scoreColor(score: number | null): string {
  if (score === null) return 'from-slate-400 to-slate-500';
  if (score >= 80) return 'from-emerald-500 to-green-400';
  if (score >= 50) return 'from-amber-500 to-yellow-400';
  return 'from-rose-600 to-red-500';
}

export function scoreRingColor(score: number | null): string {
  if (score === null) return '#94a3b8';
  if (score >= 80) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#f43f5e';
}

export function depthColor(pct: number): string {
  if (pct >= 50) return 'bg-emerald-100 text-emerald-700';
  if (pct >= 15) return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
