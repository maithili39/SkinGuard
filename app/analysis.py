"""Orchestrates the full text-in -> analysis-out flow.

   raw label text -> matcher (with confidence) -> rules engine -> result dict

This is the single function the API (and later the OCR pipeline) calls.
"""

from sqlalchemy.orm import Session

from app.explain import explain_ingredient
from app.matching import Matcher
from app.models import Ingredient
from app.rules import KNOWN_FILLERS, Profile, evaluate, get_alternatives, has_risk_data
import re

DISCLAIMER = (
    "SkinGuard provides ingredient information for educational purposes only and "
    "is not medical advice. Consult a dermatologist or doctor for personal "
    "concerns, especially during pregnancy."
)


def categorize_unmatched(raw_token: str, best_candidate: str | None, best_confidence: int) -> str:
    if best_candidate and best_confidence >= 50:
        return "ocr_error"
    if any(char.isdigit() or char in "@#$^*()_+={}[]|\\:;<>?/" for char in raw_token):
        return "ocr_error"
    if re.search(r'\b[A-Z][a-z]+', raw_token) or any(kw in raw_token.lower() for kw in ["tm", "trademark", "extract of"]):
        return "brand_name"
    return "unknown_inci"


def analyze_text(db: Session, raw_text: str, profile: Profile, matcher: Matcher | None = None) -> dict:
    """Orchestrate the full analysis flow.

    `matcher` should be the application-level singleton (built once at startup).
    When None (e.g. in tests that manage their own Matcher), a fresh one is
    constructed from `db` — identical behaviour, just slower.
    """
    if matcher is None:
        matcher = Matcher(db)  # fallback: tests / standalone scripts
    matches = matcher.match_list(raw_text)

    matched = [m for m in matches if m.status == "matched"]
    unmatched = [m for m in matches if m.status == "unmatched"]

    ingredients = [db.get(Ingredient, m.ingredient_id) for m in matched]
    result = evaluate(ingredients, profile)

    total = len(matches) or 1
    matched_count = len(matched)

    # Fix #11: Fillers (water, aqua, glycerin …) are almost always recognised
    # because they’re in every database, but they carry zero risk data.
    # Counting them inflates coverage % while the *meaningful* ingredient
    # assessment depth stays low. Exclude them from both numerator and denominator
    # so coverage reflects the proportion of *substantive* ingredients understood.
    filler_matched = sum(
        1 for m in matched
        if m.matched_inci and m.matched_inci.lower() in KNOWN_FILLERS
    )
    substantive_total = total - filler_matched
    substantive_matched = matched_count - filler_matched
    if substantive_total > 0:
        coverage = round(100 * substantive_matched / substantive_total)
    elif total > 0:
        # Label is all fillers — treat as 100% coverage (nothing substantive to miss)
        coverage = 100
    else:
        coverage = 0

    # Assessment depth: how many recognised ingredients have curated risk data?
    # "Recognised" (CosIng-only) ≠ "Assessed" (has at least one risk flag).
    # A label full of CosIng-only entries is NOT safe — it's merely unknown.
    assessed_count = sum(
        1 for ing in ingredients if ing and has_risk_data(ing)
    )
    assessment_depth_percent = (
        round(100 * assessed_count / matched_count) if matched_count > 0 else 0
    )

    # If zero assessed ingredients or zero matched ingredients, override score to None
    # so the UI can distinguish "scored and clean" from "no data".
    safety_score: int | None = result["score"]
    if (matched_count > 0 and assessed_count == 0) or matched_count == 0:
        safety_score = None

    # Build per-ingredient detail (reusing the already-fetched `ingredients` list,
    # which is parallel to `matched`) including a plain-language explanation.
    found_ingredients = [
        {
            "matched_name": m.matched_inci,
            "confidence": m.confidence,
            "match_method": getattr(m, "match_method", "fuzzy"),
            "explanation": None,  # lazy loading: fetched on-demand by frontend
            "ingredient": {
                "function": ing.function if ing else None,
                "comedogenic": bool(ing.comedogenic) if ing else False,
                "irritant": ing.irritant if ing else None,
            },
        }
        for m, ing in zip(matched, ingredients)
    ]

    return {
        "safety_score": safety_score,
        "score_basis": result.get("score_basis", "indicative"),
        # Fix #8: expose the human-readable reasons behind the score.
        "score_reasons": result.get("score_reasons", []),
        "coverage_percent": coverage,
        "matched_count": matched_count,
        "assessed_count": assessed_count,
        "assessment_depth_percent": assessment_depth_percent,
        "summary": _summary(
            safety_score, coverage, len(unmatched), profile,
            result["findings"], assessed_count, matched_count,
        ),
        "findings": [
            {
                "ingredient": f.inci_name,
                "level": f.level,
                "concern": f.concern,
                "message": f.message,
                "source": f.source,
                "kind": f.kind,  # 'regulatory' = EU fact, 'advice' = curated guidance
                # Look up alternatives from the matched ingredient's function field.
                "alternatives": get_alternatives(
                    next(
                        (ing.function for ing in ingredients
                         if ing and ing.inci_name == f.inci_name),
                        None,
                    ),
                    f.concern,
                ),
            }
            for f in result["findings"]
        ],
        "matched": [
            {"raw": m.raw, "ingredient": m.matched_inci, "confidence": m.confidence}
            for m in matched
        ],
        "unmatched": [
            {
                "raw": m.raw,
                "best_confidence": m.confidence,
                "best_candidate": m.best_candidate,
                # Fix #12: surface "did you mean?" suggestions for tokens that
                # almost matched (OCR typos, variant spellings). Only show when
                # confidence is meaningful (>= 40) to avoid noise.
                "did_you_mean": m.best_candidate if (m.best_candidate and m.confidence >= 40) else None,
                "category": categorize_unmatched(m.raw, m.best_candidate, m.confidence)
            }
            for m in unmatched
        ],
        "disclaimer": DISCLAIMER,
        "original_text": raw_text,
        "found_ingredients": found_ingredients,
        "comedogenic_alerts": [
            {"ingredient": f.inci_name, "message": f.message}
            for f in result["findings"] if f.concern == 'acne'
        ],
        "irritant_alerts": [
            {"ingredient": f.inci_name, "message": f.message}
            for f in result["findings"] if f.concern == 'sensitivity'
        ],
        "pregnancy_alerts": [
            {
                "matched_name": f.inci_name,
                # Fix #9: pass through the full message so frontend can distinguish
                # all-trimester danger vs 1st-trimester caution vs general caution.
                "level": f.level,
                "message": f.message,
            }
            for f in result["findings"] if f.concern == 'pregnancy'
        ]
    }


def _summary(
    score: int | None,
    coverage: int,
    n_unmatched: int,
    profile: Profile,
    findings: list,
    assessed_count: int = 0,
    matched_count: int = 0,
) -> str:
    # Build a more natural language recommendation based on findings and profile
    has_pregnancy_danger = any(f.concern == 'pregnancy' and f.level == 'danger' for f in findings)
    has_acne_warning = any(f.concern == 'acne' for f in findings)
    has_irritant = any(f.concern == 'sensitivity' for f in findings)

    if score is None:
        base = "Risk assessment unavailable"
    elif score >= 80:
        base = "Generally suitable"
    elif score >= 50:
        base = "Use with caution"
    else:
        base = "Not recommended"

    skin_types = []
    if profile.acne_prone: skin_types.append("acne-prone")
    if profile.sensitive_skin: skin_types.append("sensitive")
    if profile.fungal_acne: skin_types.append("fungal acne-prone")
    if getattr(profile, "dry_skin", False): skin_types.append("dry")
    if getattr(profile, "oily_skin", False): skin_types.append("oily")
    if getattr(profile, "combination_skin", False): skin_types.append("combination")
    if getattr(profile, "normal_skin", False): skin_types.append("normal")

    if skin_types and score is not None:
        base += f" for {', '.join(skin_types)} skin"

    parts = [base]

    if has_pregnancy_danger and profile.pregnant:
        parts.append("but strictly NOT recommended during pregnancy")
    elif has_acne_warning and (profile.acne_prone or getattr(profile, "oily_skin", False) or getattr(profile, "combination_skin", False)):
        parts.append("but contains pore-clogging ingredients")
    elif has_irritant and profile.sensitive_skin:
        parts.append("but contains known irritants")

    sentence = " ".join(parts) + "."

    if score is None and matched_count > 0:
        sentence += (
            f" We recognised {matched_count} ingredient(s) but have curated risk"
            f" data on none of them — score is withheld to avoid false confidence."
        )
    elif assessed_count > 0 and matched_count > 0 and assessed_count < matched_count:
        sentence += (
            f" (Risk data available for {assessed_count} of {matched_count}"
            f" recognised ingredients.)"
        )

    if coverage < 100:
        sentence += f" ({n_unmatched} ingredient(s) were not recognised)."

    return sentence
