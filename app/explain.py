"""Plain-language, one-line explanations for ingredients.

Built from OUR OWN structured data (function + notes + flags) — deliberately NOT
scraped from INCIDecoder (copyright). This is a deterministic, free baseline; you
can later swap `explain_ingredient` for a Claude call that uses the same fields as
grounding to produce richer text.
"""

from app.models import Ingredient

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
}


def explain_ingredient(ing: Ingredient) -> str:
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
