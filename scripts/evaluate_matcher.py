"""Matcher Precision / Recall / F1 Evaluation Harness.

Evaluates both the RapidFuzz-only Matcher and the hybrid EmbeddingMatcher
against the curated ingredient dataset (data/curated/ingredient_flags.csv),
which serves as the gold-standard test set.

Methodology:
  For each curated ingredient + all its aliases:
    - Feed the INCI name / alias to the matcher as if it appeared on a label.
    - A match is a TRUE POSITIVE if the resolved ingredient_id matches the
      gold ingredient_id from the curated CSV.
    - An unmatched token is a FALSE NEGATIVE.
    - A match to the wrong ingredient is a FALSE POSITIVE.

Reports:
  - Precision, Recall, F1 at confidence thresholds: 80, 85, 90, 95
  - Breakdown by match_method (exact / embedding / fuzzy)
  - Saves results to data/evaluation/matcher_results.json
  - Prints a markdown table suitable for copy-paste into the project report.

Run:
    python -m scripts.evaluate_matcher
    python -m scripts.evaluate_matcher --fuzzy-only   # skip embedding matcher
"""

import argparse
import csv
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Allow running from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

CURATED_CSV = os.path.join("data", "curated", "ingredient_flags.csv")
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
    with open(CURATED_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            inci = row["inci_name"].strip()
            if not inci:
                continue
            aliases = [a.strip() for a in row.get("aliases", "").split("|") if a.strip()]
            entries.append(GoldEntry(inci_name=inci, aliases=aliases))
    return entries


# ── Metrics ────────────────────────────────────────────────────────────────────

@dataclass
class MatchResult:
    query: str
    gold_inci: str
    predicted_inci: str | None
    confidence: int
    status: str
    match_method: str
    correct: bool


def evaluate_matcher(matcher, gold: list[GoldEntry], label: str) -> dict:
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

    # Method breakdown (over all results, confidence-agnostic)
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
        # At this threshold: "predicted positive" = confidence >= thresh
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


# ── Report printer ─────────────────────────────────────────────────────────────

def print_markdown_table(results: list[dict]) -> None:
    print("\n## SkinGuard Matcher Evaluation Results\n")
    print("| Matcher | Threshold | Precision | Recall | F1 | TP | FP | FN |")
    print("|---------|-----------|-----------|--------|----|----|----|----|")
    for r in results:
        for m in r["threshold_metrics"]:
            print(
                f"| {r['matcher']:<20} | {m['threshold']:>9} "
                f"| {m['precision']:>9.3f} | {m['recall']:>6.3f} "
                f"| {m['f1']:>6.3f} | {m['tp']:>4} | {m['fp']:>4} | {m['fn']:>4} |"
            )

    print("\n### Match Method Breakdown\n")
    print("| Matcher | Method | Queries | Correct | Accuracy |")
    print("|---------|--------|---------|---------|----------|")
    for r in results:
        for method, stats in r["by_method"].items():
            acc = stats["correct"] / stats["total"] if stats["total"] else 0
            print(
                f"| {r['matcher']:<20} | {method:<10} "
                f"| {stats['total']:>7} | {stats['correct']:>7} | {acc:>8.3f} |"
            )


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Evaluate SkinGuard matcher accuracy.")
    parser.add_argument("--fuzzy-only", action="store_true",
                        help="Skip EmbeddingMatcher (faster, no model download).")
    args = parser.parse_args()

    # Bootstrap DB in-memory from curated CSV (same as tests)
    import tempfile
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.database import Base
    from app.models import Ingredient, Alias
    from app.matching import Matcher

    print("Loading gold set from curated CSV...")
    gold = load_gold_set()
    print(f"  {len(gold)} gold ingredients, "
          f"{sum(len(e.aliases) for e in gold)} aliases -> "
          f"{sum(1 + len(e.aliases) for e in gold)} total queries")

    # Spin up a temp DB seeded with the curated CSV
    tmp = tempfile.mktemp(suffix=".db")
    engine = create_engine(f"sqlite:///{tmp}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    seen: set[str] = set()
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

    all_eval_results = []

    # Evaluate RapidFuzz matcher
    print("\nEvaluating RapidFuzz (baseline) matcher...")
    fuzzy_matcher = Matcher(db)
    fuzzy_results = evaluate_matcher(fuzzy_matcher, gold, "RapidFuzz")
    all_eval_results.append(fuzzy_results)

    # Evaluate EmbeddingMatcher (optional)
    if not args.fuzzy_only:
        print("\nEvaluating EmbeddingMatcher (sentence-transformers)...")
        print("  Note: first run downloads ~80 MB model. Subsequent runs use cache.")
        try:
            from app.embedding_matcher import EmbeddingMatcher
            embed_matcher = EmbeddingMatcher.build(db, fuzzy_matcher)
            embed_results = evaluate_matcher(embed_matcher, gold, "Embedding+Fuzzy")
            all_eval_results.append(embed_results)
        except ImportError:
            print("  sentence-transformers not installed — skipping embedding evaluation.")
            print("  Install with: pip install sentence-transformers")
        except Exception as exc:
            print(f"  EmbeddingMatcher build failed: {exc} — skipping.")

    # Print results
    print_markdown_table(all_eval_results)

    # Save JSON
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(all_eval_results, f, indent=2)
    print(f"\nResults saved to: {OUTPUT_JSON}")

    # Cleanup
    db.close()
    engine.dispose()
    try:
        os.unlink(tmp)
    except Exception:
        pass


if __name__ == "__main__":
    main()
