/**
 * T3-6: Zod runtime validation for all SkinGuard API responses.
 *
 * Why this matters: TypeScript types only exist at compile time. If the
 * backend returns an unexpected shape (schema migration, BE bug, network
 * truncation) the frontend silently gets `undefined` on fields it expects
 * and crashes in confusing ways. Zod catches these mismatches at runtime and
 * returns a safe fallback or a clear error so we can surface it in the UI.
 *
 * Usage:
 *   import { safeFetch } from '@/lib/api';
 *   const result = await safeFetch('/api/analyze', AnalysisResultSchema, { method: 'POST', ... });
 */

import { z } from 'zod';

// ── Primitive schemas ──────────────────────────────────────────────────────────

const FindingSchema = z.object({
  ingredient: z.string(),
  level: z.enum(['danger', 'warning', 'good']),
  concern: z.string(),
  message: z.string(),
  source: z.string().nullable(),
  kind: z.enum(['regulatory', 'advice']),
  alternatives: z.array(z.string()).optional().default([]),
});

const MatchedIngredientSchema = z.object({
  raw: z.string(),
  ingredient: z.string(),
  confidence: z.number(),
});

const UnmatchedIngredientSchema = z.object({
  raw: z.string(),
  best_confidence: z.number(),
  best_candidate: z.string().nullable().optional(),
  // T2-#12: did_you_mean from Tier 2 fix
  did_you_mean: z.string().nullable().optional(),
  category: z.string(),
});

const FoundIngredientSchema = z.object({
  matched_name: z.string(),
  confidence: z.number(),
  match_method: z.string().optional(),
  explanation: z.string().nullable(),
  ingredient: z.object({
    function: z.string().nullable(),
    comedogenic: z.boolean(),
    irritant: z.string().nullable(),
  }),
});

const PregnancyAlertSchema = z.object({
  matched_name: z.string(),
  // T2-#9: level and message now included
  level: z.enum(['danger', 'warning']).optional(),
  message: z.string().optional(),
});

// ── Main analysis result schema ────────────────────────────────────────────────

export const AnalysisResultSchema = z.object({
  safety_score: z.number().nullable(),
  score_basis: z.string(),
  // T2-#8: score_reasons added in Tier 2
  score_reasons: z.array(z.string()).optional().default([]),
  coverage_percent: z.number(),
  matched_count: z.number(),
  assessed_count: z.number(),
  assessment_depth_percent: z.number(),
  summary: z.string(),
  findings: z.array(FindingSchema),
  matched: z.array(MatchedIngredientSchema),
  unmatched: z.array(UnmatchedIngredientSchema),
  found_ingredients: z.array(FoundIngredientSchema),
  comedogenic_alerts: z.array(z.object({
    ingredient: z.string(),
    message: z.string(),
  })),
  irritant_alerts: z.array(z.object({
    ingredient: z.string(),
    message: z.string(),
  })),
  pregnancy_alerts: z.array(PregnancyAlertSchema),
  disclaimer: z.string(),
  original_text: z.string().optional(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ── Auth schemas ───────────────────────────────────────────────────────────────

const SkinProfileSchema = z.object({
  pregnant: z.boolean(),
  sensitive_skin: z.boolean(),
  acne_prone: z.boolean(),
  fungal_acne: z.boolean(),
  rosacea: z.boolean(),
  dry_skin: z.boolean(),
  oily_skin: z.boolean(),
  combination_skin: z.boolean(),
  normal_skin: z.boolean(),
  avoid_list: z.array(z.string()).default([]),
});

export const AuthOutSchema = z.object({
  email: z.string().email(),
  full_name: z.string().nullable().optional(),
  profile: SkinProfileSchema,
});

export type AuthOut = z.infer<typeof AuthOutSchema>;

// ── Scan history ───────────────────────────────────────────────────────────────

const ScanSummarySchema = z.object({
  id: z.number(),
  created_at: z.string().nullable(),
  safety_score: z.number().nullable(),
  coverage_percent: z.number(),
  summary: z.string().nullable(),
  input_text: z.string().optional(),
});

export const ScanListSchema = z.object({
  email: z.string(),
  offset: z.number(),
  limit: z.number(),
  scans: z.array(ScanSummarySchema),
});

export type ScanList = z.infer<typeof ScanListSchema>;

// ── Health ─────────────────────────────────────────────────────────────────────

export const HealthSchema = z.object({
  status: z.string(),
  matcher_aliases: z.number().optional(),
  embedding_matcher: z.boolean().optional(),
  llm_model: z.string().optional(),
  llm_available: z.boolean(),
  version: z.string().optional(),
});

// ── Explain ────────────────────────────────────────────────────────────────────

export const ExplainSchema = z.object({
  ingredient: z.string(),
  confidence: z.number(),
  match_method: z.string(),
  explanation: z.string(),
  llm_used: z.boolean(),
});

// ── Barcode ────────────────────────────────────────────────────────────────────

export const BarcodeResultSchema = z.object({
  product_name: z.string(),
  brands: z.string(),
  ingredients_text: z.string(),
  image_url: z.string().nullable().optional(),
  source: z.string().optional(),
});

export type BarcodeResult = z.infer<typeof BarcodeResultSchema>;

// ── Routine ────────────────────────────────────────────────────────────────────

export const RoutineResultSchema = z.object({
  compatible: z.boolean(),
  summary: z.string(),
  product_actives: z.record(z.record(z.string())),
  conflicts: z.array(z.object({
    product_a: z.string(),
    product_b: z.string(),
    ingredient_a: z.string(),
    ingredient_b: z.string(),
    conflict_type: z.string(),
    severity: z.enum(['danger', 'warning']),
    message: z.string(),
  })),
});

// ── Chat ───────────────────────────────────────────────────────────────────────

export const ChatOutSchema = z.object({
  answer: z.string(),
  grounded_on: z.array(z.string()),
  source: z.string(),
});

// ── Safe fetch wrapper ─────────────────────────────────────────────────────────

/**
 * Typed fetch that validates the response against a Zod schema.
 *
 * - On HTTP error: throws Error with the backend `detail` message.
 * - On schema mismatch: logs a warning and returns the raw data cast as T
 *   (graceful degradation — partial data is better than a blank screen).
 * - On network error: re-throws so the caller can catch it.
 */
export async function safeFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.detail ?? detail;
    } catch {
      // ignore JSON parse error
    }
    throw new Error(detail);
  }

  const raw = await res.json();
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    // Log the schema mismatch for debugging but don't crash the UI —
    // return the raw value so existing TypeScript types still work.
    console.warn(
      `[SkinGuard] API response schema mismatch for ${url}:`,
      parsed.error.flatten(),
    );
    return raw as T;
  }

  return parsed.data;
}
