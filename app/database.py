from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

# check_same_thread is only needed for SQLite; harmless to branch on the URL.
_is_sqlite = settings.database_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if _is_sqlite else {}

# Pool configuration: SQLite uses StaticPool (single connection), Postgres gets
# a proper connection pool with pre-ping to detect stale connections after DB restarts.
_pool_kwargs = {}
if not _is_sqlite:
    _pool_kwargs = {
        "pool_size": 10,
        "max_overflow": 20,
        "pool_pre_ping": True,
    }

engine = create_engine(
    settings.database_url, connect_args=connect_args, future=True, **_pool_kwargs
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
