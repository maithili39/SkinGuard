import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import json
import os
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.matching import Matcher
from app.embedding_matcher import EmbeddingMatcher

TEST_JSONL = os.path.join("data", "test", "obf_products.jsonl")

def main():
    if not os.path.exists(TEST_JSONL):
        print(f"Error: test file not found at {TEST_JSONL}")
        return

    print("Loading database session...")
    db = SessionLocal()
    try:
        print("Initializing RapidFuzz (baseline) matcher...")
        fuzzy_matcher = Matcher(db)
        
        print("Initializing EmbeddingMatcher...")
        try:
            embed_matcher = EmbeddingMatcher.build(db, fuzzy_matcher)
            has_embed = True
        except Exception as e:
            print(f"Failed to load EmbeddingMatcher: {e} - falling back to fuzzy only.")
            has_embed = False
            
        print("\nEvaluating on real-world ingredient lists from OBF...")
        products = []
        with open(TEST_JSONL, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    products.append(json.loads(line))
                    
        # Evaluate the first 50 products to get a good statistical sample
        eval_sample = products[:50]
        print(f"  Evaluating {len(eval_sample)} products...")
        
        fuzzy_stats = {"total_tokens": 0, "matched": 0, "unmatched": 0, "methods": {}}
        embed_stats = {"total_tokens": 0, "matched": 0, "unmatched": 0, "methods": {}}
        
        for idx, prod in enumerate(eval_sample):
            text = prod["ingredients_text"]
            if not text:
                continue
                
            # Match using RapidFuzz
            fuzzy_matches = fuzzy_matcher.match_list(text)
            for m in fuzzy_matches:
                fuzzy_stats["total_tokens"] += 1
                if m.status == "matched":
                    fuzzy_stats["matched"] += 1
                else:
                    fuzzy_stats["unmatched"] += 1
                method = getattr(m, "match_method", "fuzzy")
                fuzzy_stats["methods"][method] = fuzzy_stats["methods"].get(method, 0) + 1
                
            # Match using EmbeddingMatcher
            if has_embed:
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
            
        print("\n### Resolution Method Breakdown\n")
        print("| Matcher | Method | Count | Percentage |")
        print("|---------|--------|-------|------------|")
        for method, count in fuzzy_stats["methods"].items():
            pct = count / fuzzy_stats["total_tokens"] if fuzzy_stats["total_tokens"] else 0
            print(f"| RapidFuzz | {method:<10} | {count:>5} | {pct:>10.2%} |")
            
        if has_embed:
            for method, count in embed_stats["methods"].items():
                pct = count / embed_stats["total_tokens"] if embed_stats["total_tokens"] else 0
                print(f"| Embedding+Fuzzy | {method:<10} | {count:>5} | {pct:>10.2%} |")
                
    finally:
        db.close()

if __name__ == "__main__":
    main()
