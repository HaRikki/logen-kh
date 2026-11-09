"""users.username for pre-defined admin login

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("users", sa.Column("username", sa.String(50)))
    op.create_index("ix_users_username", "users", ["username"], unique=True)

def downgrade() -> None:
    op.drop_index("ix_users_username", table_name="users")
    op.drop_column("users", "username")
