import datetime as dt
from typing import Literal
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session
from .. import config, providers
from ..db import get_db
from ..deps import ApiError, session_user, audit
from ..models import (User, ApiKey, AbaMerchant, BakongAccount, ProviderCredential, Payment, Webhook,
                      WebhookDelivery, ApiUsageLog, now)
from ..security import new_api_key, hash_key, encrypt, decrypt
from ..services import payments as pay, webhooks as wh

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
PERMS = ("payments:create", "payments:read")

def _series(s: Session, model, ts_col, extra, days=14):
    since = now() - dt.timedelta(days=days)
    rows = s.execute(select(func.date(ts_col), func.count()).where(ts_col >= since, *extra).group_by(func.date(ts_col))).all()
    m = {str(r[0]): r[1] for r in rows}
    out = []
    for i in range(days - 1, -1, -1):
        d = (now() - dt.timedelta(days=i)).date().isoformat()
        out.append({"date": d, "count": m.get(d, 0)})
    return out

# ---------------- overview ----------------
@router.get("/overview")
def overview(u: User = Depends(session_user), s: Session = Depends(get_db)):
    st = pay.stats(s, u.id)
    st["api_requests"] = s.scalar(select(func.coalesce(func.sum(ApiKey.request_count), 0)).where(ApiKey.user_id == u.id)) or 0
    st["active_keys"] = s.scalar(select(func.count(ApiKey.id)).where(ApiKey.user_id == u.id, ApiKey.revoked == False)) or 0  # noqa: E712
    st["payments_series"] = _series(s, Payment, Payment.created_at, [Payment.user_id == u.id])
    st["requests_series"] = _series(s, ApiUsageLog, ApiUsageLog.created_at, [ApiUsageLog.user_id == u.id])
    st["has_aba"] = bool(s.scalar(select(func.count(AbaMerchant.id)).where(AbaMerchant.user_id == u.id)))
    st["has_bakong"] = bool(s.scalar(select(func.count(BakongAccount.id)).where(BakongAccount.user_id == u.id)))
    st["provider_check_configured"] = bool(config.get("provider_check_url"))
    return st

# ---------------- API keys ----------------
class KeyIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    permissions: list[Literal["payments:create", "payments:read"]] = list(PERMS)

def _key_json(k: ApiKey):
    return {"id": k.id, "name": k.name, "prefix": k.prefix, "permissions": k.permissions.split(","), "revoked": k.revoked,
            "last_used_at": k.last_used_at, "request_count": k.request_count, "created_at": k.created_at}

def _mk_key(s, uid, name, perms):
    secret = new_api_key()
    k = ApiKey(user_id=uid, name=name, prefix=secret[:12], key_hash=hash_key(secret), permissions=",".join(perms) or ",".join(PERMS))
    s.add(k); s.commit()
    return k, secret

def _own_key(s, u, kid):
    k = s.get(ApiKey, kid)
    if not k or k.user_id != u.id:
        raise ApiError(404, "not_found")
    return k

@router.get("/keys")
def list_keys(u: User = Depends(session_user), s: Session = Depends(get_db)):
    return [_key_json(k) for k in s.scalars(select(ApiKey).where(ApiKey.user_id == u.id).order_by(ApiKey.id.desc()))]

@router.post("/keys")
def create_key(b: KeyIn, req: Request, u: User = Depends(session_user), s: Session = Depends(get_db)):
    if (s.scalar(select(func.count(ApiKey.id)).where(ApiKey.user_id == u.id, ApiKey.revoked == False)) or 0) >= 20:  # noqa: E712
        raise ApiError(400, "key_limit", "Maximum 20 active keys.")
    k, secret = _mk_key(s, u.id, b.name.strip(), b.permissions)
    audit(s, req, u.id, "key_create", k.prefix)
    return {**_key_json(k), "secret": secret, "notice": "Copy this key now. It is shown only once."}

@router.post("/keys/{kid}/regenerate")
def regen_key(kid: int, req: Request, u: User = Depends(session_user), s: Session = Depends(get_db)):
    old = _own_key(s, u, kid)
    old.revoked = True; s.commit()
    k, secret = _mk_key(s, u.id, old.name, old.permissions.split(","))
    audit(s, req, u.id, "key_regenerate", k.prefix)
    return {**_key_json(k), "secret": secret, "notice": "Old key revoked. Copy the new key now."}

@router.post("/keys/{kid}/revoke")
def revoke_key(kid: int, req: Request, u: User = Depends(session_user), s: Session = Depends(get_db)):
    k = _own_key(s, u, kid); k.revoked = True; s.commit(); audit(s, req, u.id, "key_revoke", k.prefix)
    return {"ok": True}

@router.delete("/keys/{kid}")
def delete_key(kid: int, req: Request, u: User = Depends(session_user), s: Session = Depends(get_db)):
    k = _own_key(s, u, kid); p = k.prefix; s.delete(k); s.commit(); audit(s, req, u.id, "key_delete", p)
    return {"ok": True}

# ---------------- merchants (ABA + Bakong) ----------------
class AbaIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    aba_link: str | None = Field(default=None, max_length=500)
    provider_key: str | None = Field(default=None, min_length=8, max_length=500)
    enabled: bool | None = None

class BakongIn(BaseModel):
    bakong_id: str = Field(min_length=1, max_length=120)
    account_name: str = Field(min_length=1, max_length=120)
    provider_key: str | None = Field(default=None, min_length=8, max_length=500)
    enabled: bool | None = None

def _cred(s, uid, label, key):
    c = ProviderCredential(user_id=uid, label=label[:80], key_enc=encrypt(key), key_hint=key[-4:])
    s.add(c); s.commit(); return c

def _m_json(m, kind):
    base = {"id": m.id, "enabled": m.enabled, "connection_status": m.connection_status,
            "last_tested_at": m.last_tested_at, "last_test_error": m.last_test_error, "created_at": m.created_at}
    c = None
    if kind == "aba":
        return {**base, "name": m.name, "aba_link": m.aba_link}
    return {**base, "bakong_id": m.bakong_id, "account_name": m.account_name}

def _own(s, u, M, mid):
    m = s.get(M, mid)
    if not m or m.user_id != u.id:
        raise ApiError(404, "not_found")
    return m

def _hint(s, m):
    c = s.get(ProviderCredential, m.credential_id)
    return c.key_hint if c else ""

def _list(s, u, M, kind):
    out = []
    for m in s.scalars(select(M).where(M.user_id == u.id).order_by(M.id)):
        out.append({**_m_json(m, kind), "key_hint": "…" + _hint(s, m)})
    return out

@router.get("/aba")
def aba_list(u: User = Depends(session_user), s: Session = Depends(get_db)):
    return _list(s, u, AbaMerchant, "aba")

@router.post("/aba")
def aba_add(b: AbaIn, req: Request, u: User = Depends(session_user), s: Session = Depends(get_db)):
    if not b.provider_key:
        raise ApiError(400, "provider_key_required", "Paste the provider API key that holds your ABA payment link.")
    c = _cred(s, u.id, f"ABA: {b.name}", b.provider_key.strip())
    m = AbaMerchant(user_id=u.id, credential_id=c.id, name=b.name.strip(), aba_link=b.aba_link)
    s.add(m); s.commit(); audit(s, req, u.id, "aba_add", str(m.id))
    return _m_json(m, "aba")

@router.patch("/aba/{mid}")
def aba_edit(mid: int, b: AbaIn, req: Request, u: User = Depends(session_user), s: Session = Depends(get_db)):
    m = _own(s, u, AbaMerchant, mid)
    m.name, m.aba_link = b.name.strip(), b.aba_link
    if b.enabled is not None:
        m.enabled = b.enabled
    if b.provider_key:
        c = s.get(ProviderCredential, m.credential_id); c.key_enc, c.key_hint = encrypt(b.provider_key.strip()), b.provider_key.strip()[-4:]
        m.connection_status = "untested"
    s.commit(); audit(s, req, u.id, "aba_edit", str(mid))
    return _m_json(m, "aba")

@router.get("/bakong")
def bakong_list(u: User = Depends(session_user), s: Session = Depends(get_db)):
    return _list(s, u, BakongAccount, "bakong")

@router.post("/bakong")
def bakong_add(b: BakongIn, req: Request, u: User = Depends(session_user), s: Session = Depends(get_db)):
    if not b.provider_key:
        raise ApiError(400, "provider_key_required", "Paste the provider API key that is bound to your Bakong account.")
    c = _cred(s, u.id, f"Bakong: {b.account_name}", b.provider_key.strip())
    m = BakongAccount(user_id=u.id, credential_id=c.id, bakong_id=b.bakong_id.strip(), account_name=b.account_name.strip())
    s.add(m); s.commit(); audit(s, req, u.id, "bakong_add", str(m.id))
    return _m_json(m, "bakong")

@router.patch("/bakong/{mid}")
def bakong_edit(mid: int, b: BakongIn, req: Request, u: User = Depends(session_user), s: Session = Depends(get_db)):
    m = _own(s, u, BakongAccount, mid)
    m.bakong_id, m.account_name = b.bakong_id.strip(), b.account_name.strip()
    if b.enabled is not None:
        m.enabled = b.enabled
    if b.provider_key:
        c = s.get(ProviderCredential, m.credential_id); c.key_enc, c.key_hint = encrypt(b.provider_key.strip()), b.provider_key.strip()[-4:]
        m.connection_status = "untested"
    s.commit(); audit(s, req, u.id, "bakong_edit", str(mid))
    return _m_json(m, "bakong")

def _delete_merchant(s, req, u, M, mid, tag):
    m = _own(s, u, M, mid); cid = m.credential_id
    s.delete(m); s.commit()
    s.execute(delete(ProviderCredential).where(ProviderCredential.id == cid)); s.commit()
    audit(s, req, u.id, tag, str(mid)); return {"ok": True}

@router.delete("/aba/{mid}")
def aba_del(mid: int, req: Request, u: User = Depends(session_user), s: Session = Depends(get_db)):
    return _delete_merchant(s, req, u, AbaMerchant, mid, "aba_delete")

@router.delete("/bakong/{mid}")
def bakong_del(mid: int, req: Request, u: User = Depends(session_user), s: Session = Depends(get_db)):
    return _delete_merchant(s, req, u, BakongAccount, mid, "bakong_delete")

def _test(s, m, kind):
    """Real provider call: creates ONE small test QR (admin-configurable amount). It is not saved as a payment."""
    c = s.get(ProviderCredential, m.credential_id)
    m.last_tested_at = now()
    try:
        providers.create_qr(kind, float(config.get("test_amount") or 0.01), decrypt(c.key_enc))
        m.connection_status, m.last_test_error = "ok", None
    except providers.ProviderError as e:
        m.connection_status, m.last_test_error = "failed", str(e)[:190]
    s.commit()
    return _m_json(m, kind)

@router.post("/aba/{mid}/test")
def aba_test(mid: int, u: User = Depends(session_user), s: Session = Depends(get_db)):
    return _test(s, _own(s, u, AbaMerchant, mid), "aba")

@router.post("/bakong/{mid}/test")
def bakong_test(mid: int, u: User = Depends(session_user), s: Session = Depends(get_db)):
    return _test(s, _own(s, u, BakongAccount, mid), "bakong")

# ---------------- payments ----------------
class CreatePay(BaseModel):
    kind: Literal["aba", "bakong"]
    amount: float = Field(gt=0, le=100000)
    merchant_id: int | None = None
    reference: str | None = Field(default=None, max_length=120)

@router.post("/payments")
def create_payment(b: CreatePay, req: Request, u: User = Depends(session_user), s: Session = Depends(get_db)):
    p = pay.create_payment(s, u.id, b.kind, round(b.amount, 2), b.merchant_id, b.reference)
    return pay.public_view(p, config.base_url(req, "checkout"))

@router.get("/payments")
def list_payments(req: Request, status: str | None = None, page: int = 1, u: User = Depends(session_user), s: Session = Depends(get_db)):
    q = select(Payment).where(Payment.user_id == u.id)
    if status in ("pending", "paid", "expired"):
        q = q.where(Payment.status == status)
    total = s.scalar(select(func.count()).select_from(q.subquery()))
    rows = s.scalars(q.order_by(Payment.id.desc()).limit(25).offset(max(page - 1, 0) * 25)).all()
    base = config.base_url(req, "checkout")
    return {"total": total, "items": [pay.public_view(p, base) for p in rows]}

@router.post("/payments/{order_id}/refresh")
def refresh_payment(order_id: str, req: Request, u: User = Depends(session_user), s: Session = Depends(get_db)):
    p = s.scalar(select(Payment).where(Payment.order_id == order_id, Payment.user_id == u.id))
    if not p:
        raise ApiError(404, "not_found")
    v = pay.refresh(s, p, min_interval=1)
    return {**pay.public_view(p, config.base_url(req, "checkout")), "verification": v}

# ---------------- webhooks ----------------
class HookIn(BaseModel):
    url: str = Field(max_length=500)
    events: list[Literal["payment.pending", "payment.paid", "payment.expired"]] = list(wh.EVENTS)
    enabled: bool = True

def _w_json(w):
    return {"id": w.id, "url": w.url, "events": w.events.split(","), "enabled": w.enabled, "created_at": w.created_at}

def _own_hook(s, u, wid):
    w = s.get(Webhook, wid)
    if not w or w.user_id != u.id:
        raise ApiError(404, "not_found")
    return w

def _new_secret():
    import secrets
    return "whsec_" + secrets.token_urlsafe(32)

@router.get("/webhooks")
def hooks(u: User = Depends(session_user), s: Session = Depends(get_db)):
    return [_w_json(w) for w in s.scalars(select(Webhook).where(Webhook.user_id == u.id).order_by(Webhook.id))]

@router.post("/webhooks")
def hook_add(b: HookIn, req: Request, u: User = Depends(session_user), s: Session = Depends(get_db)):
    err = wh.validate_url(b.url)
    if err:
        raise ApiError(400, "invalid_url", err)
    sec = _new_secret()
    w = Webhook(user_id=u.id, url=b.url, secret_enc=encrypt(sec), events=",".join(b.events), enabled=b.enabled)
    s.add(w); s.commit(); audit(s, req, u.id, "webhook_add", str(w.id))
    return {**_w_json(w), "secret": sec, "notice": "Copy the signing secret now. It is shown only once."}

@router.patch("/webhooks/{wid}")
def hook_edit(wid: int, b: HookIn, u: User = Depends(session_user), s: Session = Depends(get_db)):
    w = _own_hook(s, u, wid)
    if b.url != w.url:
        err = wh.validate_url(b.url)
        if err:
            raise ApiError(400, "invalid_url", err)
    w.url, w.events, w.enabled = b.url, ",".join(b.events), b.enabled
    s.commit(); return _w_json(w)

@router.delete("/webhooks/{wid}")
def hook_del(wid: int, u: User = Depends(session_user), s: Session = Depends(get_db)):
    w = _own_hook(s, u, wid); s.delete(w); s.commit(); return {"ok": True}

@router.post("/webhooks/{wid}/rotate-secret")
def hook_rotate(wid: int, u: User = Depends(session_user), s: Session = Depends(get_db)):
    w = _own_hook(s, u, wid); sec = _new_secret(); w.secret_enc = encrypt(sec); s.commit()
    return {"secret": sec, "notice": "Copy the new signing secret now."}

@router.post("/webhooks/{wid}/test")
def hook_test(wid: int, u: User = Depends(session_user), s: Session = Depends(get_db)):
    """Sends a clearly-labelled test event (payment.test). Not a provider-verified payment."""
    import json
    w = _own_hook(s, u, wid)
    body = json.dumps({"id": "evt_test", "event": "payment.test", "created_at": now().isoformat(),
                       "data": {"order_id": "ord_test", "status": "test", "amount": 1.0, "currency": "USD"}}, separators=(",", ":"))
    d = WebhookDelivery(webhook_id=w.id, user_id=u.id, event="payment.test", payload=body)
    s.add(d); s.commit()
    wh.deliver(s, d)
    return {"ok": d.ok, "status_code": d.status_code, "error": d.error}

@router.get("/webhooks/deliveries")
def deliveries(webhook_id: int | None = None, u: User = Depends(session_user), s: Session = Depends(get_db)):
    q = select(WebhookDelivery).where(WebhookDelivery.user_id == u.id)
    if webhook_id:
        q = q.where(WebhookDelivery.webhook_id == webhook_id)
    return [{"id": d.id, "webhook_id": d.webhook_id, "event": d.event, "ok": d.ok, "status_code": d.status_code,
             "error": d.error, "attempts": d.attempts, "next_retry_at": d.next_retry_at, "created_at": d.created_at}
            for d in s.scalars(q.order_by(WebhookDelivery.id.desc()).limit(100))]

@router.post("/webhooks/deliveries/{did}/retry")
def delivery_retry(did: int, u: User = Depends(session_user), s: Session = Depends(get_db)):
    d = s.get(WebhookDelivery, did)
    if not d or d.user_id != u.id:
        raise ApiError(404, "not_found")
    wh.deliver(s, d)
    return {"ok": d.ok, "status_code": d.status_code, "error": d.error}

# ---------------- usage ----------------
@router.get("/usage")
def usage(u: User = Depends(session_user), s: Session = Depends(get_db)):
    keys = s.scalars(select(ApiKey).where(ApiKey.user_id == u.id)).all()
    logs = s.scalars(select(ApiUsageLog).where(ApiUsageLog.user_id == u.id).order_by(ApiUsageLog.id.desc()).limit(50)).all()
    return {"total": sum(k.request_count or 0 for k in keys),
            "series": _series(s, ApiUsageLog, ApiUsageLog.created_at, [ApiUsageLog.user_id == u.id], 14),
            "keys": [{"id": k.id, "name": k.name, "prefix": k.prefix, "request_count": k.request_count, "last_used_at": k.last_used_at, "revoked": k.revoked} for k in keys],
            "recent": [{"method": l.method, "path": l.path, "status_code": l.status_code, "latency_ms": l.latency_ms,
                        "ip": l.ip, "created_at": l.created_at} for l in logs]}
