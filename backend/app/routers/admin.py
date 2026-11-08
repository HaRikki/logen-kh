import datetime as dt
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session
from .. import config
from ..db import get_db
from ..deps import ApiError, admin_user, audit
from ..models import (User, Admin, ApiKey, AbaMerchant, BakongAccount, Payment, WebhookDelivery, ApiUsageLog,
                      AuditLog, DomainSetting, UserSocialAccount, now)
from ..services import payments as pay
from .dashboard import _series

router = APIRouter(prefix="/admin/api", tags=["admin"])
URL_KEYS = ("site_url", "api_base_url", "checkout_base_url", "webhook_base_url", "provider_base_url", "provider_check_url")
EDITABLE = URL_KEYS + ("allowed_origins", "provider_check_method", "rate_limit_per_min", "maintenance_mode", "test_amount", "qr_ttl_minutes")

def page(q, s, n, size=50):
    total = s.scalar(select(func.count()).select_from(q.subquery()))
    return total, q.limit(size).offset(max(n - 1, 0) * size)

@router.get("/overview")
def overview(a: User = Depends(admin_user), s: Session = Depends(get_db)):
    st = pay.stats(s)
    st["users"] = s.scalar(select(func.count(User.id))) or 0
    st["active_users"] = s.scalar(select(func.count(User.id)).where(User.status == "active")) or 0
    st["suspended_users"] = st["users"] - st["active_users"]
    st["api_requests_24h"] = s.scalar(select(func.count(ApiUsageLog.id)).where(ApiUsageLog.created_at >= now() - dt.timedelta(hours=24))) or 0
    st["payments_series"] = _series(s, Payment, Payment.created_at, [])
    st["requests_series"] = _series(s, ApiUsageLog, ApiUsageLog.created_at, [])
    return st

@router.get("/users")
def users(q: str = "", page_n: int = 1, a: User = Depends(admin_user), s: Session = Depends(get_db)):
    qq = select(User)
    if q:
        qq = qq.where(or_(User.email.ilike(f"%{q}%"), User.display_name.ilike(f"%{q}%")))
    total, qq = page(qq.order_by(User.id.desc()), s, page_n)
    admins = set(s.scalars(select(Admin.user_id)))
    out = []
    for u in s.scalars(qq):
        out.append({"id": u.id, "email": u.email, "display_name": u.display_name, "status": u.status, "is_admin": u.id in admins,
                    "created_at": u.created_at, "last_login_at": u.last_login_at,
                    "payments": s.scalar(select(func.count(Payment.id)).where(Payment.user_id == u.id)) or 0,
                    "socials": [x.provider for x in s.scalars(select(UserSocialAccount).where(UserSocialAccount.user_id == u.id))]})
    return {"total": total, "items": out}

class StatusIn(BaseModel):
    status: str

@router.patch("/users/{uid}/status")
def set_status(uid: int, b: StatusIn, req: Request, a: User = Depends(admin_user), s: Session = Depends(get_db)):
    if b.status not in ("active", "suspended"):
        raise ApiError(400, "invalid_status")
    u = s.get(User, uid)
    if not u:
        raise ApiError(404, "not_found")
    if u.id == a.id:
        raise ApiError(400, "cannot_suspend_self")
    u.status = b.status
    if b.status == "suspended":
        u.session_version += 1   # signs them out everywhere; API keys also stop working (checked per request)
    s.commit(); audit(s, req, a.id, f"user_{b.status}", str(uid))
    return {"ok": True}

@router.get("/keys")
def keys(page_n: int = 1, a: User = Depends(admin_user), s: Session = Depends(get_db)):
    total, q = page(select(ApiKey, User.email).join(User, User.id == ApiKey.user_id).order_by(ApiKey.id.desc()), s, page_n)
    # Only prefixes are ever shown: secrets are not stored in readable form.
    return {"total": total, "items": [{"id": k.id, "owner": e, "name": k.name, "prefix": k.prefix, "revoked": k.revoked,
            "permissions": k.permissions.split(","), "request_count": k.request_count, "last_used_at": k.last_used_at,
            "created_at": k.created_at} for k, e in s.execute(q).all()]}

@router.post("/keys/{kid}/revoke")
def revoke(kid: int, req: Request, a: User = Depends(admin_user), s: Session = Depends(get_db)):
    k = s.get(ApiKey, kid)
    if not k:
        raise ApiError(404, "not_found")
    k.revoked = True; s.commit(); audit(s, req, a.id, "admin_key_revoke", k.prefix)
    return {"ok": True}

@router.get("/merchants")
def merchants(a: User = Depends(admin_user), s: Session = Depends(get_db)):
    out = []
    for m, e in s.execute(select(AbaMerchant, User.email).join(User, User.id == AbaMerchant.user_id).order_by(AbaMerchant.id.desc()).limit(200)).all():
        out.append({"kind": "aba", "id": m.id, "owner": e, "name": m.name, "enabled": m.enabled, "connection_status": m.connection_status})
    for m, e in s.execute(select(BakongAccount, User.email).join(User, User.id == BakongAccount.user_id).order_by(BakongAccount.id.desc()).limit(200)).all():
        out.append({"kind": "bakong", "id": m.id, "owner": e, "name": f"{m.account_name} ({m.bakong_id})", "enabled": m.enabled, "connection_status": m.connection_status})
    return out

@router.post("/merchants/{kind}/{mid}/toggle")
def toggle(kind: str, mid: int, req: Request, a: User = Depends(admin_user), s: Session = Depends(get_db)):
    m = s.get(AbaMerchant if kind == "aba" else BakongAccount, mid)
    if kind not in ("aba", "bakong") or not m:
        raise ApiError(404, "not_found")
    m.enabled = not m.enabled; s.commit(); audit(s, req, a.id, "admin_merchant_toggle", f"{kind}:{mid}")
    return {"enabled": m.enabled}

@router.get("/payments")
def payments(status: str = "", q: str = "", page_n: int = 1, a: User = Depends(admin_user), s: Session = Depends(get_db)):
    qq = select(Payment, User.email).join(User, User.id == Payment.user_id)
    if status in ("pending", "paid", "expired"):
        qq = qq.where(Payment.status == status)
    if q:
        qq = qq.where(or_(Payment.order_id.ilike(f"%{q}%"), User.email.ilike(f"%{q}%")))
    total, qq = page(qq.order_by(Payment.id.desc()), s, page_n)
    return {"total": total, "items": [{"order_id": p.order_id, "owner": e, "kind": p.kind, "amount": float(p.amount), "currency": p.currency,
            "status": p.status, "merchant_name": p.merchant_name, "created_at": p.created_at, "paid_at": p.paid_at} for p, e in s.execute(qq).all()]}

@router.get("/logs/api")
def api_logs(page_n: int = 1, a: User = Depends(admin_user), s: Session = Depends(get_db)):
    total, q = page(select(ApiUsageLog, User.email).outerjoin(User, User.id == ApiUsageLog.user_id).order_by(ApiUsageLog.id.desc()), s, page_n)
    return {"total": total, "items": [{"id": l.id, "user": e, "method": l.method, "path": l.path, "status_code": l.status_code,
            "ip": l.ip, "latency_ms": l.latency_ms, "created_at": l.created_at} for l, e in s.execute(q).all()]}

@router.get("/logs/webhooks")
def wh_logs(page_n: int = 1, a: User = Depends(admin_user), s: Session = Depends(get_db)):
    total, q = page(select(WebhookDelivery, User.email).join(User, User.id == WebhookDelivery.user_id).order_by(WebhookDelivery.id.desc()), s, page_n)
    return {"total": total, "items": [{"id": d.id, "user": e, "event": d.event, "ok": d.ok, "status_code": d.status_code,
            "error": d.error, "attempts": d.attempts, "created_at": d.created_at} for d, e in s.execute(q).all()]}

@router.get("/logs/audit")
def audit_logs(page_n: int = 1, a: User = Depends(admin_user), s: Session = Depends(get_db)):
    total, q = page(select(AuditLog, User.email).outerjoin(User, User.id == AuditLog.user_id).order_by(AuditLog.id.desc()), s, page_n)
    return {"total": total, "items": [{"id": l.id, "user": e, "action": l.action, "target": l.target, "ip": l.ip, "created_at": l.created_at} for l, e in s.execute(q).all()]}

@router.get("/settings")
def get_settings(a: User = Depends(admin_user)):
    cur = config.all_settings()
    return {"values": {k: cur.get(k, "") for k in EDITABLE},
            "system": {"fernet_configured": bool(config.FERNET_KEY), "google_configured": bool(config.OAUTH["google"][0]),
                       "github_configured": bool(config.OAUTH["github"][0]),
                       "telegram_configured": bool(config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_BOT_USERNAME),
                       "smtp_configured": bool(config.SMTP["host"] and config.SMTP["sender"]),
                       "https": config.is_https(), "provider_check_configured": bool(cur.get("provider_check_url"))}}

@router.put("/settings")
def put_settings(b: dict, req: Request, a: User = Depends(admin_user), s: Session = Depends(get_db)):
    for k, v in b.items():
        if k not in EDITABLE:
            raise ApiError(400, "unknown_setting", k)
        v = "" if v is None else str(v).strip()
        if k in URL_KEYS and v:
            u = urlparse(v.replace("{ref}", "x").replace("{order_id}", "x").replace("{transaction_id}", "x"))
            if u.scheme not in ("http", "https") or not u.netloc:
                raise ApiError(400, "invalid_url", f"{k} must start with http:// or https://")
        if k in ("rate_limit_per_min", "qr_ttl_minutes") and (not v.isdigit() or int(v) < 1):
            raise ApiError(400, "invalid_number", k)
        if k == "maintenance_mode":
            v = "1" if v in ("1", "true", "True") else "0"
        if k == "provider_check_method" and v.upper() not in ("GET", "POST", ""):
            raise ApiError(400, "invalid_method", k)
        row = s.get(DomainSetting, k)
        if row:
            row.value = v
        else:
            s.add(DomainSetting(key=k, value=v))
    s.commit(); config.invalidate(); audit(s, req, a.id, "settings_update", ",".join(b.keys()))
    return get_settings(a)
