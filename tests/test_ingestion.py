import pytest
from unittest.mock import patch, MagicMock
import os
import csv
import io
import numpy as np

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Ingredient, Alias
from app.ingestion import (
    _clean,
    _int_or_none,
    _pick,
    AliasRegistry,
    load_cosing,
    load_curated,
    seed_alias_embeddings,
)

def test_clean():
    assert _clean("  hello  ") == "hello"
    assert _clean("   ") is None
    assert _clean(None) is None

def test_int_or_none():
    assert _int_or_none("4") == 4
    assert _int_or_none("abc") is None
    assert _int_or_none("  ") is None

def test_pick():
    row = {"inci name": "Niacinamide", "cas no": "98-92-0"}
    assert _pick(row, ("inci name", "name")) == "Niacinamide"
    assert _pick(row, ("other", "cas no")) == "98-92-0"
    assert _pick(row, ("absent",)) == ""

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

def test_alias_registry(db_session):
    registry = AliasRegistry(db_session)
    ing = Ingredient(inci_name="Test Ing")
    db_session.add(ing)
    db_session.flush()

    registry.add("Test Alias", ing)
    assert len(registry.seen) == 1
    assert "test alias" in registry.seen

    # duplicates shouldn't be added
    registry.add("Test Alias", ing)
    registry.add("  test alias  ", ing)
    assert len(registry.seen) == 1

def test_load_cosing_file_not_found(db_session):
    registry = AliasRegistry(db_session)
    with patch("os.path.exists", return_value=False):
        res = load_cosing(db_session, registry)
        assert res == {}

def test_load_cosing_success(db_session):
    registry = AliasRegistry(db_session)
    csv_content = (
        "COSING Ref No,INCI name,Inn name,Ph. Eur. name,CAS No,Function,Restriction\n"
        "12345,NIACINAMIDE,,,98-92-0,soothing,Annex III/123\n"
        "67890,WATER,,,7732-18-5,solvent,\n"
    )
    
    with patch("os.path.exists", return_value=True), \
         patch("app.ingestion._open_cosing") as mock_open:
        
        f = io.StringIO(csv_content)
        reader = csv.DictReader(f)
        mock_open.return_value = (f, reader)
        
        res = load_cosing(db_session, registry)
        assert "niacinamide" in res
        assert "water" in res
        assert res["niacinamide"].regulatory_status == "restricted"
        assert res["water"].regulatory_status == "allowed"

def test_load_curated(db_session):
    registry = AliasRegistry(db_session)
    
    # Pre-populate some ingredient in db_session
    ing_niacinamide = Ingredient(inci_name="NIACINAMIDE", regulatory_status="allowed")
    db_session.add(ing_niacinamide)
    db_session.commit()
    
    existing = {"niacinamide": ing_niacinamide}
    
    csv_content = (
        "inci_name,aliases,function,comedogenic,fungal_acne_safe,pregnancy_safe,irritant,notes,source,regulatory_status\n"
        "Niacinamide,Vitamin B3,soothing,0,yes,yes,no,,,\n"
        "Coconut Oil,Cocos Nucifera Oil,emollient,4,no,yes,yes,,,\n"
    )
    
    with patch("builtins.open", return_value=io.StringIO(csv_content)):
        count = load_curated(db_session, registry, existing)
        assert count == 2
        # Niacinamide should be updated (case normalized and flags set)
        assert ing_niacinamide.inci_name == "Niacinamide"
        assert ing_niacinamide.comedogenic == 0
        assert ing_niacinamide.fungal_acne_safe == "yes"
        
        # Coconut oil should be inserted
        assert "coconut oil" in existing
        new_ing = existing["coconut oil"]
        assert new_ing.inci_name == "Coconut Oil"
        assert new_ing.comedogenic == 4

@patch("app.ingestion.settings")
@patch("app.ingestion.normalize")
@patch("app.ingestion.get_sentence_transformer")
def test_seed_alias_embeddings(mock_get_transformer, mock_normalize, mock_settings, db_session):
    mock_settings.database_url = "sqlite:///:memory:"
    mock_normalize.side_effect = lambda x: x.lower()

    # Mock the model returned by get_sentence_transformer
    mock_model = MagicMock()
    mock_get_transformer.return_value = mock_model
    # Let's say we encode 2 items
    mock_model.encode.return_value = np.array([
        [0.1] * 384,
        [0.2] * 384
    ], dtype=np.float32)

    ing = Ingredient(inci_name="Niacinamide")
    db_session.add(ing)
    db_session.flush()

    alias1 = Alias(name="Vitamin B3", ingredient=ing)
    alias2 = Alias(name="Nicotinamide", ingredient=ing)
    db_session.add(alias1)
    db_session.add(alias2)
    db_session.commit()

    seed_alias_embeddings(db_session)

    # Check that embeddings are populated as bytes (on sqlite)
    db_session.refresh(alias1)
    db_session.refresh(alias2)
    assert alias1.embedding is not None
    assert alias2.embedding is not None
    arr1 = np.frombuffer(alias1.embedding, dtype=np.float32)
    assert len(arr1) == 384
    assert arr1[0] == pytest.approx(0.1)

def test_open_cosing_with_preamble():
    from app.ingestion import _open_cosing
    csv_content = (
        "sep=,\n"
        "COSING Export File\n"
        "INCI name,CAS No\n"
        "NIACINAMIDE,98-92-0\n"
    )
    with patch("builtins.open", return_value=io.StringIO(csv_content)):
        f, reader = _open_cosing("dummy_path")
        rows = list(reader)
        assert len(rows) == 1
        assert rows[0]["INCI name"] == "NIACINAMIDE"
        f.close()

def test_open_cosing_fallback():
    from app.ingestion import _open_cosing
    csv_content = (
        "INCI name,CAS No\n"
        "WATER,7732-18-5\n"
    )
    with patch("builtins.open", return_value=io.StringIO(csv_content)):
        f, reader = _open_cosing("dummy_path")
        rows = list(reader)
        assert len(rows) == 1
        assert rows[0]["INCI name"] == "WATER"
        f.close()

@patch("app.ingestion.settings")
@patch("app.ingestion.seed_alias_embeddings")
@patch("app.ingestion.load_curated")
@patch("app.ingestion.load_cosing")
@patch("app.ingestion.SessionLocal")
def test_main(mock_session_local, mock_load_cosing, mock_load_curated, mock_seed, mock_settings):
    from app.ingestion import main
    mock_settings.database_url = "sqlite:///:memory:"
    
    mock_db = MagicMock()
    mock_session_local.return_value = mock_db
    
    with patch("sys.argv", ["ingestion.py", "--bootstrap"]):
        # Mock Ingredient query
        mock_db.query().count.return_value = 0
        main()
        mock_seed.assert_called_once()
        mock_db.commit.assert_called_once()

