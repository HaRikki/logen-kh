import base64, hashlib, hmac, secrets, time, threading
from collections import defaultdict, deque
from cryptography.fernet import Fernet, InvalidToken
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from . import config

# ---------- passwords (PBKDF2-HMAC-SHA256, per-user salt) ----------
_ITER = 310_000

def hash_password(pw: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), _ITER).hex()
    return f"pbkdf2${_ITER}${salt}${h}"

def verify_password(pw: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _, it, salt, h = stored.split("$")
        calc = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), int(it)).hex()
        return hmac.compare_digest(calc, h)
    except Exception:
        return False

# ---------- encryption of provider credentials / webhook secrets ----------
def _fernet() -> Fernet:
    if not config.FERNET_KEY:
        raise RuntimeError("FERNET_KEY is not configured")
    return Fernet(config.FERNET_KEY.encode())

def encrypt(s: str) -> str:
    return _fernet().encrypt(s.encode()).decode()

def decrypt(s: str) -> str:
    try:
        return _fernet().decrypt(s.encode()).decode()
    except InvalidToken:
        raise RuntimeError("Cannot decrypt stored secret (FERNET_KEY changed?)")

# ---------- sessions ----------
_session = URLSafeTimedSerializer(config.SECRET_KEY, salt="khpay-session")
_state = URLSafeTimedSerializer(config.SECRET_KEY, salt="khpay-oauth-state")
SESSION_LONG = 60 * 60 * 24 * 30
SESSION_SHORT = 60 * 60 * 12

def make_session(user_id: int, version: int, remember: bool) -> str:
    return _session.dumps({"u": user_id, "v": version, "r": bool(remember)})

def read_session(token: str):
    try:
        d = _session.loads(token, max_age=SESSION_LONG)
        return d
    except (BadSignature, SignatureExpired):
        return None

def make_state(payload: dict) -> str:
    return _state.dumps(payload)

def read_state(token: str, max_age=600):
    try:
        return _state.loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None

def csrf_token() -> str:
    return secrets.token_urlsafe(24)

# ---------- API keys ----------
def new_api_key() -> str:
    return "sk_live_" + secrets.token_urlsafe(32)

def hash_key(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()

def sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()

# ---------- sliding-window rate limiter (per process; use Redis if you run several workers) ----------
_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()

def rate_hit(key: str, limit: int, window: int = 60) -> bool:
    """True if allowed."""
    t = time.time()
    with _lock:
        q = _hits[key]
        while q and t - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(t)
        if len(_hits) > 50_000:
            for k in [k for k, v in _hits.items() if not v][:10_000]:
                _hits.pop(k, None)
        return True
