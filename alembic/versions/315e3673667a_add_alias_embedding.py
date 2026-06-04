"""add_alias_embedding

Revision ID: 315e3673667a
Revises: a1b2c3d4e5f6
Create Date: 2026-06-04 13:31:06.550180

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '315e3673667a'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('aliases')]
    if 'embedding' not in columns:
        is_sqlite = bind.dialect.name == 'sqlite'
        if is_sqlite:
            embedding_type = sa.LargeBinary()
        else:
            try:
                from pgvector.sqlalchemy import Vector
                embedding_type = Vector(384)
            except ImportError:
                embedding_type = sa.LargeBinary()

        with op.batch_alter_table('aliases', schema=None) as batch_op:
            batch_op.add_column(sa.Column('embedding', embedding_type, nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('aliases')]
    if 'embedding' in columns:
        with op.batch_alter_table('aliases', schema=None) as batch_op:
            batch_op.drop_column('embedding')


