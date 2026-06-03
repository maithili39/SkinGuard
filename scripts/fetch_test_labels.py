"""Fetch real product ingredient lists from Open Beauty Facts into data/test/.

These are messy, real-world labels used ONLY to measure matcher/OCR quality —
never as a source of truth (see the trust boundary in the README).

Run:  python -m scripts.fetch_test_labels
Output: data/test/obf_products.jsonl  (one product per line)
"""

import json
import os
import time
import urllib.parse
import urllib.request

OUT = os.path.join("data", "test", "obf_products.jsonl")
UA = "SkinGuard-dev/0.1 (educational; test-data fetch)"

# A spread of common skincare categories so the sample resembles real usage.
CATEGORIES = ["creams", "moisturizers", "serums", "cleansers", "sunscreens", "shampoos"]
PER_CATEGORY = 40


def _fetch(category: str) -> list[dict]:
    params = {
        "action": "process",
        "json": "1",
        "page_size": str(PER_CATEGORY),
        "fields": "code,product_name,ingredients_text",
        "tagtype_0": "categories",
        "tag_contains_0": "contains",
        "tag_0": category,
    }
    url = "https://world.openbeautyfacts.org/cgi/search.pl?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)
    return data.get("products", [])


def main():
    seen_codes = set()
    kept = []
    for cat in CATEGORIES:
        try:
            products = _fetch(cat)
        except Exception as exc:  # network hiccup on one category shouldn't abort
            print(f"  [{cat}] fetch failed: {exc}")
            continue
        for p in products:
            text = (p.get("ingredients_text") or "").strip()
            code = p.get("code")
            if not text or len(text) < 15 or code in seen_codes:
                continue
            seen_codes.add(code)
            kept.append(
                {
                    "code": code,
                    "name": (p.get("product_name") or "").strip(),
                    "ingredients_text": text,
                    "category": cat,
                }
            )
        print(f"  [{cat}] kept {len(kept)} total so far")
        time.sleep(1)  # be polite to the API

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        for row in kept:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Saved {len(kept)} real product labels -> {OUT}")


if __name__ == "__main__":
    main()
