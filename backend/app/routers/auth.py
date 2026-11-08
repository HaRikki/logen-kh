import hashlib, hmac, re, secrets, time, datetime as dt, logging
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .. import config
from ..db import get_db
from ..deps import ApiError, session_user, audit, limit_ip, client_ip, is_admin
from ..models import User, Admin, UserSocialAccount, PasswordResetToken, now
from ..security import (hash_password, verify_password, make_session, read_session, make_state, read_state,
                        csrf_token, sha256, SESSION_LONG, rate_hit)
from ..services import mail

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("khpay.auth")
EMAIL_RE = r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$"

# ---------------- helpers ----------------
def set_login(resp: Response, u: User, remember: bool):
    age = SESSION_LONG if remember else None
    secure = config.is_https()
    resp.set_cookie("sid", make_session(u.id, u.session_version, remember), httponly=True, secure=secure,
                    samesite="lax", max_age=age, path="/")
    resp.set_cookie("csrf", csrf_token(), httponly=False, secure=secure, samesite="lax", max_age=age, path="/")

def maybe_promote(s: Session, u: User, verified: bool):
    if not (config.ADMIN_EMAIL and u.email and u.email.lower() == config.ADMIN_EMAIL):
        return
    if s.scalar(select(Admin.id).where(Admin.user_id == u.id)):
        return
    # Unverified (password) sign-ups may claim ADMIN_EMAIL only while no admin exists yet.
    if verified or s.scalar(select(Admin.id).limit(1)) is None:
        s.add(Admin(user_id=u.id, role="owner")); s.commit()

def user_json(s: Session, u: User):
    socials = s.scalars(select(UserSocialAccount).where(UserSocialAccount.user_id == u.id)).all()
    return {"id": u.id, "email": u.email, "display_name": u.display_name, "avatar_url": u.avatar_url,
            "is_admin": is_admin(s, u), "has_password": bool(u.password_hash), "created_at": u.created_at,
            "socials": [{"provider": x.provider, "username": x.username, "avatar_url": x.avatar_url} for x in socials]}

class Cred(BaseModel):
    email: str = Field(pattern=EMAIL_RE, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    remember: bool = True

# ---------------- email / password ----------------
@router.get("/config")
def auth_config():
    return {"google": bool(config.OAUTH["google"][0]), "github": bool(config.OAUTH["github"][0]),
            "telegram": bool(config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_BOT_USERNAME),
            "telegram_bot": config.TELEGRAM_BOT_USERNAME or None}

@router.post("/register")
def register(c: Cred, req: Request, resp: Response, s: Session = Depends(get_db)):
    limit_ip(req, "register", 10, 3600)
    email = c.email.lower()
    if s.scalar(select(User).where(User.email == email)):
        raise ApiError(409, "email_taken", "This email is already registered.")
    u = User(email=email, password_hash=hash_password(c.password), display_name=email.split("@")[0])
    s.add(u); s.commit()
    maybe_promote(s, u, verified=False)
    audit(s, req, u.id, "register")
    set_login(resp, u, c.remember)
    return user_json(s, u)

@router.post("/login")
def login(c: Cred, req: Request, resp: Response, s: Session = Depends(get_db)):
    limit_ip(req, "login", 20, 60)
    email = c.email.lower()
    if not rate_hit(f"login:{email}", 10, 300):
        raise ApiError(429, "rate_limited", "Too many attempts for this account. Try again in a few minutes.")
    u = s.scalar(select(User).where(User.email == email))
    if not u or not verify_password(c.password, u.password_hash):
        raise ApiError(401, "bad_credentials", "Email or password is incorrect.")
    if u.status != "active":
        raise ApiError(403, "account_suspended", "Your account is suspended.")
    u.last_login_at = now(); s.commit()
    maybe_promote(s, u, verified=False)
    audit(s, req, u.id, "login")
    set_login(resp, u, c.remember)
    return user_json(s, u)

@router.post("/logout")
def logout(resp: Response):
    resp.delete_cookie("sid", path="/"); resp.delete_cookie("csrf", path="/")
    return {"ok": True}

@router.get("/me")
def me(u: User = Depends(session_user), s: Session = Depends(get_db)):
    return user_json(s, u)

class ProfileIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)

@router.patch("/profile")
def profile(b: ProfileIn, u: User = Depends(session_user), s: Session = Depends(get_db)):
    u.display_name = b.display_name.strip(); s.commit(); return user_json(s, u)

class ChangePw(BaseModel):
    current_password: str | None = None
    new_password: str = Field(min_length=8, max_length=128)

@router.post("/change-password")
def change_password(b: ChangePw, req: Request, resp: Response, u: User = Depends(session_user), s: Session = Depends(get_db)):
    if u.password_hash and not verify_password(b.current_password or "", u.password_hash):
        raise ApiError(400, "bad_current_password", "Current password is incorrect.")
    u.password_hash = hash_password(b.new_password); u.session_version += 1; s.commit()
    audit(s, req, u.id, "change_password")
    set_login(resp, u, True)   # keep this browser signed in, kill all other sessions
    return {"ok": True}

class ForgotIn(BaseModel):
    email: str = Field(pattern=EMAIL_RE)

@router.post("/forgot-password")
def forgot(b: ForgotIn, req: Request, s: Session = Depends(get_db)):
    limit_ip(req, "forgot", 5, 3600)
    u = s.scalar(select(User).where(User.email == b.email.lower()))
    if u and u.status == "active":
        raw = secrets.token_urlsafe(32)
        s.add(PasswordResetToken(user_id=u.id, token_hash=sha256(raw), expires_at=now() + dt.timedelta(hours=1))); s.commit()
        link = f"{config.base_url(req)}/reset-password?token={raw}"
        mail.send(u.email, "Reset your Logen KHPay password", f"Open this link within 1 hour:\n{link}\n\nIgnore this email if it was not you.")
    return {"ok": True}  # same answer whether or not the account exists

class ResetIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)

@router.post("/reset-password")
def reset(b: ResetIn, req: Request, s: Session = Depends(get_db)):
    limit_ip(req, "reset", 10, 3600)
    t = s.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == sha256(b.token)))
    exp = t.expires_at.replace(tzinfo=dt.timezone.utc) if t and t.expires_at.tzinfo is None else (t.expires_at if t else None)
    if not t or t.used or exp < now():
        raise ApiError(400, "invalid_token", "Reset link is invalid or expired.")
    u = s.get(User, t.user_id)
    u.password_hash = hash_password(b.new_password); u.session_version += 1; t.used = True; s.commit()
    audit(s, req, u.id, "reset_password")
    return {"ok": True}

# ---------------- social accounts ----------------
@router.delete("/social/{provider}")
def disconnect(provider: str, req: Request, u: User = Depends(session_user), s: Session = Depends(get_db)):
    rows = s.scalars(select(UserSocialAccount).where(UserSocialAccount.user_id == u.id)).all()
    row = next((r for r in rows if r.provider == provider), None)
    if not row:
        raise ApiError(404, "not_connected")
    if not u.password_hash and len(rows) <= 1:
        raise ApiError(400, "last_login_method", "Set a password first; this is your only way to sign in.")
    s.delete(row); s.commit(); audit(s, req, u.id, "social_disconnect", provider)
    return {"ok": True}

def _redirect(path: str, **q):
    return RedirectResponse(path + ("?" + urlencode(q) if q else ""), status_code=303)

def finish_social(s, req, provider, pid, username, email, verified, avatar, name, mode, uid):
    row = s.scalar(select(UserSocialAccount).where(UserSocialAccount.provider == provider,
                                                    UserSocialAccount.provider_user_id == str(pid)))
    if mode == "connect":
        if row and row.user_id != uid:
            return _redirect("/dashboard/settings", error="social_already_linked")
        if not row:
            s.add(UserSocialAccount(user_id=uid, provider=provider, provider_user_id=str(pid), username=username,
                                    email=email, avatar_url=avatar)); s.commit()
        u = s.get(User, uid)
        if avatar and not u.avatar_url:
            u.avatar_url = avatar; s.commit()
        audit(s, req, uid, "social_connect", provider)
        return _redirect("/dashboard/settings", connected=provider)
    if row:
        u = s.get(User, row.user_id)
    else:
        u = s.scalar(select(User).where(User.email == email.lower())) if (email and verified) else None
        if not u:
            u = User(email=email.lower() if (email and verified) else None, display_name=name or username, avatar_url=avatar)
            s.add(u); s.commit()
        s.add(UserSocialAccount(user_id=u.id, provider=provider, provider_user_id=str(pid), username=username,
                                email=email, avatar_url=avatar)); s.commit()
    if u.status != "active":
        return _redirect("/login", error="account_suspended")
    u.last_login_at = now()
    if avatar and not u.avatar_url:
        u.avatar_url = avatar
    s.commit()
    maybe_promote(s, u, verified=bool(verified))
    audit(s, req, u.id, "login", provider)
    r = _redirect("/dashboard"); set_login(r, u, True)
    return r

# ---------------- Telegram Login Widget ----------------
TG_FIELDS = ("id", "first_name", "last_name", "username", "photo_url", "auth_date")

@router.get("/telegram/callback")
def telegram_callback(req: Request, s: Session = Depends(get_db)):
    q = dict(req.query_params)
    token = config.TELEGRAM_BOT_TOKEN
    if not token:
        return _redirect("/login", error="provider_not_configured")
    given = q.get("hash", "")
    check = "\n".join(f"{k}={q[k]}" for k in sorted(TG_FIELDS) if k in q)
    calc = hmac.new(hashlib.sha256(token.encode()).digest(), check.encode(), hashlib.sha256).hexdigest()
    mode, uid = "login", None
    d = read_session(req.cookies.get("sid", ""))
    if q.get("mode") == "connect" and d:
        mode, uid = "connect", d["u"]
    back = "/dashboard/settings" if mode == "connect" else "/login"
    try:
        fresh = abs(time.time() - int(q.get("auth_date", "0"))) < 600
    except ValueError:
        fresh = False
    if not given or not hmac.compare_digest(calc, given) or not fresh or "id" not in q:
        return _redirect(back, error="telegram_verification_failed")
    name = " ".join(x for x in (q.get("first_name"), q.get("last_name")) if x) or None
    return finish_social(s, req, "telegram", q["id"], q.get("username"), None, False, q.get("photo_url"), name, mode, uid)

# ---------------- Google / GitHub OAuth 2.0 (authorization-code, server side) ----------------
OAUTH_CFG = {
    "google": dict(auth="https://accounts.google.com/o/oauth2/v2/auth", token="https://oauth2.googleapis.com/token",
                   scope="openid email profile"),
    "github": dict(auth="https://github.com/login/oauth/authorize", token="https://github.com/login/oauth/access_token",
                   scope="read:user user:email"),
}

@router.get("/{provider}/start")
def oauth_start(provider: str, req: Request, mode: str = "login", s: Session = Depends(get_db)):
    if provider not in OAUTH_CFG or not config.OAUTH[provider][0]:
        return _redirect("/login", error="provider_not_configured")
    uid = None
    if mode == "connect":
        d = read_session(req.cookies.get("sid", ""))
        if not d:
            return _redirect("/login", error="login_required")
        uid = d["u"]
    nonce = secrets.token_urlsafe(24)
    cfg = OAUTH_CFG[provider]
    q = {"client_id": config.OAUTH[provider][0], "redirect_uri": f"{config.base_url(req)}/auth/{provider}/callback",
         "response_type": "code", "scope": cfg["scope"], "state": nonce}
    if provider == "google":
        q["prompt"] = "select_account"
    r = RedirectResponse(f"{cfg['auth']}?{urlencode(q)}", status_code=303)
    r.set_cookie("oauth_state", make_state({"n": nonce, "m": mode, "u": uid, "p": provider}), httponly=True,
                 secure=config.is_https(), samesite="lax", max_age=600, path="/auth")
    return r

@router.get("/{provider}/callback")
def oauth_callback(provider: str, req: Request, code: str = "", state: str = "", error: str = "", s: Session = Depends(get_db)):
    if provider not in OAUTH_CFG:
        raise ApiError(404, "unknown_provider")
    st = read_state(req.cookies.get("oauth_state", ""))
    back = "/dashboard/settings" if (st and st.get("m") == "connect") else "/login"
    if error or not st or st.get("p") != provider or not hmac.compare_digest(st["n"], state):
        return _redirect(back, error="oauth_failed")
    cid, csec = config.OAUTH[provider]
    cfg = OAUTH_CFG[provider]
    try:
        with httpx.Client(timeout=15, headers={"Accept": "application/json"}) as c:
            tok = c.post(cfg["token"], data={"client_id": cid, "client_secret": csec, "code": code,
                         "redirect_uri": f"{config.base_url(req)}/auth/{provider}/callback",
                         "grant_type": "authorization_code"}).json().get("access_token")
            if not tok:
                return _redirect(back, error="oauth_failed")
            h = {"Authorization": f"Bearer {tok}"}
            if provider == "google":
                i = c.get("https://openidconnect.googleapis.com/v1/userinfo", headers=h).json()
                args = (i["sub"], i.get("email"), i.get("email"), bool(i.get("email_verified")), i.get("picture"), i.get("name"))
            else:
                i = c.get("https://api.github.com/user", headers=h).json()
                em = c.get("https://api.github.com/user/emails", headers=h).json()
                prim = next((e for e in em if isinstance(e, dict) and e.get("primary") and e.get("verified")), None) if isinstance(em, list) else None
                args = (i["id"], i.get("login"), prim["email"] if prim else None, bool(prim), i.get("avatar_url"), i.get("name"))
    except Exception:
        log.exception("oauth exchange failed")
        return _redirect(back, error="oauth_failed")
    pid, username, email, verified, avatar, name = args
    if provider == "google":
        username = (email or "").split("@")[0] or None
    res = finish_social(s, req, provider, pid, username, email, verified, avatar, name, st["m"], st.get("u"))
    res.delete_cookie("oauth_state", path="/auth")
    return res

