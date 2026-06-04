"""Matcher + end-to-end analysis tests against an isolated in-memory DB."""

import csv
import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Ingredient, Alias
from app.matching import Matcher, normalize, split_ingredient_list
from app.analysis import analyze_text
from app.rules import Profile

CURATED = os.path.join("data", "curated", "ingredient_flags.csv")


@pytest.fixture(scope="module")
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()

    seen_aliases: set = set()
    with open(CURATED, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            comedo = row["comedogenic"].strip()
            ing = Ingredient(
                inci_name=row["inci_name"].strip(),
                function=row["function"].strip() or None,
                comedogenic=int(comedo) if comedo.isdigit() else None,
                fungal_acne_safe=row["fungal_acne_safe"].strip() or None,
                pregnancy_safe=row["pregnancy_safe"].strip() or None,
                irritant=row["irritant"].strip() or None,
                source=row["source"].strip() or None,
            )
            s.add(ing)
            s.flush()
            names = [ing.inci_name] + [a for a in row["aliases"].split("|") if a.strip()]
            for n in names:
                key = n.strip().lower()
                if key and key not in seen_aliases:
                    seen_aliases.add(key)
                    s.add(Alias(name=n.strip(), ingredient=ing))
    s.commit()
    yield s
    s.close()


def test_normalize_strips_noise():
    assert normalize("Parfum (Fragrance)*") == "parfum"
    assert normalize("Aqua/Water") == "aqua water"


def test_split_list():
    # Real multi-char ingredient tokens split on comma/semicolon/newline.
    assert split_ingredient_list("Aqua, Glycerin; Niacinamide\nRetinol") == [
        "Aqua", "Glycerin", "Niacinamide", "Retinol",
    ]


def test_split_list_strips_header_and_junk():
    # 'Ingredients:' header, single chars, pure numbers and marketing claims dropped.
    out = split_ingredient_list("Ingredients: Aqua, 5%, x, Vegan, Glycerin")
    assert out == ["Aqua", "Glycerin"]


def test_exact_match_full_confidence(db):
    m = Matcher(db).match_token("Niacinamide")
    assert m.status == "matched" and m.confidence == 100


def test_alias_match(db):
    m = Matcher(db).match_token("Vitamin B3")
    assert m.matched_inci == "Niacinamide"


def test_fuzzy_typo_match(db):
    m = Matcher(db).match_token("Niacinmide")  # missing 'a'
    assert m.status == "matched" and m.matched_inci == "Niacinamide"


def test_unmatched_is_reported_not_dropped(db):
    m = Matcher(db).match_token("Zxqwerty Unobtanium")
    assert m.status == "unmatched" and m.matched_inci is None


def test_end_to_end_analysis(db):
    text = "Aqua, Niacinamide, Retinol, Coconut Oil, Parfum"
    res = analyze_text(db, text, Profile(pregnant=True, acne_prone=True, fungal_acne=True))
    assert res["coverage_percent"] == 100
    assert res["safety_score"] < 100
    concerns = {f["concern"] for f in res["findings"]}
    assert "pregnancy" in concerns and "acne" in concerns
    # every found ingredient carries a plain-language explanation
    assert all(fi["explanation"] for fi in res["found_ingredients"])


# ── match_method field ────────────────────────────────────────────────────────

def test_exact_match_reports_method_exact(db):
    """Direct alias hits must carry match_method='exact'."""
    m = Matcher(db).match_token("Niacinamide")
    assert m.match_method == "exact"


def test_fuzzy_match_reports_method_fuzzy(db):
    """Fuzzy matches (typos, partial names) must carry match_method='fuzzy'."""
    m = Matcher(db).match_token("Niacinmide")  # deliberate typo
    assert m.status == "matched"
    assert m.match_method == "fuzzy"


def test_unmatched_reports_method_none_or_fuzzy(db):
    """Completely unrecognised tokens should still have a match_method set."""
    m = Matcher(db).match_token("Zxqwerty9999Unobtanium")
    assert m.status == "unmatched"
    assert m.match_method in ("none", "fuzzy")


# ── Rosacea integration through analyze_text ─────────────────────────────────

def test_rosacea_concern_in_analysis(db):
    """Alcohol Denat on a label with rosacea profile should produce a rosacea finding."""
    # 'Alcohol Denat' is in the curated CSV with irritant=yes, function=solvent
    text = "Aqua, Glycerin, Alcohol Denat"
    res = analyze_text(db, text, Profile(rosacea=True))
    concerns = {f["concern"] for f in res["findings"]}
    assert "rosacea" in concerns, (
        f"Expected 'rosacea' in findings, got: {concerns!r}\n"
        f"Findings: {res['findings']}"
    )


def test_rosacea_not_triggered_without_profile(db):
    """Same label without rosacea profile should NOT show rosacea findings."""
    text = "Aqua, Glycerin, Alcohol Denat"
    res = analyze_text(db, text, Profile(rosacea=False))
    assert not any(f["concern"] == "rosacea" for f in res["findings"])

