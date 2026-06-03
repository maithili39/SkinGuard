from sqlalchemy import create_engine, text
from app.database import Base
from app.models import Ingredient, Alias, User, Scan

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
print("Tables in Base.metadata:", list(Base.metadata.tables.keys()))
Base.metadata.create_all(engine)
print("Created tables")

# Verify tables exist
with engine.connect() as conn:
    result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table';"))
    tables = [row[0] for row in result]
    print("Tables in SQLite database:", tables)
