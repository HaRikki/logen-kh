# Logen KHPay

Multi-user **ABA PayWay + Bakong KHQR** API platform. Each user connects their own merchant (via their own provider key), creates their own `sk_live_` API keys and calls the API on your domain.
FastAPI + PostgreSQL + Alembic · React + Tailwind (Vite) · provider: https://khqrpay.site

```
main.py                  uvicorn entry (main:app)
backend/app/             config, models, security, providers (adapter), routers/, services/ (payments, webhooks, worker)
frontend/                React app (built to frontend/dist and served by FastAPI)
migrations/              Alembic (0001_initial = all 14 tables)
Dockerfile, render.yaml, docker-compose.yml, .env.example
tests/                   pure-logic tests
```

## SETUP REQUIREMENTS (read first)

1. **Provider status-check URL (required).** Only the *create* endpoints of khqrpay.site were specified. The status endpoint and response field names were **not** provided, so nothing is guessed:
   set `PROVIDER_CHECK_URL` (or Admin → Settings) to the URL from the provider docs, using `{ref}` / `{order_id}` / `{transaction_id}` placeholders. Until it is set, payments stay **pending** and are never marked paid or expired.
   If the provider's create response uses other field names, adjust the candidate lists in `backend/app/providers.py` (`create_qr`, `check_status`). The raw response is stored in `payments.provider_raw` to help you.
2. **No provider auto-provisioning is assumed.** The ABA static link / Bakong account are bound to a *provider API key*. Every user pastes their own provider key (encrypted with Fernet, never returned by any endpoint, not even to admins). Admins can also help by creating the merchant under their own account.
3. **`FERNET_KEY`** must be generated once and kept forever (losing it makes stored provider keys unreadable).
4. **Test Connection** asks the provider for one real small QR (`test_amount`, default 0.01). It is not stored as a payment and is never paid.

## Run locally
```bash
cp .env.example .env                 # fill DATABASE_URL, SECRET_KEY, FERNET_KEY, ADMIN_EMAIL
pip install -r requirements.txt
export $(grep -v '^#' .env | xargs)
alembic upgrade head
cd frontend && npm install && npm run dev      # http://localhost:5173 (proxies to :8000)
uvicorn main:app --reload --port 8000          # other terminal
```
Production-like single process: `npm run build --prefix frontend` then `uvicorn main:app` (serves the SPA from `frontend/dist`).

## Deploy to Render
**Recommended: Docker runtime** (Blueprint `render.yaml`, or *New → Web Service → Docker*). It installs Python + Node itself.
If you created the service as **Node/Python** instead, use: Build Command `npm run build`, Start Command `npm start` (they install Python packages into `./.pylibs` because Debian's Python blocks system-wide pip, and run with `PYTHONPATH=.pylibs`). (A Node-only image without pip cannot run this: switch to Docker. Runtime of an existing service cannot be changed; create a new one.)
1. Push this folder to GitHub.
2. Render → **New → Blueprint** → select the repo (`render.yaml`: Docker web service + Postgres).
3. Fill the `sync: false` env vars: `FERNET_KEY`, `ADMIN_EMAIL`, `PUBLIC_BASE_URL` (your onrender.com or custom URL), optionally `PROVIDER_CHECK_URL`, OAuth, SMTP.
4. Deploy. Migrations run on start (`alembic upgrade head`). Health check: `/health`.
5. **Register with `ADMIN_EMAIL` immediately** – that account becomes the admin (password sign-ups can claim it only while no admin exists; Google/GitHub with a *verified* email always can). Alternative: `python -m backend.app.cli make-admin you@example.com`.
6. Open **Admin → Settings**, check the *Setup checklist* and set domains / provider check URL.

Keep a single web worker (`--workers 1`): the background verifier and the in-memory rate limiter are per-process. For several instances move the rate limiter to Redis; payment/webhook state changes are already atomic.
Render's free Postgres expires after 30 days: use a paid plan for real money flows.

### VPS / other hosts
`cp .env.example .env && docker compose up -d --build`, then put Caddy/nginx/Cloudflare in front for HTTPS (forward `X-Forwarded-For/Proto`; uvicorn already runs with `--proxy-headers`).

### Domains (Admin → Settings → Domain & hosting)
`site_url`, `api_base_url`, `checkout_base_url`, `webhook_base_url`, `allowed_origins` (CORS). Nothing is hardcoded: docs, checkout URLs (`{checkout}/pay/{order_id}`) and OAuth redirect URLs are generated from these (fallback = request origin). To use `api.` / `pay.` subdomains point all of them at this same service (custom domains on Render, or Cloudflare proxy) and set the URLs. Use HTTPS so cookies are `Secure`.

## Login methods
| Method | What to configure |
|---|---|
| Email/password | works out of the box. Forgot-password sends mail via `SMTP_*`; without SMTP the link is only logged on the server. |
| Google | OAuth client → redirect URI `{site}/auth/google/callback` → `GOOGLE_CLIENT_ID/SECRET` |
| GitHub | OAuth App → callback `{site}/auth/github/callback` → `GITHUB_CLIENT_ID/SECRET` |
| Telegram | create a bot with @BotFather, `/setdomain` → your site domain, set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_USERNAME`. The hash is verified on the backend (HMAC with SHA-256 of the bot token, 10-minute freshness). |
Buttons only appear for configured providers. Accounts can connect/disconnect socials in Profile & Settings (the last login method cannot be removed).

## Public API
Base: your API URL. Header: `Authorization: Bearer sk_live_...`. Full docs inside the app at `/docs`.
| | |
|---|---|
| `POST /api/v1/aba/create` | `{"amount": 5}` (+ optional `reference`, `merchant_id`, header `Idempotency-Key`) |
| `POST /api/v1/bakong/create` | same |
| `GET /api/v1/payment?id=ORDER_ID` | live provider verification, ownership enforced |
| `GET /api/v1/payments` | `status`, `limit`, `offset` |
| `GET /health` | |
Responses: `{"success": true, "data": {...}}`, errors `{"success": false, "error": {"code","message"}}`.
Checkout page: `{checkout}/pay/{order_id}` (polls the backend, which asks the provider; never trusts a redirect).

Webhooks: `payment.pending|paid|expired`, queued only after the status was confirmed by the provider response, signed `X-KHPay-Signature = HMAC_SHA256(secret, "{X-KHPay-Timestamp}.{body}")`, HTTPS-only with private-IP (SSRF) blocking, retries at 30s / 2m / 10m / 1h, logs + manual retry. `payment.test` is sent only by the "Test" button.

## Security summary
PBKDF2-SHA256 passwords · API keys stored as SHA-256 (shown once, instant revoke) · provider keys & webhook secrets Fernet-encrypted · signed HttpOnly SameSite cookies + CSRF token header · session version (password change/suspend signs everyone out) · per-IP and per-key rate limits · Pydantic validation + SQLAlchemy parameters · ownership checks in queries · audit log · idempotency keys · atomic status transitions · security headers/HSTS · admins never see API secrets or provider keys.

## Testing
```bash
python tests/test_security.py                      # pure logic
curl $URL/health
# 1 register + login in the browser, 2 add merchant (ABA/Bakong) + Test Connection, 3 create API key
curl -X POST $URL/api/v1/aba/create -H "Authorization: Bearer sk_live_..." -H "Content-Type: application/json" -d '{"amount":1}'
curl "$URL/api/v1/payment?id=ord_..." -H "Authorization: Bearer sk_live_..."
```
Then open `checkout_url`, pay a small real amount, and confirm status turns **paid** (requires `PROVIDER_CHECK_URL`) and your webhook receives `payment.paid`.
