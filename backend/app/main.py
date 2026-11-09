import asyncio, logging, os, time
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from . import config
from .db import SessionLocal
from .models import ApiUsageLog
from .deps import client_ip
from .routers import auth, dashboard, public, admin
from .services import worker

logging.basicConfig(level=logging.INFO)
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

def seed_admin():
    """Create/refresh the pre-defined admin (ADMIN_USERNAME / ADMIN_PASSWORD env). No password in env = nothing is created."""
    if not (config.ADMIN_USERNAME and config.ADMIN_PASSWORD):
        logging.getLogger("khpay").warning("ADMIN_PASSWORD not set: predefined admin login disabled")
        return
    try:
        from sqlalchemy import select
        from .models import User, Admin
        from .security import hash_password, verify_password
        with SessionLocal() as s:
            u = s.scalar(select(User).where(User.username == config.ADMIN_USERNAME))
            if not u:
                u = User(username=config.ADMIN_USERNAME, display_name=config.ADMIN_USERNAME,
                         password_hash=hash_password(config.ADMIN_PASSWORD))
                s.add(u); s.commit()
            elif not verify_password(config.ADMIN_PASSWORD, u.password_hash):
                u.password_hash = hash_password(config.ADMIN_PASSWORD); u.session_version += 1   # env is the source of truth
                u.status = "active"; s.commit()
            if config.ADMIN_EMAIL and not u.email and not s.scalar(select(User.id).where(User.email == config.ADMIN_EMAIL)):
                u.email = config.ADMIN_EMAIL; s.commit()   # lets the admin also sign in / reset password by email
            if not s.scalar(select(Admin.id).where(Admin.user_id == u.id)):
                s.add(Admin(user_id=u.id, role="owner")); s.commit()
    except Exception:
        logging.getLogger("khpay").exception("admin seed failed")

@asynccontextmanager
async def lifespan(app):
    if os.environ.get("AUTO_CREATE_TABLES") == "1":   # dev convenience only; production uses `alembic upgrade head`
        from .db import Base, engine
        from . import models  # noqa
        Base.metadata.create_all(engine)
    seed_admin()
    task = asyncio.create_task(worker.loop()) if os.environ.get("DISABLE_WORKER") != "1" else None
    yield
    if task:
        task.cancel()

app = FastAPI(title="Logen KHPay", version="1.0.0", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(GZipMiddleware, minimum_size=700)   # JS/CSS/JSON are 3-4x smaller on the wire

def err(status, code, message, extra=None):
    body = {"success": False, "error": {"code": code, "message": message}}
    return JSONResponse(body, status_code=status)

@app.exception_handler(StarletteHTTPException)
async def http_exc(request, exc):
    d = exc.detail
    if isinstance(d, dict) and "code" in d:
        return err(exc.status_code, d["code"], d.get("message", d["code"]))
    return err(exc.status_code, "http_error", str(d))

@app.exception_handler(RequestValidationError)
async def val_exc(request, exc):
    first = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(x) for x in first.get("loc", []) if x != "body")
    return err(422, "validation_error", f"{loc}: {first.get('msg', 'invalid input')}".strip(": "))

@app.exception_handler(Exception)
async def any_exc(request, exc):
    logging.getLogger("khpay").exception("unhandled error")
    return err(500, "internal_error", "Something went wrong on our side.")

@app.middleware("http")
async def core_middleware(request: Request, call_next):
    path = request.url.path
    origin = request.headers.get("origin")
    allowed = [o.strip().rstrip("/") for o in config.get("allowed_origins").split(",") if o.strip()]
    cors = origin and origin.rstrip("/") in allowed
    if request.method == "OPTIONS" and cors:
        return Response(status_code=204, headers={"Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Authorization,Content-Type,Idempotency-Key,X-CSRF-Token", "Vary": "Origin"})
    if config.get("maintenance_mode") == "1" and (path.startswith("/api/v1/") or path.startswith("/api/dashboard/payments")):
        return err(503, "maintenance", "Logen KHPay is under maintenance. Try again shortly.")
    t0 = time.time()
    resp = await call_next(request)
    if path.startswith("/api/v1/"):
        try:
            with SessionLocal() as s:
                s.add(ApiUsageLog(user_id=getattr(request.state, "api_user_id", None), api_key_id=getattr(request.state, "api_key_id", None),
                                  method=request.method, path=path[:200], status_code=resp.status_code, ip=client_ip(request),
                                  latency_ms=int((time.time() - t0) * 1000)))
                s.commit()
        except Exception:
            logging.getLogger("khpay").exception("usage log failed")
    if cors:
        resp.headers["Access-Control-Allow-Origin"] = origin; resp.headers["Access-Control-Allow-Credentials"] = "true"; resp.headers["Vary"] = "Origin"
    if path.startswith("/assets/"):                 # hashed filenames: cache forever
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif path.startswith(("/api/", "/auth/", "/admin/api/")):
        resp.headers["Cache-Control"] = "no-store"
    elif "text/html" in resp.headers.get("content-type", ""):
        resp.headers["Cache-Control"] = "no-cache"     # always pick up the newest build
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if config.is_https():
        resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return resp

for r in (public.router, auth.router, dashboard.router, admin.router):
    app.include_router(r)

# ---- React SPA (built by `npm run build` into frontend/dist) ----
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith(("api/", "auth/", "admin/api/")):
            return err(404, "not_found", "Not found")
        f = (DIST / full_path).resolve()
        if full_path and f.is_file() and DIST in f.parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
else:
    @app.get("/", include_in_schema=False)
    async def root():
        return {"service": "Logen KHPay API", "note": "Frontend not built. Run `npm run build` in /frontend.", "health": "/health"}
