"""The analysis brain: turn matched ingredients + a user profile into warnings,
benefits and an honest safety score.

Design choices that make this 'product-grade' rather than a toy:
  - Rules are DATA (the RULES list below), not scattered if-statements, so adding
    a concern is a one-line change.
  - Every warning carries its `source` and a `kind` (legal fact vs curated advice)
    so the UI can show users WHERE it came from.
  - Personalization: warnings are filtered/weighted by the user's profile.
  - The score is computed transparently and is reported alongside the coverage
    (how much of the label we actually understood) — we never imply certainty we
    don't have.
"""

from dataclasses import dataclass, field
from typing import Callable, Optional

from app.models import Ingredient


@dataclass
class Profile:
    pregnant: bool = False
    sensitive_skin: bool = False
    acne_prone: bool = False
    fungal_acne: bool = False
    rosacea: bool = False
    dry_skin: bool = False
    oily_skin: bool = False
    combination_skin: bool = False
    normal_skin: bool = False
    avoid_list: list[str] = field(default_factory=list)  # lowercased inci names


@dataclass
class Finding:
    inci_name: str
    level: str  # "danger" | "warning" | "good"
    concern: str
    message: str
    source: Optional[str]
    kind: str  # "regulatory" (EU fact) | "advice" (curated guidance)


# A rule: (id, applies_to_profile, predicate, level, concern, message_builder, kind)
@dataclass
class Rule:
    concern: str
    level: str
    kind: str
    # when None, rule always applies; else only if the lambda(profile) is True
    profile_gate: Optional[Callable[[Profile], bool]]
    predicate: Callable[[Ingredient], bool]
    message: Callable[[Ingredient], str]


def _comedo(i: Ingredient, n: int) -> bool:
    return i.comedogenic is not None and i.comedogenic >= n


RULES: list[Rule] = [
    Rule(
        concern="pregnancy",
        level="danger",
        kind="advice",
        profile_gate=lambda p: p.pregnant,
        predicate=lambda i: i.pregnancy_safe == "no",
        message=lambda i: f"{i.inci_name} - Avoid entirely (all trimesters): contraindicated due to potential teratogenic or developmental risks.",
    ),
    Rule(
        concern="pregnancy",
        level="warning",
        kind="advice",
        profile_gate=lambda p: p.pregnant,
        predicate=lambda i: i.pregnancy_safe == "caution",
        message=lambda i: f"{i.inci_name} - Limited data: consult doctor (especially during 1st trimester) before using.",
    ),
    Rule(
        concern="fungal_acne",
        level="warning",
        kind="advice",
        profile_gate=lambda p: p.fungal_acne,
        predicate=lambda i: i.fungal_acne_safe == "no",
        message=lambda i: f"{i.inci_name} may feed Malassezia (fungal acne).",
    ),
    Rule(
        concern="acne",
        level="warning",
        kind="advice",
        profile_gate=lambda p: p.acne_prone or p.oily_skin or p.combination_skin,
        predicate=lambda i: _comedo(i, 3),
        message=lambda i: f"{i.inci_name} is comedogenic (rating {i.comedogenic}/5) - may clog pores.",
    ),
    Rule(
        concern="sensitivity",
        level="warning",
        kind="advice",
        profile_gate=lambda p: p.sensitive_skin,
        predicate=lambda i: i.irritant == "yes",
        message=lambda i: f"{i.inci_name} is a known irritant/allergen - may bother sensitive skin.",
    ),
    # Coverage booster: fragrance and essential oils are the most common cosmetic
    # contact allergens (dermatology consensus), so flag them by FUNCTION even when
    # the ingredient lacks a per-row curated irritant flag. Gated to avoid
    # double-firing with the curated-irritant rule above.
    Rule(
        concern="sensitivity",
        level="warning",
        kind="advice",
        profile_gate=lambda p: p.sensitive_skin or p.rosacea,
        predicate=lambda i: (i.function in ("fragrance", "essential oil")) and i.irritant != "yes",
        message=lambda i: (
            f"{i.inci_name} is a {i.function} - fragrance and essential oils are common "
            f"contact allergens and can irritate sensitive or rosacea-prone skin."
        ),
    ),
    # Regulatory facts apply to everyone regardless of profile.
    Rule(
        concern="regulatory",
        level="danger",
        kind="regulatory",
        profile_gate=None,
        predicate=lambda i: i.regulatory_status == "banned",
        message=lambda i: (
            f"{i.inci_name} is prohibited in EU cosmetics"
            + (f" ({i.source})" if i.source else " (EU Reg 1223/2009 Annex II)")
            + "."
        ),
    ),
    Rule(
        concern="regulatory",
        level="warning",
        kind="regulatory",
        profile_gate=None,
        predicate=lambda i: i.regulatory_status == "restricted",
        message=lambda i: (
            f"{i.inci_name} is restricted in EU cosmetics — concentration limits apply"
            + (f" ({i.source})" if i.source else " (EU Reg 1223/2009 Annex III)")
            + "."
        ),
    ),
    # ── Rosacea rules - active when profile.rosacea is True ──────────────────
    Rule(
        concern="rosacea",
        level="warning",
        kind="advice",
        profile_gate=lambda p: p.rosacea,
        predicate=lambda i: i.inci_name.lower() in (
            "alcohol denat", "ethanol", "sd alcohol", "denatured alcohol"
        ) or (i.irritant == "yes" and i.function == "solvent"),
        message=lambda i: (
            f"{i.inci_name} is a drying solvent/alcohol - can worsen rosacea by "
            f"disrupting barrier function and triggering vascular flushing."
        ),
    ),
    Rule(
        concern="rosacea",
        level="warning",
        kind="advice",
        profile_gate=lambda p: p.rosacea,
        predicate=lambda i: i.function == "fragrance" and i.irritant == "yes",
        message=lambda i: (
            f"{i.inci_name} is a fragrance allergen - a common rosacea trigger that "
            f"can cause flushing and inflammation."
        ),
    ),
    Rule(
        concern="rosacea",
        level="warning",
        kind="advice",
        profile_gate=lambda p: p.rosacea,
        predicate=lambda i: i.function == "exfoliant" and i.irritant == "yes",
        message=lambda i: (
            f"{i.inci_name} is an acid exfoliant - at high concentrations or low pH "
            f"these can aggravate rosacea; use only in low-strength formulas."
        ),
    ),
    Rule(
        concern="dry_skin",
        level="warning",
        kind="advice",
        profile_gate=lambda p: p.dry_skin,
        predicate=lambda i: i.inci_name.lower() in (
            "alcohol denat", "ethanol", "sd alcohol", "denatured alcohol"
        ),
        message=lambda i: f"{i.inci_name} is a drying alcohol - can strip and dehydrate dry skin.",
    ),
]


def has_risk_data(ing: "Ingredient") -> bool:
    """Return True if this ingredient has at least one curated risk flag.

    Ingredients sourced only from EU CosIng get identity and regulatory status
    but NO curated flags (comedogenic, irritant, pregnancy_safe, fungal_acne_safe
    are all null).  An ingredient that passes this test has at least one
    assessed data-point; one that doesn't is merely *recognised*, not *assessed*.
    """
    return (
        ing.comedogenic is not None
        or ing.irritant is not None
        or ing.pregnancy_safe is not None
        or ing.fungal_acne_safe is not None
        or ing.regulatory_status in ("banned", "restricted")
    )


# Beneficial ingredients worth surfacing as positives.
# Keys are stored lower-cased so lookups are case-insensitive — ingredient
# names in the DB can vary in capitalisation ("Niacinamide" vs "NIACINAMIDE").
BENEFITS: dict[str, str] = {
    "niacinamide": "helps acne, oil control and barrier",
    "hyaluronic acid": "deep hydration",
    "glycerin": "gentle hydration",
    "ceramide np": "repairs the skin barrier",
    "panthenol": "soothing and hydrating",
    "centella asiatica extract": "calming and soothing",
    "azelaic acid": "good for acne and redness",
    "zinc oxide": "broad-spectrum mineral sun protection",
    "bakuchiol": "plant-based retinol alternative; pregnancy-friendlier",
    "ascorbic acid": "Vitamin C - brightens and protects against free-radical damage",
    "squalane": "lightweight non-comedogenic hydration",
}

# Alternatives: maps (function, concern) → safer swap suggestions.
# Shown in the UI as "💡 Try instead: X, Y" on flagged findings.
ALTERNATIVES: dict[tuple[str, str], list[str]] = {
    # Acne-prone: swap comedogenic oils/emollients
    ("emollient", "acne"):      ["Squalane", "Argan Oil", "Jojoba Oil"],
    ("occlusive", "acne"):      ["Squalane", "Dimethicone"],
    # Fungal acne: swap fatty-acid-heavy emollients/emulsifiers
    ("emollient", "fungal_acne"):  ["Squalane", "Caprylic/Capric Triglyceride"],
    ("emulsifier", "fungal_acne"): ["Cetearyl Olivate", "Glyceryl Stearate Citrate"],
    # Pregnancy: swap retinoids
    ("anti-ageing", "pregnancy"):  ["Bakuchiol", "Niacinamide", "Vitamin C"],
    # Sensitive/Rosacea: swap irritants and fragrance
    ("fragrance", "sensitivity"):  ["Fragrance-free alternatives"],
    ("fragrance", "rosacea"):      ["Fragrance-free alternatives"],
    ("solvent", "sensitivity"):    ["Glycerin", "Panthenol"],
    ("solvent", "rosacea"):        ["Glycerin", "Niacinamide"],
    ("exfoliant", "sensitivity"):  ["Mandelic Acid", "Polyglutamic Acid"],
    ("exfoliant", "rosacea"):      ["Azelaic Acid", "Mandelic Acid"],
    # Sunscreens: swap chemical for mineral
    ("UV filter", "sensitivity"):  ["Zinc Oxide", "Titanium Dioxide"],
    ("UV filter", "pregnancy"):    ["Zinc Oxide", "Titanium Dioxide"],
}


def get_alternatives(function: str | None, concern: str) -> list[str]:
    """Return alternative ingredient suggestions for a given (function, concern) pair."""
    if not function:
        return []
    return ALTERNATIVES.get((function, concern), [])


# Base penalty per finding level (before position weighting).
PENALTY = {"danger": 30, "warning": 10, "good": 0}

# Small reward for genuinely beneficial ingredients (capped via GOOD_BONUS_CAP).
GOOD_BONUS = 3
GOOD_BONUS_CAP = 12

# A single danger should dominate the result, regardless of how many mild
# warnings a long "clean" label racks up. If any danger fires, the score is
# capped here.
DANGER_CAP = 50


KNOWN_FILLERS = {"aqua", "water", "glycerin", "purified water"}
KNOWN_PRESERVATIVES = {
    "phenoxyethanol", "methylparaben", "ethylparaben", "propylparaben", 
    "butylparaben", "isobutylparaben", "sodium benzoate", "potassium sorbate", 
    "benzyl alcohol", "dmdm hydantoin", "methylisothiazolinone", 
    "methylchloroisothiazolinone", "chlorphenesin", "quaternium-15",
    "diazolidinyl urea", "imidazolidinyl urea"
}


def _position_factor(index: int, total: int) -> float:
    """Ingredients are listed by descending concentration, so an issue near the
    top of the list matters more than one near the end. Front of list -> 1.0,
    tail -> 0.6. This is a concentration *proxy*, not a measurement.
    """
    if total <= 1:
        return 1.0
    return 1.0 - 0.4 * (index / (total - 1))


def evaluate(ingredients: list[Ingredient], profile: Profile) -> dict:
    findings: list[Finding] = []
    penalty = 0.0
    bonus = 0.0
    has_danger = False
    total = len(ingredients)

    avoid = {a.lower() for a in profile.avoid_list}

    for index, ing in enumerate(ingredients):
        name_lower = ing.inci_name.lower() if ing else ""
        if name_lower in KNOWN_FILLERS:
            pos = 0.5  # under-weight fillers if they trigger alerts
        elif name_lower in KNOWN_PRESERVATIVES:
            pos = 0.9  # avoid muting preservatives at the end of the label
        else:
            pos = _position_factor(index, total)

        def _record(level, concern, message, source, kind):
            nonlocal penalty, has_danger
            findings.append(Finding(ing.inci_name, level, concern, message, source, kind))
            penalty += PENALTY[level] * pos
            if level == "danger":
                has_danger = True

        # personal avoid-list (highest-priority, user-defined)
        if ing.inci_name.lower() in avoid:
            _record("danger", "personal",
                    f"{ing.inci_name} is on your personal avoid list.",
                    "user profile", "advice")

        for rule in RULES:
            if rule.profile_gate is not None and not rule.profile_gate(profile):
                continue
            if rule.predicate(ing):
                _record(rule.level, rule.concern, rule.message(ing), ing.source, rule.kind)

        # Case-insensitive BENEFITS lookup — DB names may differ in capitalisation.
        benefit_desc = BENEFITS.get(name_lower)
        if benefit_desc:
            findings.append(
                Finding(ing.inci_name, "good", "benefit",
                        f"{ing.inci_name} - {benefit_desc}.",
                        ing.source, "advice")
            )
            bonus += GOOD_BONUS

    # Fix #2: compute penalty-only score first, apply DANGER_CAP *before* adding
    # the benefit bonus so that any number of "good" ingredients can never push a
    # product with danger flags above the cap.
    # Without this fix: 2 dangers (penalty=60) + 12 bonus = 52, capped to 50.
    #                   6 warnings (penalty=60) + 12 bonus = 52 — same score!
    # With this fix:    danger score = min(100-60, DANGER_CAP) + bonus
    #                                = min(40, 50) + 12 = 52, then capped at 50.
    # Actually the correct fix is: add bonus *inside* the cap ceiling.
    base_score = 100.0 - penalty
    if has_danger:
        # Cap the raw penalty-adjusted score, THEN allow a small benefit bonus
        # — but the final score can never exceed DANGER_CAP.
        score = min(base_score, float(DANGER_CAP)) + min(bonus, GOOD_BONUS_CAP)
        score = min(score, float(DANGER_CAP))  # enforce hard ceiling
    else:
        score = base_score + min(bonus, GOOD_BONUS_CAP)
    score = int(max(0, min(100, round(score))))

    # 'indicative' is deliberate: this is guidance from a rules engine, not a
    # clinical measurement of concentration.
    return {"score": score, "score_basis": "indicative", "findings": findings}
