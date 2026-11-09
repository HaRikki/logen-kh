"""Adapter for khqrpay.site (documented API).

Create:  POST {base}/api/v1/{aba|bakong}/create   Bearer sk_...   body {"amount": n}
  -> top-level fields: ok, id, qr, qr_image (SVG data URL), checkout_url, status, expires_at, md5,
     merchant_name, aba_deeplink, aba_deeplink_android
Status:  GET  {base}/api/v1/payment?id={id}       Bearer sk_...   (status: Pending | Paid | Expired)
Errors:  {"ok": false, "error": "...", "error_text": "..."}; HTTP 429 = rate_limited (80 req/s, create 25 req/s per IP).
The status response shape was not part of the supplied docs, so both a top-level and a nested
("payment" / "data") layout are accepted.
"""
import datetime as dt
import httpx
from . import config

class ProviderError(Exception):
    def __init__(self, message, status=None, code=None):
        super().__init__(message); self.status, self.code = status, code

class ProviderNotConfigured(ProviderError):
    pass

def _data(raw):
    if not isinstance(raw, dict):
        return {}
    for k in ("payment", "data"):
        if isinstance(raw.get(k), dict):
            return raw[k]
    return raw

def _pick(d: dict, *names):
    for n in names:
        v = d.get(n)
        if v not in (None, ""):
            return v
    return None

def _err(r: httpx.Response, raw) -> ProviderError:
    msg = None
    if isinstance(raw, dict):
        msg = raw.get("error_text") or raw.get("msg")
        code = raw.get("error")
    else:
        code = None
    if r.status_code == 429:
        return ProviderError("provider rate limit reached, try again in a moment", 429, "rate_limited")
    if r.status_code in (401, 403) and not msg:
        msg = "provider rejected the provider API key"
    return ProviderError(msg or f"provider returned HTTP {r.status_code}", r.status_code, code)

def _parse_dt(v):
    try:
        return dt.datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None

def create_qr(kind: str, amount: float, provider_key: str) -> dict:
    base = config.get("provider_base_url")
    if not base:
        raise ProviderNotConfigured("provider_base_url is not set")
    try:
        r = httpx.post(f"{base}/api/v1/{kind}/create", json={"amount": amount},
                       headers={"Authorization": f"Bearer {provider_key}", "Content-Type": "application/json"}, timeout=30)
    except httpx.HTTPError as e:
        raise ProviderError(f"provider unreachable: {type(e).__name__}")
    try:
        raw = r.json()
    except ValueError:
        raw = None
    if not r.is_success or (isinstance(raw, dict) and raw.get("ok") is False):
        raise _err(r, raw)
    if not isinstance(raw, dict):
        raise ProviderError("provider returned non-JSON")
    d = _data(raw)
    ref = _pick(d, "id", "order_id", "orderId", "md5")
    out = {
        "ref": str(ref) if ref is not None else None,
        "transaction_id": str(_pick(d, "md5", "transaction_id", "tran_id") or "") or None,
        "qr_string": _pick(d, "qr", "qr_string", "khqr"),
        "qr_image": _pick(d, "qr_image", "qrImage"),
        "deeplink": _pick(d, "aba_deeplink", "deeplink", "deep_link"),
        "deeplink_android": _pick(d, "aba_deeplink_android"),
        "provider_checkout_url": _pick(d, "checkout_url"),
        "currency": "USD",     # the provider issues USD KHQR only
        "expires_at": _parse_dt(_pick(d, "expires_at")),
        "raw": raw,
    }
    if not out["ref"] or not (out["qr_string"] or out["qr_image"]):
        raise ProviderError("provider response had no id/QR data")
    return out

def check_status(p, provider_key: str) -> str:
    """Returns 'paid', 'expired' or 'pending' exactly as the provider reports it. Raises if it cannot be verified."""
    tpl = config.get("provider_check_url")
    if not tpl:
        raise ProviderNotConfigured("provider_check_url not configured")
    url = tpl.replace("{ref}", p.provider_ref or "").replace("{order_id}", p.provider_ref or "") \
             .replace("{transaction_id}", p.transaction_id or "")
    method = (config.get("provider_check_method") or "GET").upper()
    try:
        if method == "POST":
            r = httpx.post(url, json={"id": p.provider_ref}, timeout=20, headers={"Authorization": f"Bearer {provider_key}"})
        else:
            r = httpx.get(url, timeout=20, headers={"Authorization": f"Bearer {provider_key}"})
    except httpx.HTTPError as e:
        raise ProviderError(f"provider unreachable: {type(e).__name__}")
    try:
        raw = r.json()
    except ValueError:
        raw = None
    if not r.is_success or (isinstance(raw, dict) and raw.get("ok") is False):
        raise _err(r, raw)
    d = _data(raw)
    st = str(_pick(d, "status", "state", "payment_status") or "").strip().lower()
    if d.get("paid") is True or st in ("paid", "success", "successful", "completed", "settled"):
        return "paid"
    if st == "expired":
        return "expired"
    return "pending"
