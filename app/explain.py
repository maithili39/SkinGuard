"""Plain-language, one-line explanations for ingredients.

Two modes:
  1. LLM-enhanced (Gemini 2.5 Pro): `explain_ingredient_llm()` — generates a richer,
     more natural explanation grounded strictly on our structured DB fields.
     Falls back to the template if GEMINI_API_KEY is not set.

  2. Template baseline (offline): `explain_ingredient()` — deterministic, zero API
     cost, used as a fallback and in tests. Built from our own structured data.

Design note: the LLM call uses the existing Ingredient model fields as the ONLY
source of truth (function, flags, notes, source). The LLM cannot invent properties
that aren't in our DB — this is the "grounding contract."
"""

import logging

from app.models import Ingredient

logger = logging.getLogger("skinguard.explain")

_FUNCTION_PHRASES = {
    "humectant": "draws moisture into the skin",
    "emollient": "softens and smooths the skin",
    "occlusive": "seals in moisture",
    "surfactant": "cleanses by lifting away oil and dirt",
    "preservative": "keeps the product free of microbes",
    "antioxidant": "helps protect skin from free-radical damage",
    "UV filter": "provides sun protection",
    "exfoliant": "removes dead surface skin cells",
    "soothing": "calms and soothes the skin",
    "barrier repair": "helps rebuild the skin's protective barrier",
    "fragrance": "adds scent (a common source of irritation)",
    "thickener": "gives the product its texture",
    "emulsifier": "keeps oil and water mixed",
    "pH adjuster": "balances the product's acidity",
    "skin conditioning": "improves the skin's feel and condition",
    "anti-ageing": "targets signs of ageing",
    "skin lightening": "helps even out skin tone",
    "solvent": "acts as the base the other ingredients dissolve in",
    "essential oil": "provides botanical active compounds (may irritate sensitive skin)",
    "antimicrobial": "helps control bacterial growth",
}


def explain_ingredient(ing: Ingredient) -> str:
    """Template-based offline explanation — deterministic and test-safe."""
    parts: list[str] = []

    role = _FUNCTION_PHRASES.get(ing.function or "")
    if role:
        parts.append(f"{ing.inci_name} {role}")
    else:
        parts.append(f"{ing.inci_name} is a skincare ingredient")

    if ing.comedogenic is not None and ing.comedogenic >= 3:
        parts.append(f"it rates {ing.comedogenic}/5 for clogging pores")
    if ing.fungal_acne_safe == "no":
        parts.append("may trigger fungal acne")
    if ing.irritant == "yes":
        parts.append("can irritate sensitive skin")
    if ing.pregnancy_safe == "no":
        parts.append("best avoided during pregnancy")
    elif ing.pregnancy_safe == "caution":
        parts.append("use with caution during pregnancy")

    sentence = "; ".join(parts) + "."
    if ing.notes:
        sentence += f" ({ing.notes})"
    return sentence


def _build_llm_prompt(ing: Ingredient) -> tuple[str, str]:
    """Build the (context, question) pair for the LLM grounded explanation call.

    The context block contains ONLY fields from our structured DB entry so the
    model cannot hallucinate properties we haven't curated.
    """
    flags: list[str] = []
    if ing.comedogenic is not None:
        flags.append(f"comedogenic rating: {ing.comedogenic}/5")
    if ing.fungal_acne_safe:
        flags.append(f"fungal-acne safe: {ing.fungal_acne_safe}")
    if ing.pregnancy_safe:
        flags.append(f"pregnancy safe: {ing.pregnancy_safe}")
    if ing.irritant:
        flags.append(f"irritant: {ing.irritant}")
    if ing.regulatory_status and ing.regulatory_status != "allowed":
        flags.append(f"regulatory status: {ing.regulatory_status}")

    context = f"""=== Structured ingredient record (use ONLY these facts) ===
INCI Name: {ing.inci_name}
Function: {ing.function or 'unknown'}
{('Flags: ' + ', '.join(flags)) if flags else 'Flags: none curated'}
{('Notes: ' + ing.notes) if ing.notes else ''}
{('Source: ' + ing.source) if ing.source else ''}
"""
    question = (
        f"Write a clear, 1–2 sentence explanation of {ing.inci_name} "
        f"for a skincare consumer. Use only the structured data above. "
        f"Mention the function, highlight any notable flags, and end with the source."
    )
    return context, question


def explain_ingredient_llm(ing: Ingredient) -> str:
    """LLM-grounded explanation using Gemini 2.5 Pro, with template fallback.

    Called by analysis.py for every matched ingredient. If GEMINI_API_KEY is not
    set, transparently falls back to the offline template — callers don't need to
    know which path was taken.
    """
    try:
        from app.llm import ask, is_available  # lazy import avoids circular deps
        if not is_available():
            return explain_ingredient(ing)
        context, question = _build_llm_prompt(ing)
        answer, model = ask(question, context)
        if model in ("template", "error"):
            return explain_ingredient(ing)
        logger.debug("LLM explain for %s via %s", ing.inci_name, model)
        return answer
    except Exception as exc:
        logger.warning("LLM explain failed for %s: %s — using template", ing.inci_name, exc)
        return explain_ingredient(ing)
