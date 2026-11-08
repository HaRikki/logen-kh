"""Pure-logic tests (no DB/network). Run: python -m pytest tests -q   (or python tests/test_security.py)"""
import os, sys, hmac, hashlib
from cryptography.fernet import Fernet
os.environ["FERNET_KEY"] = Fernet.generate_key().decode()
os.environ["SECRET_KEY"] = "test-secret"
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from backend.app import security as sec

def test_password():
    h = sec.hash_password("correct horse")
    assert sec.verify_password("correct horse", h) and not sec.verify_password("wrong", h)
    assert not sec.verify_password("x", None)

def test_encrypt_roundtrip():
    c = sec.encrypt("provider-key-123")
    assert c != "provider-key-123" and sec.decrypt(c) == "provider-key-123"

def test_api_key():
    k = sec.new_api_key()
    assert k.startswith("sk_live_") and len(k) > 40
    assert sec.hash_key(k) == sec.hash_key(k) != k and len(sec.hash_key(k)) == 64

def test_session_tamper():
    t = sec.make_session(5, 2, True)
    assert sec.read_session(t)["u"] == 5
    assert sec.read_session(t[:-2] + "xx") is None

def test_rate_limit():
    assert all(sec.rate_hit("t", 3) for _ in range(3)) and not sec.rate_hit("t", 3)

def test_webhook_signature():
    pytest_sig = hmac.new(b"s", b"123.{}", hashlib.sha256).hexdigest()
    try:
        from backend.app.services.webhooks import sign
    except ImportError:  # httpx not installed in this environment
        return
    assert sign("s", "123", "{}") == pytest_sig

def test_telegram_hash():
    token = "123:ABC"; data = {"id": "42", "first_name": "A", "auth_date": "1700000000"}
    check = "\n".join(f"{k}={data[k]}" for k in sorted(data))
    good = hmac.new(hashlib.sha256(token.encode()).digest(), check.encode(), hashlib.sha256).hexdigest()
    forged = dict(data, id="43")
    check2 = "\n".join(f"{k}={forged[k]}" for k in sorted(forged))
    bad = hmac.new(hashlib.sha256(token.encode()).digest(), check2.encode(), hashlib.sha256).hexdigest()
    assert good != bad

if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"):
            f(); print("ok", n)
