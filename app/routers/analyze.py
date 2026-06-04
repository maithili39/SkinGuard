import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request
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
}


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
    profile = Profile(
        pregnant=payload.profile.pregnant,
        sensitive_skin=payload.profile.sensitive_skin,
        acne_prone=payload.profile.acne_prone,
        fungal_acne=payload.profile.fungal_acne,
        rosacea=payload.profile.rosacea,
        avoid_list=payload.profile.avoid_list,
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

    result = analyze_text(db, payload.text, profile, matcher=matcher)

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
            a1, a2 = product_actives[p1], product_actives[p2]

            def _add(cat_a: str, cat_b: str, ctype: str, severity: str, msg_fn):
                if cat_a in a1 and cat_b in a2:
                    conflicts.append({
                        "product_a": p1, "product_b": p2,
                        "ingredient_a": a1[cat_a], "ingredient_b": a2[cat_b],
                        "conflict_type": ctype, "severity": severity,
                        "message": msg_fn(a1[cat_a], a2[cat_b]),
                    })
                if cat_b in a1 and cat_a in a2:
                    conflicts.append({
                        "product_a": p1, "product_b": p2,
                        "ingredient_a": a1[cat_b], "ingredient_b": a2[cat_a],
                        "conflict_type": ctype, "severity": severity,
                        "message": msg_fn(a2[cat_a], a1[cat_b]),
                    })

            _add("AHA", "Retinol", "AHA + Retinol", "danger",
                 lambda a, b: (
                     f"Alpha Hydroxy Acids (AHAs) like {a} and Retinoids like {b} both speed up "
                     f"skin cell turnover. Layering them can disrupt your skin barrier, causing redness, "
                     f"dryness, and severe irritation. Tip: Use AHA in the morning (with SPF) and Retinol at night."
                 ))

            _add("BHA", "Retinol", "BHA + Retinol", "danger",
                 lambda a, b: (
                     f"Beta Hydroxy Acids (BHAs) like {a} exfoliate deep inside pores while Retinoids like {b} "
                     f"speed up cell turnover. Combining them can cause severe dryness and over-exfoliation. "
                     f"Tip: Use BHA in the morning or alternate nights with Retinol."
                 ))

            _add("Benzoyl Peroxide", "Retinol", "Benzoyl Peroxide + Retinol", "danger",
                 lambda a, b: (
                     f"Benzoyl Peroxide oxidizes and deactivates Retinoids like {b} when applied together, "
                     f"making the Retinol ineffective and increasing irritation. "
                     f"Tip: Use Benzoyl Peroxide in the morning and Retinol at night."
                 ))

            _add("AHA", "Benzoyl Peroxide", "AHA + Benzoyl Peroxide", "danger",
                 lambda a, b: (
                     f"Benzoyl Peroxide is an oxidizing agent that can deactivate AHAs like {a} and vice-versa, "
                     f"making both less effective while dramatically increasing dryness and irritation risk. "
                     f"Tip: Use AHA at night and Benzoyl Peroxide in the morning, never together."
                 ))

            _add("Niacinamide", "Vitamin C", "Niacinamide + Vitamin C", "warning",
                 lambda a, b: (
                     f"Mixing {a} with {b} (Vitamin C) at high concentrations can form nicotinic acid, "
                     f"which may cause temporary flushing and reduce the brightening effect of Vitamin C. "
                     f"Tip: Use them in separate routines (Vitamin C AM, Niacinamide PM) or ensure "
                     f"the Vitamin C serum is fully absorbed before applying Niacinamide."
                 ))

            _add("Retinol", "Vitamin C", "Retinol + Vitamin C", "warning",
                 lambda a, b: (
                     f"Retinoids like {a} work best at a neutral pH, while Vitamin C forms like {b} require "
                     f"a low acidic pH. Layering them can reduce the effectiveness of both and significantly "
                     f"increase irritation, especially on sensitive skin. "
                     f"Tip: Use Vitamin C in the morning and Retinol at night."
                 ))

            # Vitamin C + AHA/BHA (symmetric, written explicitly to avoid lambda capture issues)
            for acid_cat in ("AHA", "BHA"):
                if "Vitamin C" in a1 and acid_cat in a2:
                    acid = a2[acid_cat]
                    conflicts.append({
                        "product_a": p1, "product_b": p2,
                        "ingredient_a": a1["Vitamin C"], "ingredient_b": acid,
                        "conflict_type": f"Vitamin C + {acid_cat}", "severity": "warning",
                        "message": (
                            f"Vitamin C like {a1['Vitamin C']} is highly acidic. Combining it with "
                            f"{acid} can destabilize the Vitamin C and trigger redness. "
                            f"Tip: Use Vitamin C in the morning and exfoliating acids in the evening."
                        ),
                    })
                if acid_cat in a1 and "Vitamin C" in a2:
                    acid = a1[acid_cat]
                    conflicts.append({
                        "product_a": p1, "product_b": p2,
                        "ingredient_a": acid, "ingredient_b": a2["Vitamin C"],
                        "conflict_type": f"{acid_cat} + Vitamin C", "severity": "warning",
                        "message": (
                            f"Vitamin C like {a2['Vitamin C']} is highly acidic. Combining it with "
                            f"{acid} can destabilize the Vitamin C and trigger redness. "
                            f"Tip: Use Vitamin C in the morning and exfoliating acids in the evening."
                        ),
                    })

                # Peptides + AHA/BHA
                if "Peptides" in a1 and acid_cat in a2:
                    acid = a2[acid_cat]
                    conflicts.append({
                        "product_a": p1, "product_b": p2,
                        "ingredient_a": a1["Peptides"], "ingredient_b": acid,
                        "conflict_type": f"Peptides + {acid_cat}", "severity": "warning",
                        "message": (
                            f"The low-pH environment created by {acid} can break down peptide bonds in "
                            f"{a1['Peptides']}, significantly reducing its anti-ageing effectiveness. "
                            f"Tip: Apply peptides and acids in separate routines, or wait 30 min between applications."
                        ),
                    })
                if acid_cat in a1 and "Peptides" in a2:
                    acid = a1[acid_cat]
                    conflicts.append({
                        "product_a": p1, "product_b": p2,
                        "ingredient_a": acid, "ingredient_b": a2["Peptides"],
                        "conflict_type": f"{acid_cat} + Peptides", "severity": "warning",
                        "message": (
                            f"The low-pH environment created by {acid} can break down peptide bonds in "
                            f"{a2['Peptides']}, significantly reducing its anti-ageing effectiveness. "
                            f"Tip: Apply peptides and acids in separate routines, or wait 30 min between applications."
                        ),
                    })

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
