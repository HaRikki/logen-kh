"""Adapter for the external payment provider (initially https://khqrpay.site).

Only the CREATE contract is documented (POST /api/v1/{aba|bakong}/create, body {"amount": n},
Bearer provider key). The provider's status endpoint is NOT assumed: the admin sets
`provider_check_url` (placeholders {ref} {order_id} {transaction_id}). Until then payments are never
marked paid. Response field names are normalised from several likely spellings, and the raw
response is stored so you can adjust the mapping below.
"""
import json
import httpx
from . import config

class ProviderError(Exception):
    def __init__(self, message, status=None):
        super().__init__(message); self.status = status

class ProviderNotConfigured(ProviderError):
    pass

def _data(raw):
    if isinstance(raw, dict):
        d = raw.get("data")
        return d if isinstance(d, dict) else raw
    return {}

def _pick(d: dict, *names):
    for n in names:
        v = d.get(n)
        if v not in (None, ""):
            return v
    return None

def create_qr(kind: str, amount: float, provider_key: str) -> dict:
    base = config.get("provider_base_url")
    if not base:
        raise ProviderNotConfigured("provider_base_url is not set")
    try:
        r = httpx.post(f"{base}/api/v1/{kind}/create", json={"amount": amount},
                       headers={"Authorization": f"Bearer {provider_key}", "Content-Type": "application/json"}, timeout=25)
    except httpx.HTTPError as e:
        raise ProviderError(f"provider unreachable: {type(e).__name__}")
    if r.status_code in (401, 403):
        raise ProviderError("provider rejected the provider API key", r.status_code)
    if not r.is_success:
        raise ProviderError(f"provider returned HTTP {r.status_code}", r.status_code)
    try:
        raw = r.json()
    except ValueError:
        raise ProviderError("provider returned non-JSON")
    d = _data(raw)
    ref = _pick(d, "order_id", "orderId", "id", "transaction_id", "tran_id", "md5", "hash", "reference")
    out = {
        "ref": str(ref) if ref is not None else None,
        "transaction_id": str(_pick(d, "transaction_id", "tran_id", "transactionId") or ref or "") or None,
        "qr_string": _pick(d, "qr", "qr_string", "qrString", "khqr", "qr_code", "qrCode"),
        "qr_image": _pick(d, "qr_image", "qrImage", "qr_url", "qrUrl", "image"),
        "deeplink": _pick(d, "deeplink", "deep_link", "abapay_deeplink", "aba_deeplink", "link"),
        "currency": str(_pick(d, "currency") or "USD").upper()[:8],
        "raw": raw,
    }
    if not (out["qr_string"] or out["qr_image"]):
        raise ProviderError("provider response had no QR data (check field mapping in providers.py)")
    return out

PAID = {"paid", "success", "successful", "completed", "complete", "approved", "settled"}

def check_status(p, provider_key: str) -> str:
    """Returns 'paid' or 'pending' as reported by the provider. Raises if it cannot be verified."""
    tpl = config.get("provider_check_url")
    if not tpl:
        raise ProviderNotConfigured("provider_check_url not configured")
    url = tpl.replace("{ref}", p.provider_ref or "").replace("{order_id}", p.provider_ref or "") \
             .replace("{transaction_id}", p.transaction_id or "")
    method = (config.get("provider_check_method") or "GET").upper()
    try:
        if method == "POST":
            r = httpx.post(url, json={"ref": p.provider_ref, "order_id": p.provider_ref}, timeout=20,
                           headers={"Authorization": f"Bearer {provider_key}"})
        else:
            r = httpx.get(url, timeout=20, headers={"Authorization": f"Bearer {provider_key}"})
    except httpx.HTTPError as e:
        raise ProviderError(f"provider unreachable: {type(e).__name__}")
    if not r.is_success:
        raise ProviderError(f"provider status check returned HTTP {r.status_code}", r.status_code)
    try:
        d = _data(r.json())
    except ValueError:
        raise ProviderError("provider status response was not JSON")
    st = str(_pick(d, "status", "state", "payment_status") or "").lower()
    if d.get("paid") is True or st in PAID:
        return "paid"
    return "pending"
