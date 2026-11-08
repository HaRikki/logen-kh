import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { get } from '../lib/api'
import { Logo, Code } from '../lib/ui'
import { LangTheme } from './Layout'

const S = ['introduction', 'authentication', 'create-aba-qr', 'create-bakong-qr', 'check-payment', 'payment-history', 'webhook-integration', 'error-codes', 'rate-limits', 'examples']
const H = ({ id, children }) => <h2 id={id} className="mb-3 mt-10 scroll-mt-20 text-xl font-bold first:mt-0">{children}</h2>

export default function Docs({ standalone }) {
  const [base, setBase] = useState(location.origin)
  useEffect(() => { get('/api/public/config').then((c) => setBase(c.api_base_url || location.origin)).catch(() => {}) }, [])
  const resp = `{
  "success": true,
  "data": {
    "order_id": "ord_Xk3...",
    "type": "aba",
    "status": "pending",
    "amount": 5.0,
    "currency": "USD",
    "qr": "000201...",
    "qr_image": null,
    "deeplink": "abamobilebank://...",
    "checkout_url": "${base}/pay/ord_Xk3...",
    "expires_at": "2026-01-01T10:10:00Z"
  }
}`
  const body = (
    <div className="mx-auto flex max-w-6xl gap-8 p-4 md:p-6">
      <nav className="sticky top-20 hidden h-fit w-48 shrink-0 space-y-1 text-sm md:block">{S.map((s) => <a key={s} href={`#${s}`} className="block rounded-lg px-3 py-1.5 capitalize hover:bg-slate-100 dark:hover:bg-white/5">{s.replace(/-/g, ' ')}</a>)}</nav>
      <article className="min-w-0 flex-1 space-y-4 text-sm leading-relaxed">
        <H id="introduction">Introduction</H>
        <p>Logen KHPay is a multi-user KHQR payment API for ABA PayWay and Bakong. Connect your own merchant in the dashboard, create an API key and call the endpoints below. Base URL: <code className="rounded bg-slate-200 px-1 dark:bg-white/10">{base}</code></p>
        <p>A payment is <b>paid</b> only when the payment provider confirms it. Opening the checkout page or returning from a redirect never marks a payment paid. A QR code lives for 10 minutes.</p>
        <H id="authentication">Authentication</H>
        <p>Send your Logen KHPay key as a Bearer token. This is a platform key (<code>sk_live_…</code>), not an ABA or Bakong key. Keep it server-side.</p>
        <Code lang="http">{`Authorization: Bearer sk_live_YOUR_KEY\nContent-Type: application/json`}</Code>
        <H id="create-aba-qr">Create ABA QR</H>
        <p><code>POST /api/v1/aba/create</code> — body: <code>amount</code> (required), <code>reference</code> (optional), <code>merchant_id</code> (optional). Add an <code>Idempotency-Key</code> header to make retries safe.</p>
        <Code lang="bash">{`curl -X POST ${base}/api/v1/aba/create \\\n  -H "Authorization: Bearer sk_live_YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: order-1001" \\\n  -d '{"amount": 5}'`}</Code>
        <Code lang="json">{resp}</Code>
        <H id="create-bakong-qr">Create Bakong QR</H>
        <p><code>POST /api/v1/bakong/create</code> — same body and response, <code>type</code> is <code>bakong</code>.</p>
        <H id="check-payment">Check payment</H>
        <p><code>GET /api/v1/payment?id=ORDER_ID</code> — asks the provider for the real status. Only your own payments are returned. <code>status</code> is <code>pending</code>, <code>paid</code> or <code>expired</code>; <code>verification.verified=false</code> means the provider could not be reached.</p>
        <Code lang="bash">{`curl "${base}/api/v1/payment?id=ord_Xk3..." -H "Authorization: Bearer sk_live_YOUR_KEY"`}</Code>
        <H id="payment-history">Payment history</H>
        <p><code>GET /api/v1/payments?status=paid&amp;limit=50&amp;offset=0</code>. Health check: <code>GET /health</code>.</p>
        <H id="webhook-integration">Webhook integration</H>
        <p>Add an HTTPS endpoint in Dashboard → Webhooks. Events: <code>payment.pending</code>, <code>payment.paid</code>, <code>payment.expired</code>. Headers: <code>X-KHPay-Event</code>, <code>X-KHPay-Timestamp</code>, <code>X-KHPay-Signature</code> (hex HMAC-SHA256 of <code>{'{timestamp}.{raw body}'}</code> with your signing secret). Reply 2xx; failures are retried (30s, 2m, 10m, 1h). Reject old timestamps (&gt; 5 min) and compare signatures in constant time.</p>
        <Code lang="python">{`import hmac, hashlib, time\n\ndef verify(secret, raw_body: bytes, ts: str, sig: str) -> bool:\n    if abs(time.time() - int(ts)) > 300:\n        return False\n    mac = hmac.new(secret.encode(), ts.encode() + b"." + raw_body, hashlib.sha256).hexdigest()\n    return hmac.compare_digest(mac, sig)`}</Code>
        <H id="error-codes">Error codes</H>
        <Code lang="json">{`{ "success": false, "error": { "code": "invalid_api_key", "message": "..." } }`}</Code>
        <table className="w-full text-left text-sm"><tbody className="divide-y divide-slate-200 dark:divide-white/10">{[['401', 'invalid_api_key', 'Missing, wrong or revoked key'], ['403', 'permission_denied / account_suspended', 'Key lacks permission or account suspended'], ['400', 'no_aba_merchant / no_bakong_merchant', 'Connect and enable a merchant first'], ['404', 'payment_not_found', 'Unknown id or not yours'], ['422', 'validation_error', 'Bad input'], ['429', 'rate_limited', 'Too many requests'], ['502', 'provider_error', 'Payment provider failed or rejected the provider key'], ['503', 'maintenance', 'Platform in maintenance']].map((r) => <tr key={r[1]}><td className="py-2 pr-4 font-mono">{r[0]}</td><td className="py-2 pr-4 font-mono">{r[1]}</td><td className="py-2">{r[2]}</td></tr>)}</tbody></table>
        <H id="rate-limits">Rate limits</H>
        <p>Limits are per API key per minute (set by the admin; default 60). Exceeding returns <code>429 rate_limited</code>.</p>
        <H id="examples">Examples</H>
        <Code lang="python">{`import requests\n\nr = requests.post("${base}/api/v1/aba/create",\n    headers={"Authorization": "Bearer sk_live_YOUR_KEY"},\n    json={"amount": 5}, timeout=30)\nprint(r.json())`}</Code>
        <Code lang="javascript">{`const r = await fetch("${base}/api/v1/aba/create", {\n  method: "POST",\n  headers: { Authorization: "Bearer sk_live_YOUR_KEY", "Content-Type": "application/json" },\n  body: JSON.stringify({ amount: 5 }),\n});\nconsole.log(await r.json());`}</Code>
        <Code lang="bash">{`curl -X POST ${base}/api/v1/bakong/create -H "Authorization: Bearer sk_live_YOUR_KEY" -H "Content-Type: application/json" -d '{"amount": 5}'`}</Code>
      </article>
    </div>)
  if (!standalone) return body
  return (<div className="min-h-screen"><header className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-white/10"><Link to="/"><Logo /></Link><LangTheme /></header>{body}</div>)
}
