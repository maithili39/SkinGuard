"""add password_reset_token_hash to users

Revision ID: a1b2c3d4e5f6
Revises: 996383a461cd
Create Date: 2026-06-14 15:00:00.000000

Fix #4: Adds the one-time-use password reset token guard column (OWASP A04).
The column stores a SHA-256 hash of the most recently issued reset token.
It is set on /forgot-password and cleared (set to NULL) on /reset-password
so that replayed tokens are rejected.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '996383a461cd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('password_reset_token_hash', sa.String(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('password_reset_token_hash')
