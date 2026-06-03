"""Measure matcher coverage against real Open Beauty Facts labels.

Answers the question that actually matters: when a real person scans a real
product, what fraction of its ingredients do we recognise? And which unmatched
ingredients are most common (i.e. what to curate / why CosIng missed them)?

Run:  python -m scripts.coverage_report
"""

import json
import os
import sys
from collections import Counter

# Real labels contain non-cp1252 characters; force UTF-8 console output.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from app.database import SessionLocal
from app.matching import Matcher

DATA = os.path.join("data", "test", "obf_products.jsonl")


def main():
    if not os.path.exists(DATA):
        print(f"No test data at {DATA}. Run: python -m scripts.fetch_test_labels")
        return

    db = SessionLocal()
    matcher = Matcher(db)

    products = [json.loads(l) for l in open(DATA, encoding="utf-8")]
    per_product_cov = []
    total_tokens = matched_tokens = 0
    unmatched_counter: Counter = Counter()

    for p in products:
        matches = matcher.match_list(p["ingredients_text"])
        if not matches:
            continue
        m = sum(1 for x in matches if x.status == "matched")
        total_tokens += len(matches)
        matched_tokens += m
        per_product_cov.append(100 * m / len(matches))
        for x in matches:
            if x.status == "unmatched":
                norm = x.raw.strip().lower()
                if 2 < len(norm) < 60:
                    unmatched_counter[norm] += 1

    db.close()

    n = len(per_product_cov)
    avg_product = sum(per_product_cov) / n if n else 0
    token_cov = 100 * matched_tokens / total_tokens if total_tokens else 0

    print("=" * 60)
    print(f"Products analysed:        {n}")
    print(f"Total ingredient tokens:  {total_tokens}")
    print(f"Token-level coverage:     {token_cov:.1f}%")
    print(f"Avg per-product coverage: {avg_product:.1f}%")
    print("=" * 60)
    print("\nTop 25 UNMATCHED tokens (curate these next):")
    for token, count in unmatched_counter.most_common(25):
        print(f"  {count:3}x  {token}")


if __name__ == "__main__":
    main()
