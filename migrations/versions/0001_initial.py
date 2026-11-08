"""initial schema

Revision ID: 0001
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

TS = sa.DateTime(timezone=True)
def pk(): return sa.Column("id", sa.Integer, primary_key=True)
def fk(name, target, ondelete=None, nullable=False): return sa.Column(name, sa.Integer, sa.ForeignKey(target, ondelete=ondelete), nullable=nullable)
def created(): return sa.Column("created_at", TS, nullable=False)

def merchant_common():
    return [sa.Column("enabled", sa.Boolean, nullable=False), sa.Column("connection_status", sa.String(20), nullable=False),
            sa.Column("last_tested_at", TS), sa.Column("last_test_error", sa.String(200)), created()]

def upgrade() -> None:
    op.create_table("users", pk(),
        sa.Column("email", sa.String(255)), sa.Column("password_hash", sa.String(255)),
        sa.Column("display_name", sa.String(120)), sa.Column("avatar_url", sa.String(500)),
        sa.Column("status", sa.String(20), nullable=False), sa.Column("session_version", sa.Integer, nullable=False),
        created(), sa.Column("last_login_at", TS))
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table("admins", pk(), fk("user_id", "users.id", "CASCADE"), sa.Column("role", sa.String(20), nullable=False),
        created(), sa.UniqueConstraint("user_id"))

    op.create_table("user_social_accounts", pk(), fk("user_id", "users.id", "CASCADE"),
        sa.Column("provider", sa.String(20), nullable=False), sa.Column("provider_user_id", sa.String(64), nullable=False),
        sa.Column("username", sa.String(120)), sa.Column("email", sa.String(255)), sa.Column("avatar_url", sa.String(500)),
        created(), sa.UniqueConstraint("provider", "provider_user_id"))
    op.create_index("ix_user_social_accounts_user_id", "user_social_accounts", ["user_id"])

    op.create_table("password_reset_tokens", pk(), fk("user_id", "users.id", "CASCADE"),
        sa.Column("token_hash", sa.String(64), nullable=False), sa.Column("expires_at", TS, nullable=False),
        sa.Column("used", sa.Boolean, nullable=False))
    op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])
    op.create_index("ix_password_reset_tokens_token_hash", "password_reset_tokens", ["token_hash"], unique=True)

    op.create_table("api_keys", pk(), fk("user_id", "users.id", "CASCADE"),
        sa.Column("name", sa.String(60), nullable=False), sa.Column("prefix", sa.String(20), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False), sa.Column("permissions", sa.String(200), nullable=False),
        sa.Column("revoked", sa.Boolean, nullable=False), sa.Column("last_used_at", TS),
        sa.Column("request_count", sa.Integer, nullable=False), created())
    op.create_index("ix_api_keys_user_id", "api_keys", ["user_id"])
    op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"], unique=True)

    op.create_table("provider_credentials", pk(), fk("user_id", "users.id", "CASCADE"),
        sa.Column("provider", sa.String(30), nullable=False), sa.Column("label", sa.String(80), nullable=False),
        sa.Column("key_enc", sa.Text, nullable=False), sa.Column("key_hint", sa.String(12), nullable=False), created())
    op.create_index("ix_provider_credentials_user_id", "provider_credentials", ["user_id"])

    op.create_table("aba_merchants", pk(), fk("user_id", "users.id", "CASCADE"),
        fk("credential_id", "provider_credentials.id", "RESTRICT"),
        sa.Column("name", sa.String(120), nullable=False), sa.Column("aba_link", sa.String(500)), *merchant_common())
    op.create_index("ix_aba_merchants_user_id", "aba_merchants", ["user_id"])

    op.create_table("bakong_accounts", pk(), fk("user_id", "users.id", "CASCADE"),
        fk("credential_id", "provider_credentials.id", "RESTRICT"),
        sa.Column("bakong_id", sa.String(120), nullable=False), sa.Column("account_name", sa.String(120), nullable=False),
        *merchant_common())
    op.create_index("ix_bakong_accounts_user_id", "bakong_accounts", ["user_id"])

    op.create_table("payments", pk(), sa.Column("order_id", sa.String(40), nullable=False), fk("user_id", "users.id", "CASCADE"),
        sa.Column("kind", sa.String(10), nullable=False),
        fk("aba_merchant_id", "aba_merchants.id", "SET NULL", True), fk("bakong_account_id", "bakong_accounts.id", "SET NULL", True),
        sa.Column("merchant_name", sa.String(120), nullable=False), sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False), sa.Column("status", sa.String(12), nullable=False),
        sa.Column("transaction_id", sa.String(120)), sa.Column("provider_ref", sa.String(200)),
        sa.Column("qr_string", sa.Text), sa.Column("qr_image", sa.Text), sa.Column("deeplink", sa.Text),
        sa.Column("reference", sa.String(120)), sa.Column("provider_raw", sa.Text, nullable=False),
        sa.Column("idempotency_key", sa.String(120)), created(), sa.Column("expires_at", TS, nullable=False),
        sa.Column("paid_at", TS), sa.Column("last_checked_at", TS),
        sa.UniqueConstraint("user_id", "idempotency_key"))
    op.create_index("ix_payments_order_id", "payments", ["order_id"], unique=True)
    op.create_index("ix_payments_user_id", "payments", ["user_id"])
    op.create_index("ix_payments_status_created", "payments", ["status", "created_at"])

    op.create_table("webhooks", pk(), fk("user_id", "users.id", "CASCADE"), sa.Column("url", sa.String(500), nullable=False),
        sa.Column("secret_enc", sa.Text, nullable=False), sa.Column("events", sa.String(120), nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False), created())
    op.create_index("ix_webhooks_user_id", "webhooks", ["user_id"])

    op.create_table("webhook_deliveries", pk(), fk("webhook_id", "webhooks.id", "CASCADE"), fk("user_id", "users.id", "CASCADE"),
        fk("payment_id", "payments.id", "SET NULL", True), sa.Column("event", sa.String(40), nullable=False),
        sa.Column("payload", sa.Text, nullable=False), sa.Column("status_code", sa.Integer), sa.Column("ok", sa.Boolean, nullable=False),
        sa.Column("error", sa.String(200)), sa.Column("attempts", sa.Integer, nullable=False), sa.Column("next_retry_at", TS), created())
    op.create_index("ix_webhook_deliveries_webhook_id", "webhook_deliveries", ["webhook_id"])
    op.create_index("ix_webhook_deliveries_user_id", "webhook_deliveries", ["user_id"])

    op.create_table("api_usage_logs", pk(), fk("user_id", "users.id", "SET NULL", True), fk("api_key_id", "api_keys.id", "SET NULL", True),
        sa.Column("method", sa.String(8), nullable=False), sa.Column("path", sa.String(200), nullable=False),
        sa.Column("status_code", sa.Integer, nullable=False), sa.Column("ip", sa.String(64)),
        sa.Column("latency_ms", sa.Integer, nullable=False), created())
    op.create_index("ix_api_usage_logs_user_id", "api_usage_logs", ["user_id"])
    op.create_index("ix_api_usage_logs_api_key_id", "api_usage_logs", ["api_key_id"])
    op.create_index("ix_api_usage_logs_created_at", "api_usage_logs", ["created_at"])

    op.create_table("audit_logs", pk(), fk("user_id", "users.id", "SET NULL", True), sa.Column("action", sa.String(60), nullable=False),
        sa.Column("target", sa.String(120)), sa.Column("ip", sa.String(64)), created())
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    op.create_table("domain_settings", sa.Column("key", sa.String(60), primary_key=True), sa.Column("value", sa.Text),
        sa.Column("updated_at", TS, nullable=False))

def downgrade() -> None:
    for t in ("domain_settings", "audit_logs", "api_usage_logs", "webhook_deliveries", "webhooks", "payments", "bakong_accounts",
              "aba_merchants", "provider_credentials", "api_keys", "password_reset_tokens", "user_social_accounts", "admins", "users"):
        op.drop_table(t)
