import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import json
import httpx
import time
from rapidfuzz.distance import Levenshtein
from app.ocr import extract_text

TEST_PRODUCTS = [
    {"code": "3337875597333", "name": "CeraVe Hydrating Cleanser"},
    {"code": "4005900756152", "name": "Nivea Creme"},
    {"code": "4088600303376", "name": "Intensive Hand Cream"},
]

def main():
    print("Starting OCR Accuracy Evaluation...")
    results = []
    
    for prod in TEST_PRODUCTS:
        code = prod["code"]
        name = prod["name"]
        print(f"\nFetching product {name} ({code}) from Open Beauty Facts...")
        
        url = f"https://world.openbeautyfacts.org/api/v2/product/{code}.json"
        try:
            r = httpx.get(url, timeout=10.0)
            if r.status_code != 200:
                print(f"  Failed to fetch metadata (HTTP {r.status_code})")
                continue
            data = r.json()
            if data.get("status") != 1 or "product" not in data:
                print("  Product not found in OBF database.")
                continue
                
            product = data["product"]
            image_url = product.get("image_ingredients_url") or product.get("image_front_url")
            gold_text = product.get("ingredients_text")
            
            if not image_url:
                print("  No ingredient/front image URL found for this product.")
                continue
            if not gold_text:
                print("  No gold ingredients text found for comparison.")
                continue
                
            print(f"  Downloading image: {image_url}")
            img_r = httpx.get(image_url, timeout=15.0)
            if img_r.status_code != 200:
                print(f"  Failed to download image (HTTP {img_r.status_code})")
                continue
                
            print("  Running Tesseract OCR pipeline...")
            start_time = time.time()
            ocr_text = extract_text(img_r.content)
            ocr_time = time.time() - start_time
            print(f"  OCR completed in {ocr_time:.2f}s")
            
            def normalize(t: str) -> str:
                return "".join(c.lower() for c in t if c.isalnum() or c.isspace() or c == ",")
                
            norm_gold = normalize(gold_text)
            norm_ocr = normalize(ocr_text)
            
            lev_dist = Levenshtein.distance(norm_gold, norm_ocr)
            max_len = max(len(norm_gold), len(norm_ocr))
            char_sim = 1.0 - (lev_dist / max_len) if max_len > 0 else 1.0
            
            gold_words = set(w for w in norm_gold.replace(",", " ").split() if w)
            ocr_words = set(w for w in norm_ocr.replace(",", " ").split() if w)
            intersection = gold_words.intersection(ocr_words)
            union = gold_words.union(ocr_words)
            jaccard = len(intersection) / len(union) if len(union) > 0 else 1.0
            
            print(f"  Character Levenshtein Similarity: {char_sim:.2%}")
            print(f"  Word Jaccard Similarity: {jaccard:.2%}")
            
            results.append({
                "name": name,
                "code": code,
                "gold_word_count": len(gold_words),
                "ocr_word_count": len(ocr_words),
                "matched_word_count": len(intersection),
                "levenshtein_distance": int(lev_dist),
                "char_similarity": char_sim,
                "jaccard_similarity": jaccard,
                "ocr_time_seconds": ocr_time
            })
            
        except Exception as e:
            print(f"  Error processing product: {e}")
            
    if not results:
        print("\nNo products were successfully evaluated. Please check network/Tesseract availability.")
        return
        
    print("\n## OCR Accuracy Report\n")
    print("| Product | Barcode | Gold Words | OCR Words | Match Words | Char Sim | Word Jaccard | Time (s) |")
    print("|---------|---------|------------|-----------|-------------|----------|--------------|----------|")
    for r in results:
        print(
            f"| {r['name']:<25} | {r['code']:<13} "
            f"| {r['gold_word_count']:>10} | {r['ocr_word_count']:>9} "
            f"| {r['matched_word_count']:>11} | {r['char_similarity']:>8.2%} "
            f"| {r['jaccard_similarity']:>12.2%} | {r['ocr_time_seconds']:>8.2f} |"
        )
        
if __name__ == "__main__":
    main()
