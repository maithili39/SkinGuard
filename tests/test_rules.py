"""Unit tests for the rules engine — pure, no DB needed."""

from app.models import Ingredient
from app.rules import Profile, evaluate


def _ing(name, **kw):
    return Ingredient(inci_name=name, **kw)


def test_pregnancy_danger_only_when_pregnant():
    retinol = _ing("Retinol", pregnancy_safe="no")

    res_preg = evaluate([retinol], Profile(pregnant=True))
    assert any(f.concern == "pregnancy" and f.level == "danger" for f in res_preg["findings"])

    res_not = evaluate([retinol], Profile(pregnant=False))
    assert not any(f.concern == "pregnancy" for f in res_not["findings"])


def test_comedogenic_flag_for_acne_prone():
    coconut = _ing("Coconut Oil", comedogenic=4, function="emollient")
    res = evaluate([coconut], Profile(acne_prone=True))
    assert any(f.concern == "acne" for f in res["findings"])
    # not acne-prone -> no acne finding
    assert not any(f.concern == "acne" for f in evaluate([coconut], Profile())["findings"])


def test_fungal_acne_trigger():
    oil = _ing("Lauric Acid", fungal_acne_safe="no")
    res = evaluate([oil], Profile(fungal_acne=True))
    assert any(f.concern == "fungal_acne" for f in res["findings"])


def test_avoid_list_flags_danger():
    frag = _ing("Fragrance", irritant="yes")
    res = evaluate([frag], Profile(avoid_list=["fragrance"]))
    assert any(f.concern == "personal" and f.level == "danger" for f in res["findings"])


def test_score_decreases_with_dangers_and_is_bounded():
    good = _ing("Glycerin")
    assert evaluate([good], Profile())["score"] == 100

    bad = [
        _ing("Retinol", pregnancy_safe="no"),
        _ing("Hydroquinone", pregnancy_safe="no"),
        _ing("Coconut Oil", comedogenic=5),
    ]
    res = evaluate(bad, Profile(pregnant=True, acne_prone=True))
    assert 0 <= res["score"] < 100


def test_benefit_surfaced_for_known_good_ingredient():
    res = evaluate([_ing("Niacinamide")], Profile())
    assert any(f.level == "good" for f in res["findings"])


def test_single_danger_dominates_many_warnings():
    # Five mild irritants (warnings) for sensitive skin...
    warnings = [_ing(f"Irritant{i}", irritant="yes") for i in range(5)]
    score_warn = evaluate(warnings, Profile(sensitive_skin=True))["score"]
    # ...vs a single pregnancy danger.
    score_danger = evaluate([_ing("Retinol", pregnancy_safe="no")], Profile(pregnant=True))["score"]
    # The single danger must pull the score at least as low as five warnings
    # (severity dominance via DANGER_CAP).
    assert score_danger <= score_warn
    assert score_danger <= 50  # DANGER_CAP


def test_position_weighting_front_costs_more_than_back():
    # Same comedogenic ingredient, but earlier in the list = higher concentration.
    filler = [_ing(f"Filler{i}") for i in range(8)]
    bad = _ing("Coconut Oil", comedogenic=5)
    front = evaluate([bad] + filler, Profile(acne_prone=True))["score"]
    back = evaluate(filler + [bad], Profile(acne_prone=True))["score"]
    assert front < back  # a problem near the top hurts more


# ── Rosacea rules ─────────────────────────────────────────────────────────────

def test_rosacea_triggers_for_alcohol_denat():
    """Alcohol Denat should fire a rosacea warning only when profile.rosacea=True."""
    alcohol = _ing("Alcohol Denat", irritant="yes", function="solvent")

    res_rosacea = evaluate([alcohol], Profile(rosacea=True))
    concerns = {f.concern for f in res_rosacea["findings"]}
    assert "rosacea" in concerns, "Expected rosacea finding for Alcohol Denat"

    res_no_rosacea = evaluate([alcohol], Profile(rosacea=False))
    assert not any(f.concern == "rosacea" for f in res_no_rosacea["findings"]), (
        "Rosacea rule should not fire when profile.rosacea=False"
    )


def test_rosacea_triggers_for_fragrance_allergen():
    """Fragrance allergens (irritant=yes, function=fragrance) should fire rosacea warning."""
    fragrance = _ing("Limonene", irritant="yes", function="fragrance")

    res = evaluate([fragrance], Profile(rosacea=True))
    assert any(f.concern == "rosacea" for f in res["findings"])


def test_rosacea_triggers_for_acid_exfoliant():
    """Acid exfoliants (irritant=yes, function=exfoliant) should warn rosacea users."""
    glycolic = _ing("Glycolic Acid", irritant="yes", function="exfoliant")

    res = evaluate([glycolic], Profile(rosacea=True))
    assert any(f.concern == "rosacea" for f in res["findings"])

    # Should NOT fire for non-rosacea users (the sensitivity rule is separate)
    res_normal = evaluate([glycolic], Profile(rosacea=False, sensitive_skin=False))
    assert not any(f.concern == "rosacea" for f in res_normal["findings"])


def test_rosacea_rule_does_not_fire_for_safe_ingredients():
    """A benign humectant should not trigger any rosacea warning."""
    glycerin = _ing("Glycerin", irritant="no", function="humectant")
    res = evaluate([glycerin], Profile(rosacea=True))
    assert not any(f.concern == "rosacea" for f in res["findings"])


def test_trimester_specific_pregnancy_warnings():
    """Test pregnancy classification levels (danger for 'no', warning for 'caution')."""
    avoid_ing = _ing("AvoidIngredient", pregnancy_safe="no")
    caution_ing = _ing("CautionIngredient", pregnancy_safe="caution")

    res_avoid = evaluate([avoid_ing], Profile(pregnant=True))
    avoid_finding = next(f for f in res_avoid["findings"] if f.concern == "pregnancy")
    assert avoid_finding.level == "danger"
    assert "Avoid entirely" in avoid_finding.message

    res_caution = evaluate([caution_ing], Profile(pregnant=True))
    caution_finding = next(f for f in res_caution["findings"] if f.concern == "pregnancy")
    assert caution_finding.level == "warning"
    assert "Limited data" in caution_finding.message


def test_weight_scaling_adjustments():
    """Test that fillers are under-weighted (0.5) and preservatives are preserved (0.9) in safety score calculation."""
    # A standard irritant at position 0 should have pos = 1.0.
    # Penalty: 10 * 1.0 = 10 -> Score: 90
    normal = _ing("NormalIngredient", irritant="yes")
    assert evaluate([normal], Profile(sensitive_skin=True))["score"] == 90

    # A filler (Purified Water) should have pos = 0.5.
    # Penalty: 10 * 0.5 = 5 -> Score: 95
    filler = _ing("Purified Water", irritant="yes")
    assert evaluate([filler], Profile(sensitive_skin=True))["score"] == 95

    # A preservative (Phenoxyethanol) should have pos = 0.9.
    # Penalty: 10 * 0.9 = 9 -> Score: 91
    preservative = _ing("Phenoxyethanol", irritant="yes")
    assert evaluate([preservative], Profile(sensitive_skin=True))["score"] == 91


