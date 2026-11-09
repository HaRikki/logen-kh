import datetime as dt, json, secrets
from sqlalchemy import select, update, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .. import config, providers
from ..deps import ApiError
from ..models import (Payment, AbaMerchant, BakongAccount, ProviderCredential, now)
from ..security import decrypt
from . import webhooks

def _merchant(s: Session, user_id: int, kind: str, merchant_id: int | None):
    M = AbaMerchant if kind == "aba" else BakongAccount
    q = select(M).where(M.user_id == user_id, M.enabled == True)  # noqa: E712
    if merchant_id:
        q = q.where(M.id == merchant_id)
    m = s.scalars(q.order_by(M.id)).first()
    if not m:
        raise ApiError(400, f"no_{kind}_merchant", f"No enabled {kind.upper()} merchant is configured for this account.")
    return m

def _expires(p: Payment):
    e = p.expires_at
    return e if e.tzinfo else e.replace(tzinfo=dt.timezone.utc)

def create_payment(s: Session, user_id: int, kind: str, amount: float, merchant_id=None,
                   reference=None, idem=None) -> Payment:
    if idem:
        old = s.scalar(select(Payment).where(Payment.user_id == user_id, Payment.idempotency_key == idem))
        if old:
            return old
    m = _merchant(s, user_id, kind, merchant_id)
    cred = s.get(ProviderCredential, m.credential_id)
    try:
        out = providers.create_qr(kind, amount, decrypt(cred.key_enc))
    except providers.ProviderError as e:
        raise ApiError(502, "provider_error", str(e))
    ttl = int(config.get("qr_ttl_minutes") or 10)
    p = Payment(order_id="ord_" + secrets.token_urlsafe(14), user_id=user_id, kind=kind, amount=amount,
                currency=out["currency"], provider_ref=out["ref"], transaction_id=out["transaction_id"],
                qr_string=out["qr_string"], qr_image=out["qr_image"], deeplink=out["deeplink"],
                reference=(reference or None), provider_raw=json.dumps(out["raw"])[:20000], idempotency_key=idem,
                merchant_name=getattr(m, "name", None) or m.account_name,
                aba_merchant_id=m.id if kind == "aba" else None,
                bakong_account_id=m.id if kind == "bakong" else None,
                expires_at=(out["expires_at"] if out.get("expires_at") and out["expires_at"] > now() else now() + dt.timedelta(minutes=ttl)))
    s.add(p)
    try:
        s.commit()
    except IntegrityError:  # concurrent request with the same idempotency key
        s.rollback()
        return s.scalar(select(Payment).where(Payment.user_id == user_id, Payment.idempotency_key == idem))
    webhooks.enqueue(s, p, "payment.pending")
    return p

def _transition(s: Session, p: Payment, new: str) -> bool:
    """Atomic pending -> paid/expired. Returns True only for the one caller that wins the race."""
    vals = {"status": new}
    if new == "paid":
        vals["paid_at"] = now()
    r = s.execute(update(Payment).where(Payment.id == p.id, Payment.status == "pending").values(**vals))
    s.commit()
    if r.rowcount != 1:
        s.refresh(p)
        return False
    s.refresh(p)
    webhooks.enqueue(s, p, f"payment.{new}")
    return True

def refresh(s: Session, p: Payment, min_interval=3) -> dict:
    """Ask the provider for the real status. Returns {'verified': bool, 'reason': str|None}."""
    if p.status != "pending":
        return {"verified": True, "reason": None}
    last = p.last_checked_at
    if last is not None:
        last = last if last.tzinfo else last.replace(tzinfo=dt.timezone.utc)
        if (now() - last).total_seconds() < min_interval:
            return {"verified": True, "reason": "recently_checked"}
    cred = None
    if p.kind == "aba" and p.aba_merchant_id:
        cred = s.get(ProviderCredential, s.get(AbaMerchant, p.aba_merchant_id).credential_id)
    elif p.kind == "bakong" and p.bakong_account_id:
        cred = s.get(ProviderCredential, s.get(BakongAccount, p.bakong_account_id).credential_id)
    if not cred:
        return {"verified": False, "reason": "merchant_removed"}
    try:
        st = providers.check_status(p, decrypt(cred.key_enc))
    except providers.ProviderNotConfigured:
        return {"verified": False, "reason": "provider_check_not_configured"}
    except providers.ProviderError as e:
        return {"verified": False, "reason": str(e)}
    p.last_checked_at = now(); s.commit()
    if st == "paid":
        _transition(s, p, "paid")
    elif st == "expired":
        _transition(s, p, "expired")   # the provider itself reports it as Expired
    elif now() > _expires(p):
        _transition(s, p, "expired")   # only after the provider confirmed it is still unpaid
    return {"verified": True, "reason": None}

def _android(p):
    try:
        return _data_of(p).get("aba_deeplink_android")
    except Exception:
        return None

def _data_of(p):
    raw = json.loads(p.provider_raw or "{}")
    return raw.get("data") if isinstance(raw.get("data"), dict) else raw

def public_view(p: Payment, base_checkout: str) -> dict:
    return {"order_id": p.order_id, "type": p.kind, "status": p.status, "amount": float(p.amount),
            "currency": p.currency, "transaction_id": p.transaction_id, "reference": p.reference,
            "merchant_name": p.merchant_name, "qr": p.qr_string, "qr_image": p.qr_image,
            "deeplink": p.deeplink, "deeplink_android": _android(p), "checkout_url": f"{base_checkout}/pay/{p.order_id}",
            "created_at": p.created_at, "expires_at": p.expires_at, "paid_at": p.paid_at}

def stats(s: Session, user_id: int | None = None) -> dict:
    def cnt(*conds):
        q = select(func.count(Payment.id)).where(*conds)
        if user_id is not None:
            q = q.where(Payment.user_id == user_id)
        return s.scalar(q) or 0
    q = select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.status == "paid")
    if user_id is not None:
        q = q.where(Payment.user_id == user_id)
    return {"total": cnt(), "paid": cnt(Payment.status == "paid"), "pending": cnt(Payment.status == "pending"),
            "expired": cnt(Payment.status == "expired"), "paid_amount": float(s.scalar(q) or 0)}
