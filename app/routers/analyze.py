import logging
from dataclasses import dataclass
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.analysis import analyze_text
from app.auth import get_current_user
from app.cache import get_cached, hash_text, make_key, set_cached
from app.database import get_db
from app.deps import _limit, get_matcher, hybrid_rate_limit_key, limiter
from app.matching import Matcher
from app.models import User
from app.rules import Profile
from app.schemas import AnalyzeIn, RoutineAnalyzeIn
from app import users as users_svc

logger = logging.getLogger("skinguard.analyze")

router = APIRouter(tags=["analysis"])

# Active ingredients by category — used for routine conflict detection.
# ALL values are stored lowercase so the comparison in _actives_for is always
# apples-to-apples (matched_inci.lower() vs lowercase inci_set members).
_CATEGORIES: dict[str, set[str]] = {
    "AHA": {"glycolic acid", "lactic acid", "mandelic acid", "citric acid", "malic acid", "tartaric acid"},
    "BHA": {"salicylic acid", "betaine salicylate"},
    "Retinol": {
        "retinol", "retinyl palmitate", "retinal", "retinaldehyde",
        "hydroxypinacolone retinoate", "adapalene", "tretinoin",
    },
    "Benzoyl Peroxide": {"benzoyl peroxide"},
    "Vitamin C": {
        "ascorbic acid", "3-o-ethyl ascorbic acid", "ascorbyl glucoside",
        "tetrahexyldecyl ascorbate", "sodium ascorbyl phosphate",
        "magnesium ascorbyl phosphate", "ascorbyl palmitate",
    },
    "Niacinamide": {"niacinamide", "nicotinamide"},
    "Peptides": {
        "palmitoyl tripeptide-1", "palmitoyl tetrapeptide-7", "palmitoyl pentapeptide-4",
        "acetyl hexapeptide-3", "acetyl hexapeptide-8", "sh-oligopeptide-1",
        "copper tripeptide-1", "dipeptide diaminobutyroyl benzylamide diacetate",
        "tripeptide-1", "tetrapeptide-21",
    },
    "Fermented": {
        "bifida ferment lysate", "galactomyces ferment filtrate", "saccharomyces ferment filtrate",
        "lactobacillus ferment", "yeast ferment extract", "bifida ferment filtrate",
        "saccharomyces ferment", "lactobacillus ferment filtrate"
    },
}
# Defensive: normalise all inci_set members to lowercase at import time so a
# future maintainer adding a mixed-case entry won't silently break detection.
_CATEGORIES = {cat: {n.lower() for n in names} for cat, names in _CATEGORIES.items()}


# ── Declarative conflict rules ────────────────────────────────────────────────
# Each rule pairs two active-ingredient categories. `template` is formatted with
# {a} = the cat_a ingredient and {b} = the cat_b ingredient. When `directional`
# is True the conflict_type reflects which product holds which active
# (e.g. "AHA + Vitamin C" vs "Vitamin C + AHA"); otherwise it is fixed.

@dataclass(frozen=True)
class PairRule:
    cat_a: str
    cat_b: str
    severity: str
    template: str
    name: str | None = None  # fixed conflict_type; defaults to "cat_a + cat_b"
    directional: bool = False


# Cross-category conflicts with a fixed (symmetric) label.
_PAIR_RULES: list[PairRule] = [
    PairRule("AHA", "Retinol", "danger",
             "Alpha Hydroxy Acids (AHAs) like {a} and Retinoids like {b} both speed up "
             "skin cell turnover. Layering them can disrupt your skin barrier, causing redness, "
             "dryness, and severe irritation. Tip: Use AHA in the morning (with SPF) and Retinol at night."),
    PairRule("BHA", "Retinol", "danger",
             "Beta Hydroxy Acids (BHAs) like {a} exfoliate deep inside pores while Retinoids like {b} "
             "speed up cell turnover. Combining them can cause severe dryness and over-exfoliation. "
             "Tip: Use BHA in the morning or alternate nights with Retinol."),
    PairRule("Benzoyl Peroxide", "Retinol", "danger",
             "Benzoyl Peroxide oxidizes and deactivates Retinoids like {b} when applied together, "
             "making the Retinol ineffective and increasing irritation. "
             "Tip: Use Benzoyl Peroxide in the morning and Retinol at night."),
    PairRule("AHA", "Benzoyl Peroxide", "danger",
             "Benzoyl Peroxide is an oxidizing agent that can deactivate AHAs like {a} and vice-versa, "
             "making both less effective while dramatically increasing dryness and irritation risk. "
             "Tip: Use AHA at night and Benzoyl Peroxide in the morning, never together."),
    PairRule("Niacinamide", "Vitamin C", "warning",
             "Mixing {a} with {b} (Vitamin C) at high concentrations can form nicotinic acid, "
             "which may cause temporary flushing and reduce the brightening effect of Vitamin C. "
             "Tip: Use them in separate routines (Vitamin C AM, Niacinamide PM) or ensure "
             "the Vitamin C serum is fully absorbed before applying Niacinamide."),
    PairRule("Retinol", "Vitamin C", "warning",
             "Retinoids like {a} work best at a neutral pH, while Vitamin C forms like {b} require "
             "a low acidic pH. Layering them can reduce the effectiveness of both and significantly "
             "increase irritation, especially on sensitive skin. "
             "Tip: Use Vitamin C in the morning and Retinol at night."),
    PairRule("AHA", "BHA", "warning",
             "Layering AHA ({a}) and BHA ({b}) in the same routine increases the risk of over-exfoliation, "
             "dryness, and breaking your skin's moisture barrier. "
             "Tip: Alternate their use on different days, or use BHA in the morning and AHA at night.",
             name="Multiple Exfoliants"),
    PairRule("Fermented", "AHA", "warning",
             "Combining fermented ingredients ({a}) with low-pH Alpha Hydroxy Acids ({b}) can cause "
             "temporary skin irritation, stinging, or redness, as the low pH can alter the active ferment proteins. "
             "Tip: Use your fermented essence first, wait 15-20 minutes, or apply them in separate routines."),
    PairRule("Fermented", "BHA", "warning",
             "Combining fermented ingredients ({a}) with low-pH Beta Hydroxy Acids ({b}) can lead to "
             "irritation or compromise the soothing benefits of the ferment. "
             "Tip: Alternate days, or use BHA in the morning and fermented products at night."),
    PairRule("Fermented", "Vitamin C", "warning",
             "Combining fermented ingredients ({a}) with highly acidic Vitamin C ({b}) can disrupt "
             "the stability of both actives and cause skin flushing or irritation. "
             "Tip: Apply Vitamin C in the morning and fermented ingredients at night."),
]

# Conflicts whose label depends on which product holds which active.
_DIRECTIONAL_RULES: list[PairRule] = [
    PairRule("Vitamin C", "AHA", "warning",
             "Vitamin C like {a} is highly acidic. Combining it with "
             "{b} can destabilize the Vitamin C and trigger redness. "
             "Tip: Use Vitamin C in the morning and exfoliating acids in the evening.",
             directional=True),
    PairRule("Peptides", "AHA", "warning",
             "The low-pH environment created by {b} can break down peptide bonds in "
             "{a}, significantly reducing its anti-ageing effectiveness. "
             "Tip: Apply peptides and acids in separate routines, or wait 30 min between applications.",
             directional=True),
    PairRule("Vitamin C", "BHA", "warning",
             "Vitamin C like {a} is highly acidic. Combining it with "
             "{b} can destabilize the Vitamin C and trigger redness. "
             "Tip: Use Vitamin C in the morning and exfoliating acids in the evening.",
             directional=True),
    PairRule("Peptides", "BHA", "warning",
             "The low-pH environment created by {b} can break down peptide bonds in "
             "{a}, significantly reducing its anti-ageing effectiveness. "
             "Tip: Apply peptides and acids in separate routines, or wait 30 min between applications.",
             directional=True),
]

# Conflicts triggered when both products carry the SAME category. The template
# additionally references {pa}/{pb} — the two product names.
_SAME_CATEGORY_RULES: list[tuple[str, str, str, str]] = [
    ("AHA", "Double AHA Exfoliation", "warning",
     "Both products contain Alpha Hydroxy Acids (AHAs): {a} in {pa} and {b} in {pb}. "
     "Using multiple AHA products together can cause severe over-exfoliation and barrier damage. "
     "Tip: Choose only one AHA product per routine, or use them on separate days."),
    ("BHA", "Double BHA Exfoliation", "warning",
     "Both products contain Beta Hydroxy Acids (BHAs): {a} in {pa} and {b} in {pb}. "
     "Layering multiple BHA products can severely dry out your skin and cause irritation. "
     "Tip: Use only one BHA product in your routine."),
]


def _conflict(pa: str, pb: str, ia: str, ib: str, ctype: str, severity: str, message: str) -> dict:
    return {
        "product_a": pa, "product_b": pb,
        "ingredient_a": ia, "ingredient_b": ib,
        "conflict_type": ctype, "severity": severity,
        "message": message,
    }


def _emit_pair_conflicts(
    rule: PairRule, p1: str, a1: dict, p2: str, a2: dict, out: list[dict]
) -> None:
    """Apply one cross-category rule to the ordered product pair (p1, p2)."""
    ca, cb = rule.cat_a, rule.cat_b
    fixed = rule.name or f"{ca} + {cb}"

    # Direction 1: p1 holds cat_a, p2 holds cat_b.
    if ca in a1 and cb in a2:
        cat_a_ing, cat_b_ing = a1[ca], a2[cb]
        ctype = f"{ca} + {cb}" if rule.directional else fixed
        out.append(_conflict(p1, p2, cat_a_ing, cat_b_ing, ctype, rule.severity,
                             rule.template.format(a=cat_a_ing, b=cat_b_ing)))

    # Direction 2: p1 holds cat_b, p2 holds cat_a.
    if cb in a1 and ca in a2:
        cat_a_ing, cat_b_ing = a2[ca], a1[cb]
        ctype = f"{cb} + {ca}" if rule.directional else fixed
        out.append(_conflict(p1, p2, a1[cb], a2[ca], ctype, rule.severity,
                             rule.template.format(a=cat_a_ing, b=cat_b_ing)))


def _detect_conflicts(p1: str, a1: dict, p2: str, a2: dict) -> list[dict]:
    """All layering conflicts between two products, in a stable rule order."""
    out: list[dict] = []
    for rule in _PAIR_RULES:
        _emit_pair_conflicts(rule, p1, a1, p2, a2, out)
    for cat, ctype, severity, template in _SAME_CATEGORY_RULES:
        if cat in a1 and cat in a2:
            out.append(_conflict(
                p1, p2, a1[cat], a2[cat], ctype, severity,
                template.format(a=a1[cat], b=a2[cat], pa=p1, pb=p2),
            ))
    for rule in _DIRECTIONAL_RULES:
        _emit_pair_conflicts(rule, p1, a1, p2, a2, out)
    return out


@router.post("/analyze")
@limiter.limit(_limit("30/minute"), key_func=hybrid_rate_limit_key)
def analyze(
    request: Request,
    payload: AnalyzeIn,
    db: Session = Depends(get_db),
    matcher: Matcher = Depends(get_matcher),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Analyze an ingredient list. Rate-limited to 30 req/min per user/IP."""
    # Fix #3 (partial): pass ALL profile fields — the original code silently
    # dropped dry_skin, oily_skin, combination_skin, normal_skin and avoid_list,
    # meaning rules gated on those fields NEVER fired.
    profile = Profile(
        pregnant=payload.profile.pregnant,
        sensitive_skin=payload.profile.sensitive_skin,
        acne_prone=payload.profile.acne_prone,
        fungal_acne=payload.profile.fungal_acne,
        rosacea=payload.profile.rosacea,
        dry_skin=payload.profile.dry_skin,
        oily_skin=payload.profile.oily_skin,
        combination_skin=payload.profile.combination_skin,
        normal_skin=payload.profile.normal_skin,
        # Lowercase each entry so avoid_list matching is case-insensitive.
        avoid_list=[name.lower() for name in (payload.profile.avoid_list or [])],
    )

    _cache_key: str | None = None
    if current_user is None and not payload.user_email:
        profile_sig = hash_text(
            f"{payload.profile.pregnant}{payload.profile.sensitive_skin}"
            f"{payload.profile.acne_prone}{payload.profile.fungal_acne}"
            f"{payload.profile.rosacea}{''.join(sorted(payload.profile.avoid_list or []))}"
        )
        _cache_key = make_key("analyze", hash_text(payload.text), profile_sig)
        cached = get_cached(_cache_key)
        if cached is not None:
            logger.debug("Cache HIT for analyze key=%s", _cache_key)
            return cached

    # Fix #7: wrap the core analysis in try/except so that any DB or matcher
    # error returns a safe JSON 500 instead of exposing a raw Python stack trace.
    try:
        result = analyze_text(db, payload.text, profile, matcher=matcher)
    except Exception as exc:
        logger.exception("analyze_text failed for user=%s: %s", getattr(current_user, "email", "anon"), exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Analysis failed due to an internal error. Please try again or contact support.",
        )

    save_user = current_user
    if save_user is None and payload.user_email:
        save_user = users_svc.get_or_create_user(db, payload.user_email)

    if save_user:
        users_svc.save_scan(db, save_user, payload.text, result)
        logger.info("Saved scan for %s (score=%s)", save_user.email, result["safety_score"])
    elif _cache_key:
        set_cached(_cache_key, result, ttl=300)
        logger.debug("Cache SET analyze key=%s", _cache_key)

    return result


@router.post("/analyze/routine")
@limiter.limit(_limit("10/minute"))
def analyze_routine(
    request: Request,
    payload: RoutineAnalyzeIn,
    db: Session = Depends(get_db),
    matcher: Matcher = Depends(get_matcher),
):
    """Check a multi-product routine for dangerous active ingredient layering conflicts."""

    def _actives_for(text: str) -> dict[str, str]:
        matches = matcher.match_list(text)
        result: dict[str, str] = {}
        for m in matches:
            if m.status == "matched" and m.matched_inci:
                name_lower = m.matched_inci.lower()
                for cat, inci_set in _CATEGORIES.items():
                    if name_lower in inci_set:
                        result[cat] = m.matched_inci
        return result

    product_actives = {prod.name: _actives_for(prod.text) for prod in payload.products}
    conflicts: list[dict] = []
    prod_names = list(product_actives.keys())

    for i in range(len(prod_names)):
        for j in range(i + 1, len(prod_names)):
            p1, p2 = prod_names[i], prod_names[j]
            conflicts.extend(
                _detect_conflicts(p1, product_actives[p1], p2, product_actives[p2])
            )

    if not conflicts:
        summary = "No active ingredient conflicts detected. Your routine layers safely!"
        compatible = True
    else:
        num_danger = sum(1 for c in conflicts if c["severity"] == "danger")
        num_warning = sum(1 for c in conflicts if c["severity"] == "warning")
        summary = (
            f"Routine analysis found {num_danger} high-risk (danger) "
            f"and {num_warning} moderate-risk (warning) layering conflicts."
        )
        compatible = False

    return {
        "compatible": compatible,
        "summary": summary,
        "product_actives": product_actives,
        "conflicts": conflicts,
    }
