"""initial_schema_with_auth

Revision ID: b2eff314d93c
Revises: 
Create Date: 2026-06-03 15:14:13.986653

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2eff314d93c'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 1. Create ingredients table if not exists
    if 'ingredients' not in tables:
        op.create_table(
            'ingredients',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('inci_name', sa.String(), nullable=False),
            sa.Column('function', sa.String(), nullable=True),
            sa.Column('cas', sa.String(), nullable=True),
            sa.Column('regulatory_status', sa.String(), server_default='allowed'),
            sa.Column('comedogenic', sa.Integer(), nullable=True),
            sa.Column('fungal_acne_safe', sa.String(), nullable=True),
            sa.Column('pregnancy_safe', sa.String(), nullable=True),
            sa.Column('irritant', sa.String(), nullable=True),
            sa.Column('notes', sa.String(), nullable=True),
            sa.Column('source', sa.String(), nullable=True)
        )
        op.create_index('ix_ingredients_inci_name', 'ingredients', ['inci_name'], unique=True)

    # 2. Create users table if not exists
    if 'users' not in tables:
        op.create_table(
            'users',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('email', sa.String(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('pregnant', sa.Boolean(), server_default='0'),
            sa.Column('sensitive_skin', sa.Boolean(), server_default='0'),
            sa.Column('acne_prone', sa.Boolean(), server_default='0'),
            sa.Column('fungal_acne', sa.Boolean(), server_default='0'),
            sa.Column('avoid_list', sa.JSON(), nullable=True)
        )
        op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # 3. Create aliases table if not exists
    if 'aliases' not in tables:
        op.create_table(
            'aliases',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('ingredient_id', sa.Integer(), sa.ForeignKey('ingredients.id'), nullable=False),
            sa.UniqueConstraint('name', name='uq_alias_name')
        )
        op.create_index('ix_aliases_name', 'aliases', ['name'], unique=False)

    # 4. Create scans table if not exists
    if 'scans' not in tables:
        op.create_table(
            'scans',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('input_text', sa.String(), nullable=False),
            sa.Column('safety_score', sa.Integer(), nullable=False),
            sa.Column('coverage_percent', sa.Integer(), nullable=False),
            sa.Column('summary', sa.String(), nullable=True),
            sa.Column('result', sa.JSON(), nullable=True)
        )
        op.create_index('ix_scans_user_id', 'scans', ['user_id'], unique=False)

    # 5. Add hashed_password column to users if not exists
    columns = [c['name'] for c in inspector.get_columns('users')]
    if 'hashed_password' not in columns:
        with op.batch_alter_table('users', schema=None) as batch_op:
            batch_op.add_column(sa.Column('hashed_password', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_table('scans')
    op.drop_table('aliases')
    op.drop_table('users')
    op.drop_table('ingredients')

