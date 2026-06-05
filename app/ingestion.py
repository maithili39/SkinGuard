"""Load ingredient data into the DB.

Two sources, layered deliberately (the trust boundary):

  1. data/reference/cosing_ingredients.csv  -> AUTHORITATIVE EU identity for up to
     ~15,000 ingredients (INCI name, function, CAS, restriction status). OPTIONAL —
     download separately. Provides broad COVERAGE so real labels are recognised.

  2. data/curated/ingredient_flags.csv      -> OUR curated skincare risk flags
     (comedogenic / fungal / pregnancy / irritant) for the common ingredients,
     each with a `source`. Provides DEPTH. Overlaid on top of CosIng.

Load order: CosIng first (broad identity), then curated (overlays flags / inserts
anything CosIng lacks). Works fine with CosIng absent — you just get the 96
curated ingredients.

Run:  python -m app.ingestion
"""

import csv
import os

from app.database import Base, engine, SessionLocal
from app.models import Ingredient, Alias
from app.config import settings
from app.matching import normalize


CURATED_CSV = os.path.join("data", "curated", "ingredient_flags.csv")
COSING_CSV = os.path.join("data", "reference", "cosing_ingredients.csv")

# CosIng column headers vary by export; match case-insensitively against these.
_COSING_NAME_KEYS = ("inci name", "inci_name", "name")
_COSING_FUNC_KEYS = ("function", "functions")
_COSING_CAS_KEYS = ("cas no", "cas_no", "cas")
_COSING_RESTRICTION_KEYS = ("restriction", "restrictions", "annex")


def _clean(value):
    value = (value or "").strip()
    return value or None


def _int_or_none(value):
    value = (value or "").strip()
    return int(value) if value.isdigit() else None


def _pick(row_lower: dict, keys) -> str:
    for k in keys:
        if k in row_lower and row_lower[k]:
            return row_lower[k]
    return ""


class AliasRegistry:
    """Tracks taken alias names so we never violate the unique constraint."""

    def __init__(self, db):
        self.db = db
        self.seen = set()

    def add(self, name: str, ingredient: Ingredient):
        key = (name or "").strip().lower()
        if not key or key in self.seen:
            return
        self.seen.add(key)
        self.db.add(Alias(name=name.strip(), ingredient=ingredient))


# Extra columns whose values make good alternate-name aliases.
_COSING_ALIAS_KEYS = ("inn name", "ph. eur. name", "innm")


def _open_cosing(path):
    """Return a csv.DictReader positioned at the real header.

    The official CosIng export has preamble lines ('sep=,', creation date, a
    title row) before the actual header that starts with 'COSING Ref No'. We skip
    everything up to the line containing 'INCI name'.
    """
    f = open(path, newline="", encoding="utf-8-sig")
    while True:
        line = f.readline()
        if not line:
            break  # EOF without finding header
        if "inci name" in line.lower():
            header = [h.strip() for h in next(csv.reader([line]))]
            return f, csv.DictReader(f, fieldnames=header)
    f.seek(0)
    return f, csv.DictReader(f)  # fallback: assume first line was header


def load_cosing(db, registry: AliasRegistry) -> dict:
    """Bulk-load CosIng identity. Returns {lowercased_inci: Ingredient}."""
    by_name: dict = {}
    if not os.path.exists(COSING_CSV):
        print(f"  (CosIng not found at {COSING_CSV} — skipping; curated-only.)")
        return by_name

    f, reader = _open_cosing(COSING_CSV)
    try:
        batch = 0
        for row in reader:
            low = {
                (k or "").strip().lower(): (v if isinstance(v, str) else "").strip()
                for k, v in row.items()
                if k is not None
            }
            name = _pick(low, _COSING_NAME_KEYS)
            if not name:
                continue
            key = name.lower()
            if key in by_name:
                continue  # de-dupe within CosIng

            restriction = _pick(low, _COSING_RESTRICTION_KEYS).lower()
            status = "restricted" if restriction else "allowed"

            ing = Ingredient(
                inci_name=name,
                function=_clean(_pick(low, _COSING_FUNC_KEYS)),
                cas=_clean(_pick(low, _COSING_CAS_KEYS)),
                regulatory_status=status,
            )
            db.add(ing)
            registry.add(name, ing)
            for alias_key in _COSING_ALIAS_KEYS:
                if low.get(alias_key):
                    registry.add(low[alias_key], ing)
            by_name[key] = ing

            batch += 1
            if batch % 5000 == 0:
                print(f"  ...{batch} rows")
    finally:
        f.close()

    print(f"Loaded {len(by_name)} ingredients from CosIng.")
    return by_name


def load_curated(db, registry: AliasRegistry, existing: dict) -> int:
    """Overlay curated risk flags; insert ingredients CosIng didn't have."""
    with open(CURATED_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    overlaid = inserted = 0
    for row in rows:
        inci = _clean(row["inci_name"])
        if not inci:
            continue

        ing = existing.get(inci.lower())
        if ing is None:
            ing = Ingredient(inci_name=inci, function=_clean(row.get("function")))
            db.add(ing)
            existing[inci.lower()] = ing
            registry.add(inci, ing)
            inserted += 1
        else:
            # Adopt the curated (nicely-cased) name over CosIng's ALL-CAPS form,
            # so BENEFITS / explanations that key on 'Niacinamide' still match.
            ing.inci_name = inci
            # keep CosIng function if curated lacks one
            ing.function = _clean(row.get("function")) or ing.function
            overlaid += 1

        # Curated flags always win — this is our skincare-advice layer.
        ing.comedogenic = _int_or_none(row.get("comedogenic"))
        ing.fungal_acne_safe = _clean(row.get("fungal_acne_safe"))
        ing.pregnancy_safe = _clean(row.get("pregnancy_safe"))
        ing.irritant = _clean(row.get("irritant"))
        ing.notes = _clean(row.get("notes"))
        ing.source = _clean(row.get("source"))
        # Regulatory status from curated CSV overrides CosIng's coarse heuristic.
        curated_status = _clean(row.get("regulatory_status"))
        if curated_status in ("banned", "restricted", "allowed"):
            ing.regulatory_status = curated_status

        for alias in (row.get("aliases") or "").split("|"):
            if alias.strip():
                registry.add(alias, ing)

    print(f"Curated: overlaid {overlaid}, inserted {inserted} new.")
    return overlaid + inserted


def seed_alias_embeddings(db):
    """Batch encode all aliases and save vectors to database."""
    print("Pre-computing and seeding alias embeddings...")
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print("  (sentence-transformers not installed; skipping embedding seeding.)")
        return

    # Check if we actually need to seed
    aliases = db.query(Alias).filter(Alias.embedding == None).all()
    if not aliases:
        print("  All aliases already have embeddings.")
        return

    print(f"  Loading sentence-transformer model for encoding...")
    model = SentenceTransformer("all-MiniLM-L6-v2")

    print(f"  Encoding {len(aliases)} alias names...")
    names = [normalize(a.name) for a in aliases]
    embeddings = model.encode(
        names,
        batch_size=256,
        show_progress_bar=False,
        normalize_embeddings=True,
        convert_to_numpy=True
    )

    is_postgres = settings.database_url.startswith("postgresql")
    print(f"  Saving embeddings to database (is_postgres={is_postgres})...")
    for alias, emb in zip(aliases, embeddings):
        if is_postgres:
            alias.embedding = emb.tolist()
        else:
            alias.embedding = emb.tobytes()

    db.flush()
    print("  Done seeding embeddings.")


def main():
    import sys
    bootstrap = "--bootstrap" in sys.argv or os.environ.get("BOOTSTRAP") == "1"

    if settings.database_url.startswith("postgresql"):
        from sqlalchemy import text
        print("Ensuring pgvector extension is enabled...")
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    db = SessionLocal()
    try:
        if bootstrap:
            Base.metadata.create_all(bind=engine)
            existing_count = db.query(Ingredient).count()
            if existing_count > 0:
                print(f"Ingredients already seeded ({existing_count}); skipping.")
                # Still check if embeddings are missing (e.g. if schema was updated but not seeded)
                seed_alias_embeddings(db)
                db.commit()
                return
            print("Empty database — seeding ingredients...")
        else:
            print("Creating tables (dropping existing)...")
            Base.metadata.drop_all(bind=engine)
            Base.metadata.create_all(bind=engine)

        registry = AliasRegistry(db)
        existing = load_cosing(db, registry)
        load_curated(db, registry, existing)
        
        # Batch seed embeddings
        seed_alias_embeddings(db)
        
        db.commit()

        print(f"Total ingredients: {db.query(Ingredient).count()}")
        print(f"Total searchable names (aliases): {db.query(Alias).count()}")
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
