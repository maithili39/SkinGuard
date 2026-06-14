"""Add soft delete, GDPR audit trail, and audit_logs table (Tier 3-1)

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-06-14

What this migration does
------------------------
1. users.deleted_at       — soft-delete timestamp (NULL = active)
2. users.gdpr_audit       — JSON audit trail appended per event
3. scans.deleted_at       — soft-delete timestamp for scans
4. audit_logs table       — dedicated, queryable GDPR/security audit log
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users table additions ──────────────────────────────────────────────
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "gdpr_audit",
            sa.JSON(),
            nullable=False,
            server_default="[]",
        ),
    )

    # ── scans table additions ──────────────────────────────────────────────
    op.add_column("scans", sa.Column("deleted_at", sa.DateTime(), nullable=True))

    # ── audit_logs table ───────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_occurred_at", "audit_logs", ["occurred_at"])
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])

    # ── anon_scan_events table (T3-5) ─────────────────────────────────────
    op.create_table(
        "anon_scan_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "occurred_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("score_band", sa.String(), nullable=True),
        sa.Column("matched_count", sa.Integer(), nullable=True),
        sa.Column("coverage_percent", sa.Integer(), nullable=True),
        sa.Column("has_danger", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("has_warning", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("input_mode", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_anon_scan_events_occurred_at", "anon_scan_events", ["occurred_at"])



def downgrade() -> None:
    op.drop_index("ix_anon_scan_events_occurred_at", table_name="anon_scan_events")
    op.drop_table("anon_scan_events")
    op.drop_index("ix_audit_logs_user_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_occurred_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_column("scans", "deleted_at")
    op.drop_column("users", "gdpr_audit")
    op.drop_column("users", "deleted_at")

