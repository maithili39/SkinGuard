import logging

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.cache import cache_info, get_cached, hash_bytes, make_key, set_cached
from app.database import get_db
from app.deps import MAX_UPLOAD_BYTES, VERSION, _limit, get_matcher, limiter
from app.explain import explain_ingredient, explain_ingredient_llm
from app.matching import Matcher
from app.models import Ingredient
from app.ocr import OCRUnavailable
from app.ocr import extract_text as run_ocr
from app.schemas import ChatIn, ChatOut

logger = logging.getLogger("skinguard.misc")

router = APIRouter(tags=["misc"])


@router.get("/health")
def health():
    from app.deps import _embedding_matcher, _matcher
    from app.explain import get_model_name, is_available as llm_ok
    return {
        "status": "ok",
        "matcher_aliases": len(_matcher._choices) if _matcher else 0,
        "embedding_matcher": _embedding_matcher is not None,
        "llm_model": get_model_name() if llm_ok() else "unavailable",
        "llm_available": llm_ok(),
        "cache": cache_info(),
        "version": VERSION,
    }


@router.get("/ingredients/count")
def ingredient_count(db: Session = Depends(get_db)):
    return {"ingredients": db.query(Ingredient).count()}


@router.get("/explain/{name}")
def explain(
    name: str,
    llm: bool = False,
    db: Session = Depends(get_db),
    matcher: Matcher = Depends(get_matcher),
):
    """Plain-language explanation for a single ingredient. Add ?llm=true for Gemini."""
    match = matcher.match_token(name)
    if match.status != "matched":
        raise HTTPException(status_code=404, detail=f"No ingredient found for '{name}'.")
    ing = db.get(Ingredient, match.ingredient_id)
    explanation = explain_ingredient_llm(ing) if llm else explain_ingredient(ing)
    return {
        "ingredient": ing.inci_name,
        "confidence": match.confidence,
        "match_method": match.match_method,
        "explanation": explanation,
        "llm_used": llm,
    }


@router.get("/barcode/{code}")
@limiter.limit(_limit("20/minute"))
def barcode_lookup(code: str, request: Request):
    """Look up product details by barcode via Open Beauty Facts (cached 24 h)."""
    from app.barcode import ProductNotFound, cached_lookup_barcode

    _cache_key = make_key("barcode", code)
    cached = get_cached(_cache_key)
    if cached is not None:
        logger.debug("Cache HIT for barcode=%s", code)
        return cached

    try:
        result = cached_lookup_barcode(code)
    except ProductNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    set_cached(_cache_key, result, ttl=86400)
    logger.debug("Cache SET barcode=%s", code)
    return result


@router.post("/chat", response_model=ChatOut)
@limiter.limit(_limit("10/minute"))
def chat(
    request: Request,
    payload: ChatIn,
    db: Session = Depends(get_db),
    matcher: Matcher = Depends(get_matcher),
):
    """RAG-grounded Q&A about a product's ingredients (rate-limited — LLM calls are expensive)."""
    from app.explain import ask, build_ingredient_context, get_model_name, is_available

    found = payload.analysis_context.get("found_ingredients", [])
    grounding = (
        [f for f in found if f.get("matched_name", "").lower() in {n.lower() for n in payload.ingredient_names}]
        if payload.ingredient_names
        else found[:15]
    )
    grounded_on = [f.get("matched_name", "") for f in grounding]

    if not grounding:
        return ChatOut(
            answer=(
                "I don't have ingredient data for this product yet. "
                "Please run an analysis first so I have structured data to ground my answer on."
            ),
            grounded_on=[],
            source="template",
        )

    # Augment with fresh DB records.
    enriched: list[dict] = []
    for item in grounding:
        name = item.get("matched_name", "")
        match = matcher.match_token(name)
        if match.status == "matched":
            ing = db.get(Ingredient, match.ingredient_id)
            if ing:
                enriched.append({
                    "matched_name": ing.inci_name,
                    "explanation": item.get("explanation") or explain_ingredient_llm(ing),
                    "ingredient": {
                        "function": ing.function,
                        "comedogenic": bool(ing.comedogenic),
                        "irritant": ing.irritant,
                    },
                })
                continue
        enriched.append(item)

    context = build_ingredient_context(enriched)
    summary = payload.analysis_context.get("summary", "")
    if summary:
        context = f"Product summary: {summary}\n\n{context}"

    # Prompt-injection guard.
    _INJECTION_PATTERNS = [
        "ignore previous", "ignore all previous", "ignore above",
        "disregard previous", "forget previous", "forget", "new instruction",
        "act as", "you are now", "pretend you are", "pretend to be",
        "your new role", "system prompt", "jailbreak",
        "do anything now", "dan mode", "developer mode",
    ]
    question_clean = payload.question.strip()[:500]
    if any(p in question_clean.lower() for p in _INJECTION_PATTERNS):
        return ChatOut(
            answer=(
                "I can only answer questions about skincare ingredients "
                "from the analysed product. Please ask a specific ingredient question."
            ),
            grounded_on=grounded_on,
            source="guard",
        )

    answer, source = ask(question_clean, context)
    return ChatOut(answer=answer, grounded_on=grounded_on, source=source)


@router.post("/extract-text")
@limiter.limit(_limit("10/minute"))
async def extract_text(request: Request, file: UploadFile = File(...)):
    """Extract ingredient text from an uploaded label image (OCR, cached 1 h)."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Image too large ({len(contents) // 1024} KB). "
                f"Max is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
            ),
        )

    _cache_key = make_key("ocr", hash_bytes(contents))
    cached = get_cached(_cache_key)
    if cached is not None:
        logger.debug("Cache HIT for OCR hash=%s", _cache_key)
        return cached

    try:
        text = run_ocr(contents)
    except OCRUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {exc}")

    result = {"text": text}
    set_cached(_cache_key, result, ttl=3600)
    return result
