"""Orchestrates the full text-in -> analysis-out flow.

   raw label text -> matcher (with confidence) -> rules engine -> result dict

This is the single function the API (and later the OCR pipeline) calls.
"""

from sqlalchemy.orm import Session

from app.explain import explain_ingredient
from app.matching import Matcher
from app.models import Ingredient
from app.rules import Profile, evaluate, get_alternatives, has_risk_data

DISCLAIMER = (
    "SkinGuard provides ingredient information for educational purposes only and "
    "is not medical advice. Consult a dermatologist or doctor for personal "
    "concerns, especially during pregnancy."
)


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
    coverage = round(100 * matched_count / total)

    # Assessment depth: how many recognised ingredients have curated risk data?
    # "Recognised" (CosIng-only) ≠ "Assessed" (has at least one risk flag).
    # A label full of CosIng-only entries is NOT safe — it's merely unknown.
    assessed_count = sum(
        1 for ing in ingredients if ing and has_risk_data(ing)
    )
    assessment_depth_percent = (
        round(100 * assessed_count / matched_count) if matched_count > 0 else 0
    )

    # If zero assessed ingredients, the rules engine defaulted to score=100 —
    # but that 100 means "no problems found", NOT "safe". Override to None so
    # the UI can distinguish "scored and clean" from "no data".
    safety_score: int | None = result["score"]
    if matched_count > 0 and assessed_count == 0:
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
                "best_candidate": m.best_candidate,  # "Did you mean?" hint
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
            {"matched_name": f.inci_name} for f in result["findings"] if f.concern == 'pregnancy'
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
    elif has_acne_warning and profile.acne_prone:
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
