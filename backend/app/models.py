import datetime as dt
from sqlalchemy import (String, Integer, Boolean, DateTime, Text, Numeric, ForeignKey, UniqueConstraint, Index)
from sqlalchemy.orm import Mapped, mapped_column as col
from .db import Base

now = lambda: dt.datetime.now(dt.timezone.utc)
TS = DateTime(timezone=True)

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = col(Integer, primary_key=True)
    email: Mapped[str | None] = col(String(255), unique=True, index=True, nullable=True)
    password_hash: Mapped[str | None] = col(String(255), nullable=True)
    display_name: Mapped[str | None] = col(String(120), nullable=True)
    avatar_url: Mapped[str | None] = col(String(500), nullable=True)
    status: Mapped[str] = col(String(20), default="active")  # active | suspended
    session_version: Mapped[int] = col(Integer, default=1)    # bump to invalidate every session
    created_at: Mapped[dt.datetime] = col(TS, default=now)
    last_login_at: Mapped[dt.datetime | None] = col(TS, nullable=True)

class Admin(Base):
    __tablename__ = "admins"
    id: Mapped[int] = col(Integer, primary_key=True)
    user_id: Mapped[int] = col(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    role: Mapped[str] = col(String(20), default="admin")
    created_at: Mapped[dt.datetime] = col(TS, default=now)

class UserSocialAccount(Base):
    __tablename__ = "user_social_accounts"
    __table_args__ = (UniqueConstraint("provider", "provider_user_id"),)
    id: Mapped[int] = col(Integer, primary_key=True)
    user_id: Mapped[int] = col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = col(String(20))  # google | github | telegram
    provider_user_id: Mapped[str] = col(String(64))
    username: Mapped[str | None] = col(String(120), nullable=True)
    email: Mapped[str | None] = col(String(255), nullable=True)
    avatar_url: Mapped[str | None] = col(String(500), nullable=True)
    created_at: Mapped[dt.datetime] = col(TS, default=now)

class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[int] = col(Integer, primary_key=True)
    user_id: Mapped[int] = col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = col(String(64), unique=True, index=True)
    expires_at: Mapped[dt.datetime] = col(TS)
    used: Mapped[bool] = col(Boolean, default=False)

class ApiKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[int] = col(Integer, primary_key=True)
    user_id: Mapped[int] = col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = col(String(60))
    prefix: Mapped[str] = col(String(20))
    key_hash: Mapped[str] = col(String(64), unique=True, index=True)  # sha256 of the secret; secret is never stored
    permissions: Mapped[str] = col(String(200), default="payments:create,payments:read")
    revoked: Mapped[bool] = col(Boolean, default=False)
    last_used_at: Mapped[dt.datetime | None] = col(TS, nullable=True)
    request_count: Mapped[int] = col(Integer, default=0)
    created_at: Mapped[dt.datetime] = col(TS, default=now)

class ProviderCredential(Base):
    __tablename__ = "provider_credentials"
    id: Mapped[int] = col(Integer, primary_key=True)
    user_id: Mapped[int] = col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = col(String(30), default="khqrpay")
    label: Mapped[str] = col(String(80), default="")
    key_enc: Mapped[str] = col(Text)           # Fernet ciphertext
    key_hint: Mapped[str] = col(String(12), default="")  # last 4 chars only
    created_at: Mapped[dt.datetime] = col(TS, default=now)

class _Merchant:
    id: Mapped[int] = col(Integer, primary_key=True)
    enabled: Mapped[bool] = col(Boolean, default=True)
    connection_status: Mapped[str] = col(String(20), default="untested")  # untested | ok | failed
    last_tested_at: Mapped[dt.datetime | None] = col(TS, nullable=True)
    last_test_error: Mapped[str | None] = col(String(200), nullable=True)
    created_at: Mapped[dt.datetime] = col(TS, default=now)

class AbaMerchant(Base, _Merchant):
    __tablename__ = "aba_merchants"
    user_id: Mapped[int] = col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    credential_id: Mapped[int] = col(ForeignKey("provider_credentials.id", ondelete="RESTRICT"))
    name: Mapped[str] = col(String(120))
    aba_link: Mapped[str | None] = col(String(500), nullable=True)  # informational: the static link lives in the provider key

class BakongAccount(Base, _Merchant):
    __tablename__ = "bakong_accounts"
    user_id: Mapped[int] = col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    credential_id: Mapped[int] = col(ForeignKey("provider_credentials.id", ondelete="RESTRICT"))
    bakong_id: Mapped[str] = col(String(120))
    account_name: Mapped[str] = col(String(120))

class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key"), Index("ix_payments_status_created", "status", "created_at"))
    id: Mapped[int] = col(Integer, primary_key=True)
    order_id: Mapped[str] = col(String(40), unique=True, index=True)
    user_id: Mapped[int] = col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = col(String(10))  # aba | bakong
    aba_merchant_id: Mapped[int | None] = col(ForeignKey("aba_merchants.id", ondelete="SET NULL"), nullable=True)
    bakong_account_id: Mapped[int | None] = col(ForeignKey("bakong_accounts.id", ondelete="SET NULL"), nullable=True)
    merchant_name: Mapped[str] = col(String(120), default="")
    amount: Mapped[float] = col(Numeric(18, 2))
    currency: Mapped[str] = col(String(8), default="USD")
    status: Mapped[str] = col(String(12), default="pending")  # pending | paid | expired
    transaction_id: Mapped[str | None] = col(String(120), nullable=True)
    provider_ref: Mapped[str | None] = col(String(200), nullable=True)
    qr_string: Mapped[str | None] = col(Text, nullable=True)
    qr_image: Mapped[str | None] = col(Text, nullable=True)
    deeplink: Mapped[str | None] = col(Text, nullable=True)
    reference: Mapped[str | None] = col(String(120), nullable=True)  # caller's own reference
    provider_raw: Mapped[str] = col(Text, default="{}")
    idempotency_key: Mapped[str | None] = col(String(120), nullable=True)
    created_at: Mapped[dt.datetime] = col(TS, default=now)
    expires_at: Mapped[dt.datetime] = col(TS)
    paid_at: Mapped[dt.datetime | None] = col(TS, nullable=True)
    last_checked_at: Mapped[dt.datetime | None] = col(TS, nullable=True)

class Webhook(Base):
    __tablename__ = "webhooks"
    id: Mapped[int] = col(Integer, primary_key=True)
    user_id: Mapped[int] = col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = col(String(500))
    secret_enc: Mapped[str] = col(Text)
    events: Mapped[str] = col(String(120), default="payment.pending,payment.paid,payment.expired")
    enabled: Mapped[bool] = col(Boolean, default=True)
    created_at: Mapped[dt.datetime] = col(TS, default=now)

class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"
    id: Mapped[int] = col(Integer, primary_key=True)
    webhook_id: Mapped[int] = col(ForeignKey("webhooks.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    payment_id: Mapped[int | None] = col(ForeignKey("payments.id", ondelete="SET NULL"), nullable=True)
    event: Mapped[str] = col(String(40))
    payload: Mapped[str] = col(Text)
    status_code: Mapped[int | None] = col(Integer, nullable=True)
    ok: Mapped[bool] = col(Boolean, default=False)
    error: Mapped[str | None] = col(String(200), nullable=True)
    attempts: Mapped[int] = col(Integer, default=0)
    next_retry_at: Mapped[dt.datetime | None] = col(TS, nullable=True)
    created_at: Mapped[dt.datetime] = col(TS, default=now)

class ApiUsageLog(Base):
    __tablename__ = "api_usage_logs"
    id: Mapped[int] = col(Integer, primary_key=True)
    user_id: Mapped[int | None] = col(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    api_key_id: Mapped[int | None] = col(ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True, index=True)
    method: Mapped[str] = col(String(8))
    path: Mapped[str] = col(String(200))
    status_code: Mapped[int] = col(Integer)
    ip: Mapped[str | None] = col(String(64), nullable=True)
    latency_ms: Mapped[int] = col(Integer, default=0)
    created_at: Mapped[dt.datetime] = col(TS, default=now, index=True)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = col(Integer, primary_key=True)
    user_id: Mapped[int | None] = col(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action: Mapped[str] = col(String(60))
    target: Mapped[str | None] = col(String(120), nullable=True)
    ip: Mapped[str | None] = col(String(64), nullable=True)
    created_at: Mapped[dt.datetime] = col(TS, default=now, index=True)

class DomainSetting(Base):
    __tablename__ = "domain_settings"
    key: Mapped[str] = col(String(60), primary_key=True)
    value: Mapped[str | None] = col(Text, nullable=True)
    updated_at: Mapped[dt.datetime] = col(TS, default=now, onupdate=now)
