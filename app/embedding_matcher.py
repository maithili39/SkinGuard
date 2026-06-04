"""Sentence-embedding semantic ingredient matcher.

Uses sentence-transformers to build a dense embedding index of known ingredient
alias names.
- On PostgreSQL: queries embeddings directly in the database using pgvector.
- On SQLite: queries embeddings in-memory from seeded binary blobs.
"""

import logging
import os
from typing import Optional
import numpy as np
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.matching import Match, Matcher, normalize
from app.models import Ingredient, Alias

logger = logging.getLogger("skinguard.embedding")

_EMBED_MODEL = os.environ.get("EMBED_MODEL", "all-MiniLM-L6-v2")
_EMBED_THRESHOLD = float(os.environ.get("EMBED_THRESHOLD", "0.82"))
_TOP_K = 5

_model = None


def get_sentence_transformer():
    """Lazily load the SentenceTransformer model to save startup memory."""
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore[import-untyped]
        except ImportError as exc:
            raise ImportError(
                "sentence-transformers not installed. Run: pip install sentence-transformers"
            ) from exc
        logger.info("Loading sentence-transformer model: %s", _EMBED_MODEL)
        _model = SentenceTransformer(_EMBED_MODEL)
    return _model


class EmbeddingMatcher:
    """Semantic ingredient matcher utilizing database or in-memory vector search."""

    def __init__(
        self,
        alias_names: list[str],
        embeddings: np.ndarray,
        alias_to_ingredient_id: dict[str, int],
        id_to_inci: dict[int, str],
        fuzzy_matcher: Matcher,
    ):
        self._alias_names = alias_names          # (N,) normalised alias strings (only for SQLite in-memory fallback)
        self._embeddings = embeddings            # (N, D) float32 (only for SQLite in-memory fallback)
        self._alias_to_id = alias_to_ingredient_id
        self._id_to_inci = id_to_inci
        self._fuzzy = fuzzy_matcher
        self._is_postgres = settings.database_url.startswith("postgresql")
        logger.info(
            "EmbeddingMatcher ready: %d aliases indexed in-memory (is_postgres=%s)",
            len(alias_names) if not self._is_postgres else len(alias_to_ingredient_id),
            self._is_postgres,
        )

    @classmethod
    def build(cls, db: Session, fuzzy_matcher: Matcher) -> "EmbeddingMatcher":
        """Build the matcher. If SQLite, loads pre-seeded embeddings from database.
        If PostgreSQL, relies on pgvector inside DB queries and skips loading weights.
        """
        is_postgres = settings.database_url.startswith("postgresql")

        if is_postgres:
            # PostgreSQL: database does the vector matching, so we don't load anything into Python memory!
            return cls(
                alias_names=[],
                embeddings=np.empty((0, 384), dtype=np.float32),
                alias_to_ingredient_id=fuzzy_matcher._index,
                id_to_inci=fuzzy_matcher._id_to_inci,
                fuzzy_matcher=fuzzy_matcher,
            )

        # SQLite: load seeded LargeBinary vectors from database into memory
        logger.info("Loading pre-computed alias embeddings from SQLite database...")
        aliases = db.query(Alias).filter(Alias.embedding != None).all()
        alias_names = []
        embeddings_list = []
        alias_to_id = {}

        for a in aliases:
            name_norm = normalize(a.name)
            if a.embedding:
                arr = np.frombuffer(a.embedding, dtype=np.float32)
                if len(arr) == 384:
                    embeddings_list.append(arr)
                    alias_names.append(name_norm)
                    alias_to_id[name_norm] = a.ingredient_id

        if embeddings_list:
            embeddings = np.stack(embeddings_list)
        else:
            embeddings = np.empty((0, 384), dtype=np.float32)

        # Fallback to copy from fuzzy_matcher if DB is not seeded yet
        if not alias_to_id:
            alias_to_id = fuzzy_matcher._index

        return cls(alias_names, embeddings, alias_to_id, fuzzy_matcher._id_to_inci, fuzzy_matcher)

    def match_token(self, raw: str) -> Match:
        """Resolve one raw ingredient token using pgvector (Postgres) or in-memory (SQLite) matching."""
        norm = normalize(raw)
        if not norm:
            return Match(raw, None, None, 0, "unmatched", "none")

        # 1. Exact alias lookup — zero-cost, full confidence
        if norm in self._alias_to_id:
            ing_id = self._alias_to_id[norm]
            return Match(raw, self._id_to_inci.get(ing_id, ""), ing_id, 100, "matched", "exact")

        # 2. Embedding similarity
        try:
            model = get_sentence_transformer()
            q_embed = model.encode([norm], normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)[0]

            if self._is_postgres:
                # ── Postgres pgvector Query ──
                db = SessionLocal()
                try:
                    # pgvector cosine distance: returns (Alias, distance)
                    distance_col = Alias.embedding.cosine_distance(q_embed.tolist())
                    rows = (
                        db.query(Alias, distance_col)
                        .filter(Alias.embedding != None)
                        .order_by(distance_col)
                        .limit(_TOP_K)
                        .all()
                    )
                finally:
                    db.close()

                if not rows:
                    return self._fuzzy.match_token(raw)

                best_alias_row, best_distance = rows[0]
                best_sim = 1.0 - float(best_distance)
                best_alias = normalize(best_alias_row.name)

                if best_sim >= _EMBED_THRESHOLD:
                    # Ambiguity band tiebreaking using RapidFuzz
                    if len(rows) > 1:
                        from rapidfuzz import fuzz
                        band_aliases = [
                            normalize(r.name) for r, dist in rows
                            if (1.0 - float(dist)) >= _EMBED_THRESHOLD - 0.05
                        ]
                        if len(band_aliases) > 1:
                            best_alias = max(band_aliases, key=lambda a: fuzz.WRatio(norm, a))

                    ing_id = self._alias_to_id[best_alias]
                    confidence = int(best_sim * 100)
                    return Match(raw, self._id_to_inci.get(ing_id, ""), ing_id, confidence, "matched", "embedding")

            else:
                # ── SQLite In-Memory Query ──
                if self._embeddings.shape[0] == 0:
                    return self._fuzzy.match_token(raw)

                sims = (self._embeddings @ q_embed).astype(float)
                top_k_idx = np.argpartition(sims, -min(_TOP_K, len(sims)))[-_TOP_K:]
                top_k_idx = top_k_idx[np.argsort(sims[top_k_idx])[::-1]]

                best_idx = top_k_idx[0]
                best_sim = float(sims[best_idx])
                best_alias = self._alias_names[best_idx]

                if best_sim >= _EMBED_THRESHOLD:
                    if len(top_k_idx) > 1:
                        from rapidfuzz import fuzz
                        band_aliases = [
                            self._alias_names[i] for i in top_k_idx
                            if float(sims[i]) >= _EMBED_THRESHOLD - 0.05
                        ]
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
        from rapidfuzz import fuzz

        results = [None] * len(raw_tokens)
        to_embed_indices = []
        to_embed_norms = []

        for idx, raw in enumerate(raw_tokens):
            norm = normalize(raw)
            if not norm:
                results[idx] = Match(raw, None, None, 0, "unmatched", "none")
                continue

            # Exact alias lookup
            if norm in self._alias_to_id:
                ing_id = self._alias_to_id[norm]
                results[idx] = Match(raw, self._id_to_inci.get(ing_id, ""), ing_id, 100, "matched", "exact")
                continue

            to_embed_indices.append(idx)
            to_embed_norms.append(norm)

        if not to_embed_indices:
            return results  # type: ignore[return-value]

        try:
            model = get_sentence_transformer()
            q_embeds = model.encode(
                to_embed_norms,
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=False,
            )

            # Query database for all embedded tokens
            db = None
            if self._is_postgres:
                db = SessionLocal()

            try:
                for i, idx in enumerate(to_embed_indices):
                    raw = raw_tokens[idx]
                    norm = to_embed_norms[i]
                    q_embed = q_embeds[i]

                    if self._is_postgres and db is not None:
                        # ── Postgres pgvector batch item query ──
                        distance_col = Alias.embedding.cosine_distance(q_embed.tolist())
                        rows = (
                            db.query(Alias, distance_col)
                            .filter(Alias.embedding != None)
                            .order_by(distance_col)
                            .limit(_TOP_K)
                            .all()
                        )
                        if not rows:
                            results[idx] = self._fuzzy.match_token(raw)
                            continue

                        best_alias_row, best_distance = rows[0]
                        best_sim = 1.0 - float(best_distance)
                        best_alias = normalize(best_alias_row.name)

                        if best_sim >= _EMBED_THRESHOLD:
                            if len(rows) > 1:
                                band_aliases = [
                                    normalize(r.name) for r, dist in rows
                                    if (1.0 - float(dist)) >= _EMBED_THRESHOLD - 0.05
                                ]
                                if len(band_aliases) > 1:
                                    best_alias = max(band_aliases, key=lambda a: fuzz.WRatio(norm, a))

                            ing_id = self._alias_to_id[best_alias]
                            confidence = int(best_sim * 100)
                            results[idx] = Match(raw, self._id_to_inci.get(ing_id, ""), ing_id, confidence, "matched", "embedding")
                        else:
                            fuzzy_match = self._fuzzy.match_token(raw)
                            if fuzzy_match.status == "matched":
                                fuzzy_match.match_method = "fuzzy"
                            results[idx] = fuzzy_match

                    else:
                        # ── SQLite batch item query ──
                        if self._embeddings.shape[0] == 0:
                            results[idx] = self._fuzzy.match_token(raw)
                            continue

                        sims = (self._embeddings @ q_embed).astype(float)
                        top_k_idx = np.argpartition(sims, -min(_TOP_K, len(sims)))[-_TOP_K:]
                        top_k_idx = top_k_idx[np.argsort(sims[top_k_idx])[::-1]]

                        best_idx = top_k_idx[0]
                        best_sim = float(sims[best_idx])
                        best_alias = self._alias_names[best_idx]

                        if best_sim >= _EMBED_THRESHOLD:
                            if len(top_k_idx) > 1:
                                band_aliases = [
                                    self._alias_names[i] for i in top_k_idx
                                    if float(sims[i]) >= _EMBED_THRESHOLD - 0.05
                                ]
                                if len(band_aliases) > 1:
                                    best_alias = max(band_aliases, key=lambda a: fuzz.WRatio(norm, a))

                            ing_id = self._alias_to_id[best_alias]
                            confidence = int(best_sim * 100)
                            results[idx] = Match(raw, self._id_to_inci.get(ing_id, ""), ing_id, confidence, "matched", "embedding")
                        else:
                            fuzzy_match = self._fuzzy.match_token(raw)
                            if fuzzy_match.status == "matched":
                                fuzzy_match.match_method = "fuzzy"
                            results[idx] = fuzzy_match

            finally:
                if db is not None:
                    db.close()

        except Exception as exc:
            logger.warning("Batch embedding match failed, falling back to individual fuzzy: %s", exc)
            for idx in to_embed_indices:
                raw = raw_tokens[idx]
                results[idx] = self._fuzzy.match_token(raw)

        return results  # type: ignore[return-value]

    def match_list(self, raw_text: str) -> list[Match]:
        from app.matching import split_ingredient_list
        return self.match_tokens_batch(split_ingredient_list(raw_text))
