import unittest
from unittest.mock import patch, MagicMock

import pytest

from app.models import Ingredient
from app.explain import (
    explain_ingredient,
    explain_ingredient_llm,
    explain_ingredients_llm_batch,
    _build_batch_prompt,
)


def _ing(name, **kw):
    return Ingredient(inci_name=name, **kw)


def test_build_batch_prompt():
    ingredients = [
        _ing("Niacinamide", function="soothing", comedogenic=0),
        _ing("Coconut Oil", function="emollient", comedogenic=4, irritant="yes"),
    ]
    prompt = _build_batch_prompt(ingredients)
    assert "Explain the following ingredients using ONLY their structured records below:" in prompt
    assert "INCI Name: NIACINAMIDE" in prompt
    assert "Function: soothing" in prompt
    assert "INCI Name: COCONUT OIL" in prompt
    assert "comedogenic rating: 4/5" in prompt
    assert "irritant: yes" in prompt


@patch("app.cache.get_cached")
@patch("app.cache.set_cached")
@patch("app.explain.is_available")
@patch("app.explain.ask_batch_explanations")
def test_explain_ingredients_llm_batch_all_cached(
    mock_ask, mock_is_available, mock_set_cached, mock_get_cached
):
    """If all ingredients are cached, we should get them from cache and not call LLM."""
    mock_get_cached.side_effect = lambda k: {
        "sg:explain:NIACINAMIDE": "Niacinamide is soothing.",
        "sg:explain:GLYCERIN": "Glycerin is a humectant.",
    }.get(k)
    mock_is_available.return_value = True

    ingredients = [
        _ing("Niacinamide", function="soothing"),
        _ing("Glycerin", function="humectant"),
    ]

    res = explain_ingredients_llm_batch(ingredients)

    assert res == {
        "NIACINAMIDE": "Niacinamide is soothing.",
        "GLYCERIN": "Glycerin is a humectant.",
    }
    mock_get_cached.assert_any_call("sg:explain:NIACINAMIDE")
    mock_get_cached.assert_any_call("sg:explain:GLYCERIN")
    mock_ask.assert_not_called()
    mock_set_cached.assert_not_called()


@patch("app.cache.get_cached")
@patch("app.cache.set_cached")
@patch("app.explain.is_available")
@patch("app.explain.ask_batch_explanations")
def test_explain_ingredients_llm_batch_cache_miss(
    mock_ask, mock_is_available, mock_set_cached, mock_get_cached
):
    """If there are cache misses, call LLM and cache the results."""
    # Niacinamide is cached, Glycerin is a miss
    mock_get_cached.side_effect = lambda k: {
        "sg:explain:NIACINAMIDE": "Niacinamide is soothing.",
    }.get(k)
    mock_is_available.return_value = True
    
    mock_ask.return_value = {
        "GLYCERIN": "Glycerin is a humectant.",
    }

    ingredients = [
        _ing("Niacinamide", function="soothing"),
        _ing("Glycerin", function="humectant"),
    ]

    res = explain_ingredients_llm_batch(ingredients)

    assert res == {
        "NIACINAMIDE": "Niacinamide is soothing.",
        "GLYCERIN": "Glycerin is a humectant.",
    }
    
    # Glycerin should be cached
    mock_set_cached.assert_called_once_with(
        "sg:explain:GLYCERIN", "Glycerin is a humectant.", ttl=86400 * 30
    )


@patch("app.cache.get_cached")
@patch("app.cache.set_cached")
@patch("app.explain.is_available")
@patch("app.explain.ask_batch_explanations")
def test_explain_ingredients_llm_batch_fallback(
    mock_ask, mock_is_available, mock_set_cached, mock_get_cached
):
    """If LLM fails or is unavailable, fall back to offline templates."""
    mock_get_cached.return_value = None
    mock_is_available.return_value = False

    ingredients = [
        _ing("Niacinamide", function="soothing"),
    ]

    res = explain_ingredients_llm_batch(ingredients)
    
    assert "Niacinamide" in res["NIACINAMIDE"]
    assert "soothes" in res["NIACINAMIDE"]
    mock_ask.assert_not_called()
    mock_set_cached.assert_not_called()


@patch("app.cache.get_cached")
@patch("app.cache.set_cached")
@patch("app.explain.explain_ingredients_llm_batch")
def test_explain_ingredient_llm_single(
    mock_batch, mock_set_cached, mock_get_cached
):
    """Verify explain_ingredient_llm calls the batch function and returns the correct explanation."""
    mock_get_cached.return_value = None
    mock_batch.return_value = {
        "NIACINAMIDE": "Niacinamide is nice.",
    }
    
    ing = _ing("Niacinamide", function="soothing")
    res = explain_ingredient_llm(ing)
    
    assert res == "Niacinamide is nice."
    mock_batch.assert_called_once_with([ing])
