"""Resolve messy, real-world ingredient strings to canonical DB ingredients.

Real labels (and OCR output) are full of noise: 'Aqua/Water', 'Niacinmide',
'Parfum (Fragrance)', trailing asterisks, casing. We:
  1. normalise the raw token,
  2. try an exact alias hit,
  3. fall back to fuzzy matching (RapidFuzz) over all known names,
  4. return a confidence score and NEVER silently drop a token — anything below
     the threshold is reported as 'unmatched' so the user knows coverage isn't 100%.

Singleton pattern: once built from a DB session, the Matcher holds NO live DB
connection. All data it needs (alias index + INCI name cache) is copied into
memory at init time. This lets main.py build it once at startup rather than
re-querying 24k rows on every /analyze request.
"""

import re
from dataclasses import dataclass
from typing import Optional

from rapidfuzz import process, fuzz
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Ingredient, Alias

_NOISE = re.compile(r"\(.*?\)|\*|•|\.|\bmay contain\b|\bci\s*\d+\b", re.IGNORECASE)

# Pre-clean patterns applied to the *full label blob* before splitting.
# Removes header text and HTML entities that would produce junk tokens.
_LABEL_HEADER = re.compile(
    r"^\s*ingredients?\s*:?\s*",
    re.IGNORECASE | re.MULTILINE,
)
_HTML_ENTITIES = re.compile(r"&(?:gt|lt|amp|apos|quot);?", re.IGNORECASE)

# Tokens that are definitely not ingredients — filtered after splitting.
_JUNK_TOKENS: set[str] = {
    "dermatologist tested", "hypoallergenic", "fragrance free",
    "ophthalmologist tested", "clinically tested", "allergy tested",
    "suitable for vegans", "no added fragrance", "no parabens",
    "non-comedogenic", "vegan", "cruelty free", "cruelty-free",
    "paraben free", "paraben-free", "alcohol free", "sulfate free",
    "preservative free", "ph balanced",
}


def clean_parsed_token(token: str) -> str:
    """Clean up formatting noise from individual ingredient tokens.
    
    Handles:
      - Leading bullet points, list numbers, asterisks, hyphens, and spaces
        (e.g., '1. Water' -> 'Water', '• Glycerin' -> 'Glycerin')
      - Percentage declarations (e.g. 'Glycerin 2%' -> 'Glycerin', 'Salicylic Acid 0.5%' -> 'Salicylic Acid')
      - Trailing punctuation (like asterisks, dots, or spaces)
    
    Leaves chemical names like '1,2-Hexanediol' completely intact.
    """
    token = token.strip()
    
    # Remove percentage declarations, e.g. "2%" or "0.5%" or "10%"
    token = re.sub(r"\b\d+(?:\.\d+)?\s*%", "", token)
    
    # Clean leading list numbers / bullet points / punctuation
    token = re.sub(r"^(?:\d+(?:\.\d+)?[\s.)\-]+|[^\w\s()]+)+", "", token)
    
    # Strip trailing punctuation/junk
    token = re.sub(r"[^\w\s)]+$", "", token)
    
    return token.strip()


def normalize(token: str) -> str:
    token = token.strip().lower()
    token = re.sub(r"\b\d+(?:\.\d+)?\s*%", " ", token)
    token = _NOISE.sub(" ", token)
    token = token.replace("/", " ").replace("+", " ")
    token = re.sub(r"^(?:\d+(?:\.\d+)?[\s.)\-]+|[^\w\s()]+)+", "", token)
    token = re.sub(r"[^\w\s)]+$", "", token)
    token = re.sub(r"\s+", " ", token).strip()
    return token


def split_ingredient_list(raw_text: str) -> list[str]:
    """Split a raw label blob into individual ingredient tokens.

    Pre-clean steps applied before splitting:
    1. Strip 'Ingredients:' / 'Ingredient:' headers (common on real labels).
    2. Strip HTML entities (&gt; etc.) that OCR or copy-paste introduces.
    3. After splitting, filter trivial junk: pure numbers, single chars,
       known marketing phrases, bare CI colour codes.
    """
    # Pre-clean the full blob
    cleaned = _LABEL_HEADER.sub(" ", raw_text)
    cleaned = _HTML_ENTITIES.sub(" ", cleaned)

    # Labels separate ingredients with commas; also tolerate newlines/semicolons.
    # We split by semicolon, newline, and comma (but NOT commas between digits, e.g. 1,2-Hexanediol)
    parts = re.split(r";|\n|,(?!\d)|(?<!\d),", cleaned)

    tokens = []
    for p in parts:
        p = clean_parsed_token(p)
        if not p:
            continue
        # Pure numbers (e.g. percentages split off from CAS numbers)
        if re.fullmatch(r"[\d.]+%?", p):
            continue
        # Single characters / empty after stripping
        if len(p) <= 1:
            continue
        # Known marketing / claim phrases (case-insensitive)
        if p.lower() in _JUNK_TOKENS:
            continue
        tokens.append(p)
    return tokens


@dataclass
class Match:
    raw: str
    matched_inci: Optional[str]
    ingredient_id: Optional[int]
    confidence: int  # 0-100
    status: str       # "matched" | "unmatched"
    match_method: str = "fuzzy"  # "exact" | "embedding" | "fuzzy" | "none"
    best_candidate: Optional[str] = None  # best guess name for unmatched tokens ("Did you mean?")


class Matcher:
    """In-memory ingredient resolver.

    Build once at app startup (see main.py lifespan). After __init__ completes,
    the Matcher holds NO database connection — it is safe to use concurrently
    from multiple request threads without a DB session.
    """

    def __init__(self, db: Session):
        # Alias index: normalized alias name → ingredient_id
        self._index: dict[str, int] = {}
        # INCI name cache: ingredient_id → inci_name (avoids DB lookup per match)
        self._id_to_inci: dict[int, str] = {}

        # Load INCI name cache first
        for ing_id, inci_name in db.query(Ingredient.id, Ingredient.inci_name).all():
            self._id_to_inci[ing_id] = inci_name

        # Build alias index
        for alias_name, ingredient_id in db.query(Alias.name, Alias.ingredient_id).all():
            self._index[normalize(alias_name)] = ingredient_id

        self._choices = list(self._index.keys())
        # Note: self.db is intentionally NOT stored — Matcher is DB-free after init.

    def match_token(self, raw: str) -> Match:
        norm = normalize(raw)
        if not norm:
            return Match(raw, None, None, 0, "unmatched", "none", None)

        # 1. exact alias hit -> full confidence
        if norm in self._index:
            ing_id = self._index[norm]
            return Match(raw, self._inci(ing_id), ing_id, 100, "matched", "exact", None)

        # 2. fuzzy fallback
        best = process.extractOne(norm, self._choices, scorer=fuzz.WRatio)
        if best:
            choice, score, _ = best
            best_name = self._inci(self._index[choice])  # canonical name of best candidate
            if score >= settings.match_threshold:
                ing_id = self._index[choice]
                return Match(raw, best_name, ing_id, int(score), "matched", "fuzzy", None)
            # Below threshold: unmatched but expose best_candidate for "Did you mean?"
            return Match(raw, None, None, int(score), "unmatched", "fuzzy", best_name)

        return Match(raw, None, None, 0, "unmatched", "none", None)

    def match_list(self, raw_text: str) -> list[Match]:
        return [self.match_token(t) for t in split_ingredient_list(raw_text)]

    def _inci(self, ingredient_id: int) -> str:
        """Return the canonical INCI name from the in-memory cache (no DB call)."""
        return self._id_to_inci.get(ingredient_id, "")

