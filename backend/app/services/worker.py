"""Background loop: verifies pending payments with the provider and delivers/retries webhooks.
Runs inside the web process (single worker). Safe if several run: status changes are atomic."""
import asyncio, logging
from sqlalchemy import select
from ..db import SessionLocal
from ..models import Payment
from . import payments, webhooks

log = logging.getLogger("khpay.worker")

def _tick():
    with SessionLocal() as s:
        for p in s.scalars(select(Payment).where(Payment.status == "pending").order_by(Payment.id).limit(50)).all():
            try:
                payments.refresh(s, p, min_interval=5)
            except Exception:
                s.rollback(); log.exception("refresh failed for %s", p.order_id)
        try:
            webhooks.deliver_due(s)
        except Exception:
            s.rollback(); log.exception("webhook delivery failed")

async def loop(interval=6):
    while True:
        try:
            await asyncio.to_thread(_tick)
        except Exception:
            log.exception("worker tick")
        await asyncio.sleep(interval)
