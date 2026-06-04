"""Sentence-embedding semantic ingredient matcher.

Uses the `sentence-transformers` library (all-MiniLM-L6-v2 by default — 80 MB,
runs fully locally, no API key) to build a dense embedding index of all known
ingredient alias names. At query time, the input token is embedded and cosine
similarity is used to retrieve the best match.

Hybrid strategy (primary embedding, tiebreaker fuzzy):
  1. Embed the normalised query token.
  2. Find the top-k nearest aliases by cosine similarity.
  3. If the top result > EMBED_THRESHOLD, accept it.
  4. If within the ambiguity band (EMBED_THRESHOLD ± 5%), re-rank with RapidFuzz
     WRatio as a tiebreaker.
  5. Below threshold → unmatched (same behaviour as the fuzzy Matcher).

Singleton pattern: the index is built once at startup from a DB session. After
__init__ the object holds NO live DB connection — it is concurrency-safe.

Graceful degradation: if sentence-transformers is not installed, all methods
raise ImportError immediately so the caller (main.py) can fall back to the
existing RapidFuzz Matcher without crashing the server.

Academic note: match_method ('exact'|'embedding'|'fuzzy') is reported per
token in the Match dataclass, enabling precision/recall evaluation at analysis
time without a separate offline pass.
"""

import logging
import os
from typing import Optional

import numpy as np
from sqlalchemy.orm import Session

from app.config import settings
from app.matching import Match, Matcher, normalize
from app.models import Ingredient, Alias

logger = logging.getLogger("skinguard.embedding")

_EMBED_MODEL = os.environ.get("EMBED_MODEL", "all-MiniLM-L6-v2")
# Accept a match if cosine similarity exceeds this threshold (0-1 scale).
_EMBED_THRESHOLD = float(os.environ.get("EMBED_THRESHOLD", "0.82"))
# Top-k candidates returned before RapidFuzz tiebreaking.
_TOP_K = 5


def _cosine(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Batch cosine similarity: a (1, D) vs b (N, D) → (N,)."""
    a_norm = a / (np.linalg.norm(a) + 1e-10)
    b_norms = b / (np.linalg.norm(b, axis=1, keepdims=True) + 1e-10)
    return b_norms @ a_norm.T  # (N,)


class EmbeddingMatcher:
    """Semantic ingredient matcher built on sentence-transformer embeddings.

    Build once at startup via `EmbeddingMatcher.build(db)`. The returned object
    holds the full alias embedding matrix in memory (typically ~50 MB for 24k
    aliases with MiniLM-L6-v2 embeddings of dim=384).
    """

    def __init__(
        self,
        alias_names: list[str],
        embeddings: np.ndarray,
        alias_to_ingredient_id: dict[str, int],
        id_to_inci: dict[int, str],
        fuzzy_matcher: Matcher,
        model,
    ):
        self._alias_names = alias_names          # (N,) normalised alias strings
        self._embeddings = embeddings            # (N, D) float32
        self._alias_to_id = alias_to_ingredient_id
        self._id_to_inci = id_to_inci
        self._fuzzy = fuzzy_matcher
        self._model = model
        logger.info(
            "EmbeddingMatcher ready: %d aliases, dim=%d, model=%s",
            len(alias_names), embeddings.shape[1], _EMBED_MODEL,
        )

    # ── Factory ────────────────────────────────────────────────────────────────

    @classmethod
    def build(cls, db: Session, fuzzy_matcher: Matcher) -> "EmbeddingMatcher":
        """Build the embedding index from the DB. Slow on first run (model download
        + encoding 24k aliases), then cached in-memory for the process lifetime."""
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore[import-untyped]
        except ImportError as exc:
            raise ImportError(
                "sentence-transformers not installed. "
                "Run: pip install sentence-transformers"
            ) from exc

        logger.info("Loading sentence-transformer model: %s", _EMBED_MODEL)
        model = SentenceTransformer(_EMBED_MODEL)

        # Load all aliases from DB
        aliases = db.query(Alias).all()
        alias_names = [normalize(a.name) for a in aliases]
        alias_to_id = {normalize(a.name): a.ingredient_id for a in aliases}
        id_to_inci = {ing.id: ing.inci_name for ing in db.query(Ingredient).all()}

        logger.info("Encoding %d alias names (this takes ~30s on first run)…", len(alias_names))
        embeddings = model.encode(
            alias_names,
            batch_size=256,
            show_progress_bar=False,
            normalize_embeddings=True,  # pre-normalise for faster cosine
            convert_to_numpy=True,
        ).astype(np.float32)

        return cls(alias_names, embeddings, alias_to_id, id_to_inci, fuzzy_matcher, model)

    # ── Core matching ──────────────────────────────────────────────────────────

    def match_token(self, raw: str) -> Match:
        """Resolve one raw ingredient token using the hybrid embed+fuzzy strategy."""
        from sentence_transformers import SentenceTransformer  # type: ignore[import-untyped]

        norm = normalize(raw)
        if not norm:
            return Match(raw, None, None, 0, "unmatched", "none")

        # 1. Exact alias lookup — zero-cost, full confidence
        if norm in self._alias_to_id:
            ing_id = self._alias_to_id[norm]
            return Match(raw, self._id_to_inci.get(ing_id, ""), ing_id, 100, "matched", "exact")

        # 2. Embedding similarity
        try:
            q_embed = self._model.encode([norm], normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)[0]
            sims = (self._embeddings @ q_embed).astype(float)  # (N,) — pre-normalised dot product

            top_k_idx = np.argpartition(sims, -min(_TOP_K, len(sims)))[-_TOP_K:]
            top_k_idx = top_k_idx[np.argsort(sims[top_k_idx])[::-1]]

            best_idx = top_k_idx[0]
            best_sim = float(sims[best_idx])
            best_alias = self._alias_names[best_idx]

            if best_sim >= _EMBED_THRESHOLD:
                # Inside the ambiguity band? re-rank with fuzzy
                if len(top_k_idx) > 1:
                    from rapidfuzz import fuzz
                    band_aliases = [self._alias_names[i] for i in top_k_idx
                                    if float(sims[i]) >= _EMBED_THRESHOLD - 0.05]
                    if len(band_aliases) > 1:
                        best_alias = max(band_aliases, key=lambda a: fuzz.WRatio(norm, a))

                ing_id = self._alias_to_id[best_alias]
                confidence = int(best_sim * 100)
                return Match(raw, self._id_to_inci.get(ing_id, ""), ing_id, confidence, "matched", "embedding")

            # 3. Cosine below threshold — fall back to RapidFuzz
            fuzzy_match = self._fuzzy.match_token(raw)
            if fuzzy_match.status == "matched":
                fuzzy_match.match_method = "fuzzy"
            return fuzzy_match

        except Exception as exc:
            logger.warning("Embedding match failed for '%s': %s — using fuzzy", raw, exc)
            return self._fuzzy.match_token(raw)

    def match_tokens_batch(self, raw_tokens: list[str]) -> list[Match]:
        """Resolve a list of raw ingredient tokens using batch-optimized hybrid strategy."""
        from sentence_transformers import SentenceTransformer  # type: ignore[import-untyped]
        from rapidfuzz import fuzz

        results = [None] * len(raw_tokens)
        
        # 1. Normalize and check exact match
        to_embed_indices = []
        to_embed_norms = []
        
        for idx, raw in enumerate(raw_tokens):
            norm = normalize(raw)
            if not norm:
                results[idx] = Match(raw, None, None, 0, "unmatched", "none")
                continue
                
            # Exact alias lookup — zero-cost, full confidence
            if norm in self._alias_to_id:
                ing_id = self._alias_to_id[norm]
                results[idx] = Match(raw, self._id_to_inci.get(ing_id, ""), ing_id, 100, "matched", "exact")
                continue
                
            # Needs embedding matching
            to_embed_indices.append(idx)
            to_embed_norms.append(norm)
            
        if not to_embed_indices:
            # All tokens were either empty or exact matches
            return results  # type: ignore[return-value]

        # 2. Batch encode the normalized tokens that need embedding
        try:
            q_embeds = self._model.encode(
                to_embed_norms,
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=False,
            )
            
            for i, idx in enumerate(to_embed_indices):
                raw = raw_tokens[idx]
                norm = to_embed_norms[i]
                q_embed = q_embeds[i]
                
                sims = (self._embeddings @ q_embed).astype(float)  # (N,) — pre-normalised dot product
                
                top_k_idx = np.argpartition(sims, -min(_TOP_K, len(sims)))[-_TOP_K:]
                top_k_idx = top_k_idx[np.argsort(sims[top_k_idx])[::-1]]
                
                best_idx = top_k_idx[0]
                best_sim = float(sims[best_idx])
                best_alias = self._alias_names[best_idx]
                
                if best_sim >= _EMBED_THRESHOLD:
                    # Inside the ambiguity band? re-rank with fuzzy
                    if len(top_k_idx) > 1:
                        band_aliases = [self._alias_names[idx_val] for idx_val in top_k_idx
                                        if float(sims[idx_val]) >= _EMBED_THRESHOLD - 0.05]
                        if len(band_aliases) > 1:
                            best_alias = max(band_aliases, key=lambda a: fuzz.WRatio(norm, a))
                            
                    ing_id = self._alias_to_id[best_alias]
                    confidence = int(best_sim * 100)
                    results[idx] = Match(raw, self._id_to_inci.get(ing_id, ""), ing_id, confidence, "matched", "embedding")
                else:
                    # 3. Cosine below threshold — fall back to RapidFuzz
                    fuzzy_match = self._fuzzy.match_token(raw)
                    if fuzzy_match.status == "matched":
                        fuzzy_match.match_method = "fuzzy"
                    results[idx] = fuzzy_match
                    
        except Exception as exc:
            logger.warning("Batch embedding match failed, falling back to individual fuzzy: %s", exc)
            for idx in to_embed_indices:
                raw = raw_tokens[idx]
                results[idx] = self._fuzzy.match_token(raw)
                
        return results  # type: ignore[return-value]

    def match_list(self, raw_text: str) -> list[Match]:
        from app.matching import split_ingredient_list
        return self.match_tokens_batch(split_ingredient_list(raw_text))
