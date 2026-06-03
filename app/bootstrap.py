"""Idempotent startup seeding for containers.

Unlike `python -m app.ingestion` (which DROPS and rebuilds every table), this:
  - creates tables if missing (never drops),
  - seeds ingredient data only when the table is empty,
  - preserves users/scans across restarts.

Run:  python -m app.bootstrap
"""

from app.database import Base, engine, SessionLocal
from app.ingestion import AliasRegistry, load_cosing, load_curated
from app.models import Ingredient


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing_count = db.query(Ingredient).count()
        if existing_count > 0:
            print(f"Ingredients already seeded ({existing_count}); skipping.")
            return
        print("Empty database — seeding ingredients...")
        registry = AliasRegistry(db)
        existing = load_cosing(db, registry)
        load_curated(db, registry, existing)
        db.commit()
        print(f"Seeded {db.query(Ingredient).count()} ingredients.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
