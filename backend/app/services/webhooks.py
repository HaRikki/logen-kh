import datetime as dt, hmac, hashlib, ipaddress, json, socket, time, uuid
from urllib.parse import urlparse
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session
from .. import config
from ..models import Webhook, WebhookDelivery, Payment, now
from ..security import decrypt

EVENTS = ("payment.pending", "payment.paid", "payment.expired")
BACKOFF = [30, 120, 600, 3600]  # seconds; 5 attempts in total

def validate_url(url: str):
    """HTTPS only and no private/loopback targets (SSRF guard). Returns error string or None."""
    u = urlparse(url)
    if u.scheme != "https" or not u.hostname:
        return "Webhook URL must be https://"
    try:
        for info in socket.getaddrinfo(u.hostname, u.port or 443, proto=socket.IPPROTO_TCP):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return "Webhook URL resolves to a private address"
    except socket.gaierror:
        return "Webhook host cannot be resolved"
    return None

def sign(secret: str, ts: str, body: str) -> str:
    return hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()

def payment_data(p: Payment) -> dict:
    return {"order_id": p.order_id, "kind": p.kind, "status": p.status, "amount": float(p.amount),
            "currency": p.currency, "transaction_id": p.transaction_id, "reference": p.reference,
            "merchant_name": p.merchant_name,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "paid_at": p.paid_at.isoformat() if p.paid_at else None}

def enqueue(s: Session, p: Payment, event: str):
    """Queue an event. Call ONLY after the status change was confirmed with the provider."""
    for w in s.scalars(select(Webhook).where(Webhook.user_id == p.user_id, Webhook.enabled)):
        if event not in w.events.split(","):
            continue
        body = json.dumps({"id": "evt_" + uuid.uuid4().hex[:20], "event": event,
                           "created_at": now().isoformat(), "data": payment_data(p)}, separators=(",", ":"))
        s.add(WebhookDelivery(webhook_id=w.id, user_id=p.user_id, payment_id=p.id, event=event,
                              payload=body, next_retry_at=now()))
    s.commit()

def deliver(s: Session, d: WebhookDelivery) -> bool:
    w = s.get(Webhook, d.webhook_id)
    if not w:
        return False
    d.attempts += 1
    ts = str(int(time.time()))
    try:
        err = validate_url(w.url)
        if err:
            raise ValueError(err)
        r = httpx.post(w.url, content=d.payload, timeout=10, follow_redirects=False, headers={
            "Content-Type": "application/json", "User-Agent": "LogenKHPay-Webhook/1.0",
            "X-KHPay-Event": d.event, "X-KHPay-Delivery": str(d.id), "X-KHPay-Timestamp": ts,
            "X-KHPay-Signature": sign(decrypt(w.secret_enc), ts, d.payload)})
        d.status_code, d.ok, d.error = r.status_code, r.is_success, None if r.is_success else f"HTTP {r.status_code}"
    except Exception as e:
        d.status_code, d.ok, d.error = None, False, str(e)[:190]
    if d.ok or d.attempts > len(BACKOFF):
        d.next_retry_at = None
    else:
        d.next_retry_at = now() + dt.timedelta(seconds=BACKOFF[d.attempts - 1])
    s.commit()
    return d.ok

def deliver_due(s: Session, limit=20):
    due = s.scalars(select(WebhookDelivery).where(WebhookDelivery.ok == False,  # noqa: E712
                    WebhookDelivery.next_retry_at != None, WebhookDelivery.next_retry_at <= now())  # noqa: E711
                    .order_by(WebhookDelivery.id).limit(limit)).all()
    for d in due:
        deliver(s, d)
