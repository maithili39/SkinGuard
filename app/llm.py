"""LLM provider abstraction for SkinGuard.

Uses Gemini 2.5 Pro as the primary model — the most capable model in the
Gemini family, with 1M token context and strong reasoning.

Grounding contract:
  - The prompt ALWAYS includes structured ingredient data from OUR database.
  - The system instruction explicitly forbids invented facts.
  - If GEMINI_API_KEY is absent, `ask()` returns a clear error string so the
    rest of the app keeps working without any LLM dependency.

Usage:
    from app.llm import ask, is_available
    if is_available():
        answer = ask(prompt, system_instruction)
"""

import logging
import os
from typing import Optional

logger = logging.getLogger("skinguard.llm")

# ── Config ─────────────────────────────────────────────────────────────────────
# Gemini 2.5 Pro — best capability/context model available.
_GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")
_API_KEY: Optional[str] = os.environ.get("GEMINI_API_KEY")

# System instruction enforcing the grounding contract for RAG Q&A.
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
    """Lazily initialise the Gemini client (avoids import cost at startup)."""
    global _client
    if _client is not None:
        return _client
    if not _API_KEY:
        return None
    try:
        from google import genai  # type: ignore[import-untyped]
        from google.genai import types as genai_types  # type: ignore[import-untyped]
        client = genai.Client(api_key=_API_KEY)
        # Stash model name and config on client so ask() can use them
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
    """Return True if the LLM is configured and importable."""
    return _get_client() is not None


def get_model_name() -> str:
    """Return the active model name (or 'unavailable')."""
    return _GEMINI_MODEL if is_available() else "unavailable"


def ask(prompt: str, context: str = "") -> tuple[str, str]:
    """Send a grounded prompt to Gemini 2.5 Pro.

    Args:
        prompt: The user question / instruction.
        context: Structured ingredient data to ground the response on.

    Returns:
        (answer_text, model_name) — model_name is "template" if LLM unavailable.
    """
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
    """Serialise a list of ingredient dicts into a grounding context block.

    Each ingredient dict is the `found_ingredients[i]` format from /analyze.
    """
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
