import datetime as dt
from fastapi import Depends, Request, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import config
from .db import get_db
from .models import User, Admin, ApiKey, AuditLog, now
from .security import read_session, hash_key, rate_hit

class ApiError(HTTPException):
    def __init__(self, status: int, code: str, message: str | None = None):
        super().__init__(status_code=status, detail={"code": code, "message": message or code.replace("_", " ")})

def client_ip(req: Request) -> str:
    xf = req.headers.get("x-forwarded-for")
    if xf:
        return xf.split(",")[0].strip()
    return req.client.host if req.client else "unknown"

def audit(s: Session, req: Request | None, user_id, action: str, target: str | None = None):
    s.add(AuditLog(user_id=user_id, action=action, target=target, ip=client_ip(req) if req else None))
    s.commit()

def limit_ip(req: Request, bucket: str, limit: int, window: int = 60):
    if not rate_hit(f"{bucket}:{client_ip(req)}", limit, window):
        raise ApiError(429, "rate_limited", "Too many attempts, slow down.")

def session_user(req: Request, s: Session = Depends(get_db)) -> User:
    d = read_session(req.cookies.get("sid", ""))
    if not d:
        raise ApiError(401, "not_authenticated", "Please log in.")
    if req.method not in ("GET", "HEAD", "OPTIONS"):
        c, h = req.cookies.get("csrf"), req.headers.get("x-csrf-token")
        if not c or not h or c != h:
            raise ApiError(403, "csrf_failed", "CSRF token missing or invalid.")
    u = s.get(User, d["u"])
    if not u or u.session_version != d["v"]:
        raise ApiError(401, "not_authenticated", "Session expired.")
    if u.status != "active":
        raise ApiError(403, "account_suspended", "Your account is suspended.")
    return u

def is_admin(s: Session, u: User) -> bool:
    return s.scalar(select(Admin.id).where(Admin.user_id == u.id)) is not None

def admin_user(u: User = Depends(session_user), s: Session = Depends(get_db)) -> User:
    if not is_admin(s, u):
        raise ApiError(403, "forbidden", "Admin only.")
    return u

class ApiAuth:
    def __init__(self, user: User, key: ApiKey):
        self.user, self.key = user, key

def api_auth(perm: str):
    def dep(req: Request, s: Session = Depends(get_db)) -> ApiAuth:
        h = req.headers.get("authorization", "")
        if not h.lower().startswith("bearer "):
            raise ApiError(401, "invalid_api_key", "Send 'Authorization: Bearer sk_live_...'.")
        secret = h[7:].strip()
        if not secret.startswith("sk_live_"):
            raise ApiError(401, "invalid_api_key")
        k = s.scalar(select(ApiKey).where(ApiKey.key_hash == hash_key(secret)))
        if not k or k.revoked:
            raise ApiError(401, "invalid_api_key", "API key is invalid or revoked.")
        u = s.get(User, k.user_id)
        if not u or u.status != "active":
            raise ApiError(403, "account_suspended")
        if perm not in k.permissions.split(","):
            raise ApiError(403, "permission_denied", f"This key lacks '{perm}'.")
        try:
            lim = int(config.get("rate_limit_per_min"))
        except ValueError:
            lim = 60
        if not rate_hit(f"key:{k.id}", lim):
            raise ApiError(429, "rate_limited", f"Limit is {lim} requests/minute per key.")
        k.last_used_at = now(); k.request_count = (k.request_count or 0) + 1
        s.commit()
        req.state.api_key_id, req.state.api_user_id = k.id, u.id
        return ApiAuth(u, k)
    return dep
