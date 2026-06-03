from logging.config import fileConfig
import os

from sqlalchemy import engine_from_config, pool
from alembic import context

# Alembic Config object
config = context.config

# Python logging setup
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Import our models so autogenerate can detect schema changes ──────────────
from app.database import Base  # noqa: E402
import app.models  # noqa: E402, F401 — registers all models on Base.metadata

target_metadata = Base.metadata

# ── Use DATABASE_URL from env (overrides alembic.ini sqlalchemy.url) ─────────
_db_url = os.environ.get("DATABASE_URL")
if _db_url:
    config.set_main_option("sqlalchemy.url", _db_url)


def run_migrations_offline() -> None:
    """Offline mode: emit SQL without a live DB connection."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Render NULL for columns with server_default so diffs are clean.
        render_as_batch=True,  # needed for SQLite ALTER TABLE workarounds
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Online mode: connect to DB and run migrations against it."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # needed for SQLite ALTER TABLE workarounds
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
