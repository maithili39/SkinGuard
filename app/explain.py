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
    if not ing or not ing.inci_name:
        return ""

    try:
        from app.cache import get_cached, make_key
        norm_name = ing.inci_name.strip().upper()
        cache_key = make_key("explain", norm_name)
        cached = get_cached(cache_key)
        if cached is not None:
            return cached
    except Exception as exc:
        logger.warning("Cache access failed in explain_ingredient_llm: %s", exc)

    res_dict = explain_ingredients_llm_batch([ing])
    return res_dict.get(ing.inci_name.strip().upper(), explain_ingredient(ing))


def _build_batch_prompt(ingredients: list[Ingredient]) -> str:
    """Build a combined prompt for a batch of ingredients to explain."""
    lines = ["Explain the following ingredients using ONLY their structured records below:"]
    for ing in ingredients:
        flags = []
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

        lines.append(f"INCI Name: {ing.inci_name.strip().upper()}")
        lines.append(f"Function: {ing.function or 'unknown'}")
        if flags:
            lines.append(f"Flags: {', '.join(flags)}")
        if ing.notes:
            lines.append(f"Notes: {ing.notes}")
        if ing.source:
            lines.append(f"Source: {ing.source}")
        lines.append("---")
    return "\n".join(lines)


def explain_ingredients_llm_batch(ingredients: list[Ingredient]) -> dict[str, str]:
    """Get plain-language explanations for a list of ingredients.

    Uses Redis caching to avoid API calls for already-explained ingredients.
    Any cache misses are grouped into batches of up to 15, sent to Gemini,
    and then saved back to the cache. Falls back to offline templates for
    any ingredient that cannot be explained via LLM.
    """
    from app.cache import get_cached, set_cached, make_key
    from app.llm import is_available, ask_batch_explanations

    results: dict[str, str] = {}
    if not ingredients:
        return results

    # Get unique non-None ingredients
    unique_ingredients = []
    seen = set()
    for ing in ingredients:
        if ing and ing.inci_name:
            norm_name = ing.inci_name.strip().upper()
            if norm_name not in seen:
                unique_ingredients.append(ing)
                seen.add(norm_name)

    # Check cache first
    miss_ingredients = []
    for ing in unique_ingredients:
        norm_name = ing.inci_name.strip().upper()
        cache_key = make_key("explain", norm_name)
        cached = get_cached(cache_key)
        if cached is not None:
            results[norm_name] = cached
        else:
            miss_ingredients.append(ing)

    if not miss_ingredients:
        return results

    # If LLM is not available, fall back to offline template for all misses
    if not is_available():
        for ing in miss_ingredients:
            norm_name = ing.inci_name.strip().upper()
            results[norm_name] = explain_ingredient(ing)
        return results

    # Process misses in batches of 15
    batch_size = 15
    for i in range(0, len(miss_ingredients), batch_size):
        batch = miss_ingredients[i : i + batch_size]
        prompt = _build_batch_prompt(batch)

        # Call batch endpoint
        batch_explanations = ask_batch_explanations(prompt)

        # Cache successful results and update output dict
        for ing in batch:
            norm_name = ing.inci_name.strip().upper()
            explanation = batch_explanations.get(norm_name)

            if explanation:
                cache_key = make_key("explain", norm_name)
                set_cached(cache_key, explanation, ttl=86400 * 30)
                results[norm_name] = explanation
            else:
                fallback = explain_ingredient(ing)
                results[norm_name] = fallback

    return results
