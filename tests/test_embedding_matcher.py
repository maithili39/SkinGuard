import pytest
from unittest.mock import patch, MagicMock
import numpy as np

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Ingredient, Alias
from app.matching import Matcher, Match
from app.embedding_matcher import EmbeddingMatcher, get_sentence_transformer

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

def test_get_sentence_transformer():
    with patch("sentence_transformers.SentenceTransformer") as mock_transformer:
        get_sentence_transformer()
        mock_transformer.assert_called_once()

def test_embedding_matcher_build_sqlite(db_session):
    # Setup some aliases with embeddings in DB
    ing = Ingredient(inci_name="Niacinamide")
    db_session.add(ing)
    db_session.flush()
    
    # SQLite uses binary bytes for embedding
    emb_bytes = np.array([0.1] * 384, dtype=np.float32).tobytes()
    alias = Alias(name="Vitamin B3", ingredient_id=ing.id, embedding=emb_bytes)
    db_session.add(alias)
    db_session.commit()
    
    fuzzy_matcher = MagicMock()
    fuzzy_matcher._index = {"niacinamide": ing.id}
    fuzzy_matcher._id_to_inci = {ing.id: "Niacinamide"}
    
    matcher = EmbeddingMatcher.build(db_session, fuzzy_matcher)
    assert matcher._is_postgres is False
    assert len(matcher._alias_names) == 1
    assert matcher._alias_names[0] == "vitamin b3"
    assert matcher._embeddings.shape == (1, 384)

@patch("app.embedding_matcher.get_sentence_transformer")
def test_embedding_matcher_match_token_exact(mock_get_transformer, db_session):
    fuzzy_matcher = MagicMock()
    # Mock exact match
    matcher = EmbeddingMatcher(
        alias_names=["vitamin b3"],
        embeddings=np.array([[0.1] * 384], dtype=np.float32),
        alias_to_ingredient_id={"vitamin b3": 1},
        id_to_inci={1: "Niacinamide"},
        fuzzy_matcher=fuzzy_matcher
    )
    
    match = matcher.match_token("Vitamin B3")
    assert match.status == "matched"
    assert match.match_method == "exact"
    assert match.matched_inci == "Niacinamide"
    mock_get_transformer.assert_not_called()

@patch("app.embedding_matcher.get_sentence_transformer")
def test_embedding_matcher_match_token_embedding(mock_get_transformer, db_session):
    # Mock SentenceTransformer
    mock_model = MagicMock()
    mock_get_transformer.return_value = mock_model
    
    # Query embedding is slightly different but close enough (dot product)
    q_emb = np.array([1.0/np.sqrt(384)] * 384, dtype=np.float32)
    mock_model.encode.return_value = np.array([q_emb])
    
    # Known alias embedding is also normalized
    alias_emb = np.array([1.0/np.sqrt(384)] * 384, dtype=np.float32)
    
    fuzzy_matcher = MagicMock()
    matcher = EmbeddingMatcher(
        alias_names=["vitamin b3"],
        embeddings=np.array([alias_emb], dtype=np.float32),
        alias_to_ingredient_id={"vitamin b3": 1},
        id_to_inci={1: "Niacinamide"},
        fuzzy_matcher=fuzzy_matcher
    )
    
    # The dot product of q_emb and alias_emb should be 1.0 (>= 0.82 threshold)
    match = matcher.match_token("Vit B3")
    assert match.status == "matched"
    assert match.match_method == "embedding"
    assert match.matched_inci == "Niacinamide"

@patch("app.embedding_matcher.get_sentence_transformer")
def test_embedding_matcher_match_token_fallback_fuzzy(mock_get_transformer, db_session):
    mock_model = MagicMock()
    mock_get_transformer.return_value = mock_model
    
    # Query embedding dot product is low (e.g. orthogonal)
    q_emb = np.array([1.0/np.sqrt(384)] * 384, dtype=np.float32)
    # We make alias_emb such that dot product is negative or small
    alias_emb = -q_emb
    
    mock_model.encode.return_value = np.array([q_emb])
    
    fuzzy_matcher = MagicMock()
    fuzzy_matcher.match_token.return_value = Match("unknown", "Niacinamide", 1, 90, "matched", "fuzzy")
    
    matcher = EmbeddingMatcher(
        alias_names=["vitamin b3"],
        embeddings=np.array([alias_emb], dtype=np.float32),
        alias_to_ingredient_id={"vitamin b3": 1},
        id_to_inci={1: "Niacinamide"},
        fuzzy_matcher=fuzzy_matcher
    )
    
    match = matcher.match_token("unknown")
    assert match.status == "matched"
    assert match.match_method == "fuzzy"
    assert match.matched_inci == "Niacinamide"
    fuzzy_matcher.match_token.assert_called_once_with("unknown")

@patch("app.embedding_matcher.get_sentence_transformer")
def test_embedding_matcher_match_tokens_batch(mock_get_transformer, db_session):
    mock_model = MagicMock()
    mock_get_transformer.return_value = mock_model
    
    q_emb1 = np.array([1.0/np.sqrt(384)] * 384, dtype=np.float32)
    q_emb2 = np.array([1.0/np.sqrt(384)] * 384, dtype=np.float32)
    mock_model.encode.return_value = np.array([q_emb1, q_emb2])
    
    alias_emb = np.array([1.0/np.sqrt(384)] * 384, dtype=np.float32)
    
    fuzzy_matcher = MagicMock()
    fuzzy_matcher.match_token.return_value = Match("unknown", "Niacinamide", 1, 90, "matched", "fuzzy")
    
    matcher = EmbeddingMatcher(
        alias_names=["vitamin b3"],
        embeddings=np.array([alias_emb], dtype=np.float32),
        alias_to_ingredient_id={"vitamin b3": 1},
        id_to_inci={1: "Niacinamide"},
        fuzzy_matcher=fuzzy_matcher
    )
    
    results = matcher.match_tokens_batch(["Vitamin B3", "Vit B3"])
    assert len(results) == 2
    assert results[0].match_method == "exact"
    assert results[1].match_method == "embedding"

@patch("app.embedding_matcher.get_sentence_transformer")
def test_embedding_matcher_match_list(mock_get_transformer, db_session):
    mock_model = MagicMock()
    mock_get_transformer.return_value = mock_model
    
    q_emb = np.array([1.0/np.sqrt(384)] * 384, dtype=np.float32)
    mock_model.encode.return_value = np.array([q_emb])
    
    alias_emb = np.array([1.0/np.sqrt(384)] * 384, dtype=np.float32)
    
    fuzzy_matcher = MagicMock()
    
    matcher = EmbeddingMatcher(
        alias_names=["vitamin b3"],
        embeddings=np.array([alias_emb], dtype=np.float32),
        alias_to_ingredient_id={"vitamin b3": 1},
        id_to_inci={1: "Niacinamide"},
        fuzzy_matcher=fuzzy_matcher
    )
    
    results = matcher.match_list("Vitamin B3, Vit B3")
    assert len(results) == 2
    assert results[0].match_method == "exact"
    assert results[1].match_method == "embedding"

@patch("app.embedding_matcher.SessionLocal")
@patch("app.embedding_matcher.get_sentence_transformer")
def test_embedding_matcher_postgres_match_token(mock_get_transformer, mock_session_local):
    with patch("app.models.Alias.embedding") as mock_embedding:
        mock_embedding.cosine_distance.return_value = "dummy_distance_col"
        mock_model = MagicMock()
        mock_get_transformer.return_value = mock_model
        q_emb = np.array([0.1] * 384, dtype=np.float32)
        mock_model.encode.return_value = np.array([q_emb])
        
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        
        # Mock query chain
        mock_query = mock_db.query.return_value
        mock_filter = mock_query.filter.return_value
        mock_order = mock_filter.order_by.return_value
        mock_limit = mock_order.limit.return_value
        
        # Mock rows: returns (Alias, distance)
        # Cosine distance = 1.0 - Cosine similarity.
        # To get sim = 0.9, distance = 0.1
        alias_row = Alias(name="Vitamin B3", ingredient_id=1)
        mock_limit.all.return_value = [(alias_row, 0.1)]
        
        fuzzy_matcher = MagicMock()
        matcher = EmbeddingMatcher(
            alias_names=[],
            embeddings=np.empty((0, 384), dtype=np.float32),
            alias_to_ingredient_id={"vitamin b3": 1},
            id_to_inci={1: "Niacinamide"},
            fuzzy_matcher=fuzzy_matcher
        )
        matcher._is_postgres = True
        
        match = matcher.match_token("Vit B3")
        assert match.status == "matched"
        assert match.match_method == "embedding"
        assert match.matched_inci == "Niacinamide"
        assert match.confidence == 90

@patch("app.embedding_matcher.SessionLocal")
@patch("app.embedding_matcher.get_sentence_transformer")
def test_embedding_matcher_postgres_match_tokens_batch(mock_get_transformer, mock_session_local):
    with patch("app.models.Alias.embedding") as mock_embedding:
        mock_embedding.cosine_distance.return_value = "dummy_distance_col"
        mock_model = MagicMock()
        mock_get_transformer.return_value = mock_model
        q_emb = np.array([0.1] * 384, dtype=np.float32)
        mock_model.encode.return_value = np.array([q_emb])
        
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        
        # Mock query chain
        mock_query = mock_db.query.return_value
        mock_filter = mock_query.filter.return_value
        mock_order = mock_filter.order_by.return_value
        mock_limit = mock_order.limit.return_value
        
        alias_row = Alias(name="Vitamin B3", ingredient_id=1)
        mock_limit.all.return_value = [(alias_row, 0.1)]
        
        fuzzy_matcher = MagicMock()
        matcher = EmbeddingMatcher(
            alias_names=[],
            embeddings=np.empty((0, 384), dtype=np.float32),
            alias_to_ingredient_id={"vitamin b3": 1},
            id_to_inci={1: "Niacinamide"},
            fuzzy_matcher=fuzzy_matcher
        )
        matcher._is_postgres = True
        
        results = matcher.match_tokens_batch(["Vit B3"])
        assert len(results) == 1
        assert results[0].match_method == "embedding"


