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
