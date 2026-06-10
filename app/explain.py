"""Plain-language explanations for ingredients + Gemini LLM client.

Two explanation modes:
  1. LLM-enhanced (Gemini 2.5 Pro): explain_ingredient_llm() — grounded on our DB fields.
  2. Template baseline (offline): explain_ingredient() — deterministic, zero API cost.

The Gemini client is lazily initialised; if GEMINI_API_KEY is absent every LLM
function gracefully falls back to the template path — callers need not know which
path was taken.
"""

import json
import logging
import os
from typing import Optional

from app.models import Ingredient

logger = logging.getLogger("skinguard.explain")

# ── Gemini client setup ───────────────────────────────────────────────────────

_GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")
_API_KEY: Optional[str] = os.environ.get("GEMINI_API_KEY")

SYSTEM_INSTRUCTION = """You are SkinGuard's ingredient safety assistant.

RULES (strictly enforced):
1. Answer ONLY using the structured ingredient data provided in the user message.
2. If you cannot answer from the provided data, say so clearly — do NOT speculate.
3. Keep answers concise (≤ 3 paragraphs) and actionable.
4. Always clarify you are providing educational information, not medical advice.
5. When citing a concern (comedogenic, irritant, pregnancy, fungal acne, rosacea),
   quote the specific flag and source from the provided data.
6. Never invent ingredient properties, studies, or brand-specific claims.
"""

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not _API_KEY:
        return None
    try:
        from google import genai  # type: ignore[import-untyped]
        from google.genai import types as genai_types  # type: ignore[import-untyped]
        client = genai.Client(api_key=_API_KEY)
        client._sg_model = _GEMINI_MODEL
        client._sg_config = genai_types.GenerateContentConfig(
            temperature=0.2,
            top_p=0.9,
            max_output_tokens=1024,
            system_instruction=SYSTEM_INSTRUCTION,
        )
        _client = client
        logger.info("Gemini client initialised with model: %s", _GEMINI_MODEL)
        return _client
    except Exception as exc:
        logger.warning("Failed to initialise Gemini client: %s", exc)
        return None


def is_available() -> bool:
    return _get_client() is not None


def get_model_name() -> str:
    return _GEMINI_MODEL if is_available() else "unavailable"


def ask(prompt: str, context: str = "") -> tuple[str, str]:
    """Send a grounded prompt to Gemini. Returns (answer_text, model_name)."""
    prompt = prompt.strip()[:500]
    if any(kw in prompt.lower() for kw in ["ignore previous", "system prompt", "forget"]):
        return (
            "I can only answer questions about skincare ingredients "
            "from the analysed product. Please ask a specific ingredient question.",
            "guard",
        )
    client = _get_client()
    if client is None:
        return (
            "LLM explanations are not available (GEMINI_API_KEY not configured). "
            "Showing template-based explanation instead.",
            "template",
        )
    full_prompt = f"{context}\n\n---\nQuestion: {prompt}" if context else prompt
    try:
        response = client.models.generate_content(
            model=client._sg_model,
            contents=full_prompt,
            config=client._sg_config,
        )
        text = response.text.strip() if response.text else ""
        if not text:
            return "The model returned an empty response.", _GEMINI_MODEL
        return text, _GEMINI_MODEL
    except Exception as exc:
        logger.error("Gemini API error: %s", exc)
        return f"LLM request failed: {exc}", "error"


def build_ingredient_context(ingredients: list[dict]) -> str:
    if not ingredients:
        return "No ingredient data available."
    lines = ["=== Ingredient Database Entries (use ONLY these facts) ===\n"]
    for ing_data in ingredients:
        name = ing_data.get("matched_name", "Unknown")
        ing = ing_data.get("ingredient", {})
        lines.append(f"Ingredient: {name}")
        if ing.get("function"):
            lines.append(f"  Function: {ing['function']}")
        if ing.get("comedogenic"):
            lines.append(f"  Comedogenic: yes (pore-clogging)")
        if ing.get("irritant") == "yes":
            lines.append(f"  Irritant: yes (known allergen/irritant)")
        if ing_data.get("explanation"):
            lines.append(f"  Summary: {ing_data['explanation']}")
        lines.append("")
    return "\n".join(lines)


def ask_batch_explanations(prompt: str) -> dict[str, str]:
    """Batch ingredient explanations via Gemini with JSON schema response."""
    client = _get_client()
    if client is None:
        return {}
    try:
        from google.genai import types as genai_types
        from pydantic import BaseModel

        class IngredientExplanation(BaseModel):
            inci_name: str
            explanation: str

        class BatchExplanations(BaseModel):
            explanations: list[IngredientExplanation]

        config = genai_types.GenerateContentConfig(
            temperature=0.2,
            top_p=0.9,
            max_output_tokens=2048,
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=BatchExplanations,
        )
        response = client.models.generate_content(
            model=client._sg_model,
            contents=prompt,
            config=config,
        )
        text = response.text.strip() if response.text else ""
        if not text:
            logger.warning("Empty response received in batch explanation")
            return {}
        parsed = json.loads(text)
        return {
            item["inci_name"].strip().upper(): item["explanation"].strip()
            for item in parsed.get("explanations", [])
            if item.get("inci_name") and item.get("explanation")
        }
    except Exception as exc:
        logger.error("Gemini API batch explanation error: %s", exc)
        return {}


# ── Template-based explanation ────────────────────────────────────────────────

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


def _build_batch_prompt(ingredients: list[Ingredient]) -> str:
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


def explain_ingredient_llm(ing: Ingredient) -> str:
    """LLM-grounded explanation, with template fallback."""
    if not ing or not ing.inci_name:
        return ""
    try:
        from app.cache import get_cached, make_key
        cache_key = make_key("explain", ing.inci_name.strip().upper())
        cached = get_cached(cache_key)
        if cached is not None:
            return cached
    except Exception as exc:
        logger.warning("Cache access failed in explain_ingredient_llm: %s", exc)
    res_dict = explain_ingredients_llm_batch([ing])
    return res_dict.get(ing.inci_name.strip().upper(), explain_ingredient(ing))


def explain_ingredients_llm_batch(ingredients: list[Ingredient]) -> dict[str, str]:
    """Batch LLM explanations with Redis caching and offline fallback."""
    from app.cache import get_cached, make_key, set_cached

    results: dict[str, str] = {}
    if not ingredients:
        return results

    unique_ingredients, seen = [], set()
    for ing in ingredients:
        if ing and ing.inci_name:
            norm = ing.inci_name.strip().upper()
            if norm not in seen:
                unique_ingredients.append(ing)
                seen.add(norm)

    miss_ingredients = []
    for ing in unique_ingredients:
        norm = ing.inci_name.strip().upper()
        cached = get_cached(make_key("explain", norm))
        if cached is not None:
            results[norm] = cached
        else:
            miss_ingredients.append(ing)

    if not miss_ingredients:
        return results

    if not is_available():
        for ing in miss_ingredients:
            results[ing.inci_name.strip().upper()] = explain_ingredient(ing)
        return results

    for i in range(0, len(miss_ingredients), 15):
        batch = miss_ingredients[i : i + 15]
        batch_explanations = ask_batch_explanations(_build_batch_prompt(batch))
        for ing in batch:
            norm = ing.inci_name.strip().upper()
            explanation = batch_explanations.get(norm)
            if explanation:
                set_cached(make_key("explain", norm), explanation, ttl=86400 * 30)
                results[norm] = explanation
            else:
                results[norm] = explain_ingredient(ing)

    return results
