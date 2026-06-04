"""Unified Matcher Evaluation Harness.

Evaluates both the RapidFuzz-only Matcher and the hybrid EmbeddingMatcher against:
  1. The canonical curated ingredient dataset (data/curated/ingredient_flags.csv) -> Precision/Recall/F1 metrics.
  2. Messy real-world labels from Open Beauty Facts (data/test/obf_products.jsonl) -> Token resolution rates.

Run:
    python -m scripts.evaluate_matcher
    python -m scripts.evaluate_matcher --fuzzy-only
"""

import argparse
import csv
import json
import os
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Allow running from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import Base
from app.models import Ingredient, Alias
from app.matching import Matcher

CURATED_CSV = os.path.join("data", "curated", "ingredient_flags.csv")
TEST_JSONL = os.path.join("data", "test", "obf_products.jsonl")
OUTPUT_DIR  = os.path.join("data", "evaluation")
OUTPUT_JSON = os.path.join(OUTPUT_DIR, "matcher_results.json")

THRESHOLDS = [80, 85, 90, 95]


# ── Gold set loader ────────────────────────────────────────────────────────────

@dataclass
class GoldEntry:
    inci_name: str
    aliases: list[str] = field(default_factory=list)


def load_gold_set() -> list[GoldEntry]:
    entries = []
    if not os.path.exists(CURATED_CSV):
        return entries
    with open(CURATED_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            inci = row["inci_name"].strip()
            if not inci:
                continue
            aliases = [a.strip() for a in row.get("aliases", "").split("|") if a.strip()]
            entries.append(GoldEntry(inci_name=inci, aliases=aliases))
    return entries


# ── Canonical Evaluation Metrics ───────────────────────────────────────────────

@dataclass
class MatchResult:
    query: str
    gold_inci: str
    predicted_inci: str | None
    confidence: int
    status: str
    match_method: str
    correct: bool


def evaluate_canonical(matcher, gold: list[GoldEntry], label: str) -> dict:
    """Run the gold set through `matcher` and compute metrics at each threshold."""
    all_results: list[MatchResult] = []

    for entry in gold:
        # Test the canonical INCI name itself, plus each alias
        queries = [entry.inci_name] + entry.aliases
        for q in queries:
            m = matcher.match_token(q)
            correct = (
                m.status == "matched"
                and m.matched_inci.lower() == entry.inci_name.lower()
            )
            all_results.append(MatchResult(
                query=q,
                gold_inci=entry.inci_name,
                predicted_inci=m.matched_inci,
                confidence=m.confidence,
                status=m.status,
                match_method=getattr(m, "match_method", "fuzzy"),
                correct=correct,
            ))

    # Method breakdown
    by_method: dict[str, dict] = {}
    for r in all_results:
        meth = r.match_method
        if meth not in by_method:
            by_method[meth] = {"total": 0, "correct": 0}
        by_method[meth]["total"] += 1
        if r.correct:
            by_method[meth]["correct"] += 1

    # Per-threshold metrics
    threshold_metrics: list[dict] = []
    for thresh in THRESHOLDS:
        tp = sum(1 for r in all_results if r.confidence >= thresh and r.correct)
        fp = sum(1 for r in all_results if r.confidence >= thresh and not r.correct)
        fn = sum(1 for r in all_results if r.confidence < thresh and r.correct)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1        = (2 * precision * recall / (precision + recall)
                     if (precision + recall) > 0 else 0.0)
        threshold_metrics.append({
            "threshold": thresh,
            "tp": tp, "fp": fp, "fn": fn,
            "precision": round(precision, 4),
            "recall":    round(recall, 4),
            "f1":        round(f1, 4),
        })

    return {
        "matcher": label,
        "total_queries": len(all_results),
        "by_method": by_method,
        "threshold_metrics": threshold_metrics,
    }


def print_canonical_table(results: list[dict]) -> None:
    print("\n## Matcher Performance on Canonical Curated Set\n")
    print("| Matcher | Threshold | Precision | Recall | F1 | TP | FP | FN |")
    print("|---------|-----------|-----------|--------|----|----|----|----|")
    for r in results:
        for m in r["threshold_metrics"]:
            print(
                f"| {r['matcher']:<20} | {m['threshold']:>9} "
                f"| {m['precision']:>9.3f} | {m['recall']:>6.3f} "
                f"| {m['f1']:>6.3f} | {m['tp']:>4} | {m['fp']:>4} | {m['fn']:>4} |"
            )


# ── Real Messy Label Evaluation ────────────────────────────────────────────────

def evaluate_real(fuzzy_matcher, embed_matcher, has_embed: bool) -> None:
    """Evaluate matchers against messy real-world labels from OBF."""
    if not os.path.exists(TEST_JSONL):
        print(f"\n  (Real OBF messy labels file not found at {TEST_JSONL} — skipping.)")
        return

    products = []
    with open(TEST_JSONL, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                products.append(json.loads(line))

    eval_sample = products[:50]
    print(f"\nEvaluating on {len(eval_sample)} real-world messy OBF products...")

    fuzzy_stats = {"total_tokens": 0, "matched": 0, "unmatched": 0, "methods": {}}
    embed_stats = {"total_tokens": 0, "matched": 0, "unmatched": 0, "methods": {}}

    for prod in eval_sample:
        text = prod["ingredients_text"]
        if not text:
            continue

        # Baseline
        fuzzy_matches = fuzzy_matcher.match_list(text)
        for m in fuzzy_matches:
            fuzzy_stats["total_tokens"] += 1
            if m.status == "matched":
                fuzzy_stats["matched"] += 1
            else:
                fuzzy_stats["unmatched"] += 1
            method = getattr(m, "match_method", "fuzzy")
            fuzzy_stats["methods"][method] = fuzzy_stats["methods"].get(method, 0) + 1

        # Hybrid embedding
        if has_embed and embed_matcher:
            embed_matches = embed_matcher.match_list(text)
            for m in embed_matches:
                embed_stats["total_tokens"] += 1
                if m.status == "matched":
                    embed_stats["matched"] += 1
                else:
                    embed_stats["unmatched"] += 1
                method = getattr(m, "match_method", "embedding")
                embed_stats["methods"][method] = embed_stats["methods"].get(method, 0) + 1

    print("\n## Matcher Performance on Real-World Labels\n")
    print("| Matcher | Total Tokens | Matched | Unmatched | Match Rate |")
    print("|---------|--------------|---------|-----------|------------|")

    f_rate = fuzzy_stats["matched"] / fuzzy_stats["total_tokens"] if fuzzy_stats["total_tokens"] else 0
    print(f"| RapidFuzz (baseline) | {fuzzy_stats['total_tokens']:>12} | {fuzzy_stats['matched']:>7} | {fuzzy_stats['unmatched']:>9} | {f_rate:>10.2%} |")

    if has_embed:
        e_rate = embed_stats["matched"] / embed_stats["total_tokens"] if embed_stats["total_tokens"] else 0
        print(f"| Embedding+Fuzzy (hybrid) | {embed_stats['total_tokens']:>12} | {embed_stats['matched']:>7} | {embed_stats['unmatched']:>9} | {e_rate:>10.2%} |")

    print("\n### Resolution Method Breakdown (Real Labels)\n")
    print("| Matcher | Method | Count | Percentage |")
    print("|---------|--------|-------|------------|")
    for method, count in fuzzy_stats["methods"].items():
        pct = count / fuzzy_stats["total_tokens"] if fuzzy_stats["total_tokens"] else 0
        print(f"| RapidFuzz | {method:<10} | {count:>5} | {pct:>10.2%} |")

    if has_embed:
        for method, count in embed_stats["methods"].items():
            pct = count / embed_stats["total_tokens"] if embed_stats["total_tokens"] else 0
            print(f"| Embedding+Fuzzy | {method:<10} | {count:>5} | {pct:>10.2%} |")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Evaluate SkinGuard matcher accuracy.")
    parser.add_argument("--fuzzy-only", action="store_true", help="Skip EmbeddingMatcher.")
    args = parser.parse_args()

    print("Loading gold set from curated CSV...")
    gold = load_gold_set()
    if not gold:
        print("Curated CSV dataset is empty or not found.")
        return

    print(f"  {len(gold)} gold ingredients, "
          f"{sum(len(e.aliases) for e in gold)} aliases -> "
          f"{sum(1 + len(e.aliases) for e in gold)} total queries")

    # Spin up temp DB seeded with curated CSV
    tmp = tempfile.mktemp(suffix=".db")
    engine = create_engine(f"sqlite:///{tmp}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        seen = set()
        for entry in gold:
            ing = Ingredient(inci_name=entry.inci_name)
            db.add(ing)
            db.flush()
            for name in [entry.inci_name] + entry.aliases:
                key = name.strip().lower()
                if key and key not in seen:
                    seen.add(key)
                    db.add(Alias(name=name.strip(), ingredient=ing))
        db.commit()

        # 1. Evaluate on Canonical Curated Set
        fuzzy_matcher = Matcher(db)
        fuzzy_results = evaluate_canonical(fuzzy_matcher, gold, "RapidFuzz")
        
        all_eval_results = [fuzzy_results]
        embed_matcher = None
        has_embed = False

        if not args.fuzzy_only:
            print("\nEvaluating EmbeddingMatcher (sentence-transformers)...")
            try:
                from app.embedding_matcher import EmbeddingMatcher
                embed_matcher = EmbeddingMatcher.build(db, fuzzy_matcher)
                embed_results = evaluate_canonical(embed_matcher, gold, "Embedding+Fuzzy")
                all_eval_results.append(embed_results)
                has_embed = True
            except ImportError:
                print("  sentence-transformers not installed — skipping embedding evaluation.")
            except Exception as exc:
                print(f"  EmbeddingMatcher build failed: {exc} — skipping.")

        print_canonical_table(all_eval_results)

        # Save JSON
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
            json.dump(all_eval_results, f, indent=2)

        # 2. Evaluate on Real Messy Labels
        evaluate_real(fuzzy_matcher, embed_matcher, has_embed)

    finally:
        db.close()
        engine.dispose()
        try:
            os.unlink(tmp)
        except Exception:
            pass


if __name__ == "__main__":
    main()
