"""Environment config + admin-editable runtime settings (domain_settings table)."""
import os, time

E = os.environ
DATABASE_URL = E.get("DATABASE_URL", "sqlite:///./dev.db").replace("postgres://", "postgresql://", 1)
SECRET_KEY = E.get("SECRET_KEY", "dev-secret-change-me")
FERNET_KEY = E.get("FERNET_KEY", "")
ADMIN_EMAIL = E.get("ADMIN_EMAIL", "").strip().lower()
# Pre-created admin login (username + password), seeded at every start. Password comes ONLY from the environment.
# Built-in default admin (owner request: host cannot set env vars). Env vars ADMIN_USERNAME / ADMIN_PASSWORD override these.
ADMIN_USERNAME = E.get("ADMIN_USERNAME", "Logen_SS").strip().lower()
ADMIN_PASSWORD = E.get("ADMIN_PASSWORD", "Logen_789789")

# Defaults only. The live values are edited by the admin in "Domain & System settings".
DEFAULTS = {
    "site_url": E.get("PUBLIC_BASE_URL", "").rstrip("/"),
    "api_base_url": E.get("API_BASE_URL", "").rstrip("/"),
    "checkout_base_url": E.get("CHECKOUT_BASE_URL", "").rstrip("/"),
    "webhook_base_url": E.get("WEBHOOK_BASE_URL", "").rstrip("/"),
    "allowed_origins": E.get("ALLOWED_ORIGINS", ""),
    "provider_base_url": E.get("PROVIDER_BASE_URL", "https://khqrpay.site").rstrip("/"),
    "provider_check_url": E.get("PROVIDER_CHECK_URL") or (E.get("PROVIDER_BASE_URL", "https://khqrpay.site").rstrip("/") + "/api/v1/payment?id={ref}"),
    "provider_check_method": E.get("PROVIDER_CHECK_METHOD", "GET"),
    "rate_limit_per_min": E.get("RATE_LIMIT_PER_MIN", "60"),
    "maintenance_mode": "0",
    "test_amount": E.get("TEST_AMOUNT", "0.01"),
    "qr_ttl_minutes": "10",
}

OAUTH = {
    "google": (E.get("GOOGLE_CLIENT_ID", ""), E.get("GOOGLE_CLIENT_SECRET", "")),
    "github": (E.get("GITHUB_CLIENT_ID", ""), E.get("GITHUB_CLIENT_SECRET", "")),
}
TELEGRAM_BOT_TOKEN = E.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_BOT_USERNAME = E.get("TELEGRAM_BOT_USERNAME", "").lstrip("@")
SMTP = dict(host=E.get("SMTP_HOST", ""), port=int(E.get("SMTP_PORT", "587")), user=E.get("SMTP_USER", ""),
            password=E.get("SMTP_PASSWORD", ""), sender=E.get("SMTP_FROM", ""))

_cache = {"t": 0.0, "v": {}}

def invalidate():
    _cache["t"] = 0.0

def all_settings(session=None):
    """DB value wins over env default. Cached 15s."""
    if time.time() - _cache["t"] < 15 and _cache["v"]:
        return _cache["v"]
    vals = dict(DEFAULTS)
    try:
        from .db import SessionLocal
        from .models import DomainSetting
        from sqlalchemy import select
        with SessionLocal() as s:
            for r in s.scalars(select(DomainSetting)):
                if r.value is not None:   # an explicit (even empty) admin value overrides the env default
                    vals[r.key] = r.value
    except Exception:
        pass
    _cache.update(t=time.time(), v=vals)
    return vals

def get(key):
    return all_settings().get(key, DEFAULTS.get(key, ""))

def base_url(request=None, kind="site"):
    """kind: site | api | checkout | webhook. Falls back to the request's own origin."""
    v = get({"site": "site_url", "api": "api_base_url", "checkout": "checkout_base_url", "webhook": "webhook_base_url"}[kind])
    if not v:
        v = get("site_url")
    if not v and request is not None:
        v = str(request.base_url).rstrip("/")
    return v.rstrip("/")

def is_https():
    return get("site_url").startswith("https://") or E.get("FORCE_SECURE_COOKIES") == "1"
