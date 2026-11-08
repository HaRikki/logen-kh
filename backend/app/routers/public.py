from typing import Literal
from fastapi import APIRouter, Depends, Request, Header
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .. import config
from ..db import get_db
from ..deps import ApiError, api_auth, ApiAuth, limit_ip
from ..models import Payment
from ..services import payments as pay

router = APIRouter(tags=["public"])

@router.get("/health")
def health(s: Session = Depends(get_db)):
    s.execute(select(1))
    return {"status": "ok"}

@router.get("/api/public/config")
def public_config(req: Request):
    """Everything the SPA/docs need to build URLs. Nothing secret."""
    return {"site_url": config.base_url(req, "site"), "api_base_url": config.base_url(req, "api"),
            "checkout_base_url": config.base_url(req, "checkout"), "maintenance": config.get("maintenance_mode") == "1",
            "qr_ttl_minutes": int(config.get("qr_ttl_minutes") or 10), "rate_limit_per_min": int(config.get("rate_limit_per_min") or 60)}

class CreateIn(BaseModel):
    amount: float = Field(gt=0, le=100000)
    merchant_id: int | None = None
    reference: str | None = Field(default=None, max_length=120)

def _create(kind, b: CreateIn, req, a: ApiAuth, s, idem):
    p = pay.create_payment(s, a.user.id, kind, round(b.amount, 2), b.merchant_id, b.reference, (idem or None))
    return {"success": True, "data": pay.public_view(p, config.base_url(req, "checkout"))}

@router.post("/api/v1/aba/create")
def aba_create(b: CreateIn, req: Request, a: ApiAuth = Depends(api_auth("payments:create")), s: Session = Depends(get_db),
               idempotency_key: str | None = Header(default=None, max_length=120)):
    return _create("aba", b, req, a, s, idempotency_key)

@router.post("/api/v1/bakong/create")
def bakong_create(b: CreateIn, req: Request, a: ApiAuth = Depends(api_auth("payments:create")), s: Session = Depends(get_db),
                  idempotency_key: str | None = Header(default=None, max_length=120)):
    return _create("bakong", b, req, a, s, idempotency_key)

@router.get("/api/v1/payment")
def get_payment(req: Request, id: str, a: ApiAuth = Depends(api_auth("payments:read")), s: Session = Depends(get_db)):
    p = s.scalar(select(Payment).where(Payment.order_id == id, Payment.user_id == a.user.id))  # ownership enforced in query
    if not p:
        raise ApiError(404, "payment_not_found", "No payment with that id on this account.")
    v = pay.refresh(s, p)
    data = pay.public_view(p, config.base_url(req, "checkout"))
    return {"success": True, "data": data, "verification": {"verified": v["verified"], "reason": v["reason"]}}

@router.get("/api/v1/payments")
def list_payments(req: Request, status: Literal["pending", "paid", "expired"] | None = None, limit: int = 50, offset: int = 0,
                  a: ApiAuth = Depends(api_auth("payments:read")), s: Session = Depends(get_db)):
    limit = max(1, min(limit, 100))
    q = select(Payment).where(Payment.user_id == a.user.id)
    if status:
        q = q.where(Payment.status == status)
    total = s.scalar(select(func.count()).select_from(q.subquery()))
    rows = s.scalars(q.order_by(Payment.id.desc()).limit(limit).offset(max(offset, 0))).all()
    base = config.base_url(req, "checkout")
    return {"success": True, "total": total, "data": [pay.public_view(p, base) for p in rows]}

# ---- hosted checkout (public by design: order ids are unguessable; nothing secret is returned) ----
@router.get("/api/public/pay/{order_id}")
def checkout_status(order_id: str, req: Request, s: Session = Depends(get_db)):
    limit_ip(req, "checkout", 120, 60)
    p = s.scalar(select(Payment).where(Payment.order_id == order_id))
    if not p:
        raise ApiError(404, "payment_not_found")
    v = pay.refresh(s, p)  # real provider check (throttled to once per 3s per payment)
    d = pay.public_view(p, config.base_url(req, "checkout"))
    for k in ("reference", "transaction_id") :
        d.pop(k, None)
    d["verification"] = v["verified"]
    d["verification_reason"] = v["reason"] if not v["verified"] else None
    return d
