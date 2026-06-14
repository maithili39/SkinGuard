"""Alembic environment for SkinGuard.

The database URL and target metadata are taken from the application itself
(``app.config.settings`` and ``app.database.Base``) rather than hard-coded in
``alembic.ini`` — so migrations always target the same DB the app uses, and
``--autogenerate`` stays in sync with the SQLAlchemy models.
"""

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# Import the app's metadata + configured DB URL. All models must be imported so
# their tables are registered on Base.metadata before autogenerate runs.
from app.config import settings
from app.database import Base
import app.models  # noqa: F401  (registers Ingredient/Alias/User/Scan on Base)

config = context.config

# Inject the application's database URL so we never duplicate it in alembic.ini.
# `%` is escaped because ConfigParser performs interpolation on this value.
config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without a live connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=url.startswith("sqlite"),
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode against a live connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # batch mode lets ALTER TABLE work on SQLite (used for local dev).
        is_sqlite = connection.dialect.name == "sqlite"
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=is_sqlite,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
