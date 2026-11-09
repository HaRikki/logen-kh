import { useEffect, useState } from 'react'
import { Users, UserCheck, UserX, CreditCard, CheckCircle2, Clock, Activity, Coins } from 'lucide-react'
import { get, post, patch, put, A } from '../lib/api'
import { Page, Table, Badge, Stat, Bars, Skeleton, Err, Empty, Pager, Toggle, Field, useLoad, money, when } from '../lib/ui'

export function AdminOverview() {
  const { data: d, error, loading } = useLoad(() => get(`${A}/overview`))
  if (loading) return <Skeleton />
  if (error) return <Err e={error} />
  return (<Page title="Admin Dashboard">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat icon={Users} label="Users" value={d.users} /><Stat icon={UserCheck} label="Active" value={d.active_users} /><Stat icon={UserX} label="Suspended" value={d.suspended_users} /><Stat icon={Activity} label="API requests (24h)" value={d.api_requests_24h} />
      <Stat icon={CreditCard} label="Total Payments" value={d.total} /><Stat icon={CheckCircle2} label="Successful Payments" value={d.paid} /><Stat icon={Clock} label="Pending Payments" value={d.pending} /><Stat icon={Coins} label="Total Payment Amount" value={money(d.paid_amount)} />
    </div>
    <div className="grid gap-4 lg:grid-cols-2"><div className="card"><h3 className="mb-3 font-semibold">Payment analytics</h3><Bars data={d.payments_series} label="payments / day" /></div><div className="card"><h3 className="mb-3 font-semibold">API traffic</h3><Bars data={d.requests_series} label="requests / day" /></div></div></Page>)
}

export function AdminUsers() {
  const [q, setQ] = useState(''); const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useLoad(() => get(`${A}/users?q=${encodeURIComponent(q)}&page_n=${page}`), [q, page])
  const set = async (u, status) => { await patch(`${A}/users/${u.id}/status`, { status }); reload() }
  return (<Page title="User Management" actions={<input className="input !w-56" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />}>
    <Err e={error} />{loading ? <Skeleton /> : (<><Table head={['ID', 'User', 'Login methods', 'Payments', 'Joined', 'Last login', 'Status', '']}>
      {data.items.map((u) => <tr key={u.id}><td className="td">{u.id}</td><td className="td"><div className="font-medium">{u.display_name}{u.is_admin && <span className="ml-2 text-xs text-sea">admin</span>}</div><div className="text-xs text-slate-500">{u.email || '—'}</div></td>
        <td className="td text-xs">{['password', ...u.socials].join(', ')}</td><td className="td">{u.payments}</td><td className="td text-xs">{when(u.created_at)}</td><td className="td text-xs">{when(u.last_login_at)}</td><td className="td"><Badge v={u.status} /></td>
        <td className="td">{u.status === 'active' ? <button className="btn-ghost !py-1 text-red-500" onClick={() => confirm('Suspend this user?') && set(u, 'suspended')}>Suspend</button> : <button className="btn-ghost !py-1" onClick={() => set(u, 'active')}>Activate</button>}</td></tr>)}</Table>
      <Pager total={data.total} page={page} setPage={setPage} size={50} /></>)}</Page>)
}

export function AdminKeys() {
  const [page, setPage] = useState(1); const { data, error, loading, reload } = useLoad(() => get(`${A}/keys?page_n=${page}`), [page])
  return (<Page title="API Key Management"><div className="card text-sm">Secrets are stored hashed, so only the prefix is visible here. You can revoke any key.</div><Err e={error} />
    {loading ? <Skeleton /> : (<><Table head={['Owner', 'Name', 'Key', 'Permissions', 'Requests', 'Last used', 'Status', '']}>
      {data.items.map((k) => <tr key={k.id}><td className="td text-xs">{k.owner}</td><td className="td">{k.name}</td><td className="td font-mono text-xs">{k.prefix}…</td><td className="td text-xs">{k.permissions.join(', ')}</td><td className="td">{k.request_count}</td><td className="td text-xs">{when(k.last_used_at)}</td>
        <td className="td"><Badge v={k.revoked ? 'revoked' : 'active'} /></td><td className="td">{!k.revoked && <button className="btn-ghost !py-1 text-red-500" onClick={async () => { await post(`${A}/keys/${k.id}/revoke`); reload() }}>Revoke</button>}</td></tr>)}</Table>
      <Pager total={data.total} page={page} setPage={setPage} size={50} /></>)}</Page>)
}

export function AdminMerchants() {
  const { data, error, loading, reload } = useLoad(() => get(`${A}/merchants`))
  return (<Page title="Merchant Management"><div className="card text-sm">Provider credentials are encrypted and never exposed, not even to admins.</div><Err e={error} />
    {loading ? <Skeleton /> : !data.length ? <Empty>No merchants.</Empty> : <Table head={['Type', 'Owner', 'Name', 'Connection', 'Enabled']}>
      {data.map((m) => <tr key={m.kind + m.id}><td className="td uppercase">{m.kind}</td><td className="td text-xs">{m.owner}</td><td className="td">{m.name}</td><td className="td"><Badge v={m.connection_status} /></td>
        <td className="td"><Toggle on={m.enabled} onChange={async () => { await post(`${A}/merchants/${m.kind}/${m.id}/toggle`); reload() }} /></td></tr>)}</Table>}</Page>)
}

export function AdminPayments() {
  const [status, setStatus] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1)
  const { data, error, loading } = useLoad(() => get(`${A}/payments?status=${status}&q=${encodeURIComponent(q)}&page_n=${page}`), [status, q, page])
  return (<Page title="Payment Monitoring" actions={<><input className="input !w-48" placeholder="Order / email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
    <select className="input !w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}><option value="">All</option><option>pending</option><option>paid</option><option>expired</option></select></>}>
    <Err e={error} />{loading ? <Skeleton /> : (<><Table head={['Order', 'Owner', 'Type', 'Merchant', 'Amount', 'Status', 'Created', 'Paid']}>
      {data.items.map((p) => <tr key={p.order_id}><td className="td font-mono text-xs">{p.order_id}</td><td className="td text-xs">{p.owner}</td><td className="td uppercase">{p.kind}</td><td className="td">{p.merchant_name}</td><td className="td">{money(p.amount, p.currency)}</td><td className="td"><Badge v={p.status} /></td><td className="td text-xs">{when(p.created_at)}</td><td className="td text-xs">{when(p.paid_at)}</td></tr>)}</Table>
      <Pager total={data.total} page={page} setPage={setPage} size={50} /></>)}</Page>)
}

export function AdminLogs() {
  const [tab, setTab] = useState('api'); const [page, setPage] = useState(1)
  const { data, error, loading } = useLoad(() => get(`${A}/logs/${tab}?page_n=${page}`), [tab, page])
  const cols = { api: [['created_at', 'Time'], ['user', 'User'], ['method', 'Method'], ['path', 'Path'], ['status_code', 'Status'], ['latency_ms', 'ms'], ['ip', 'IP']],
    webhooks: [['created_at', 'Time'], ['user', 'User'], ['event', 'Event'], ['status_code', 'HTTP'], ['error', 'Error'], ['attempts', 'Attempts']],
    audit: [['created_at', 'Time'], ['user', 'User'], ['action', 'Action'], ['target', 'Target'], ['ip', 'IP']] }[tab]
  return (<Page title="Logs" actions={['api', 'webhooks', 'audit'].map((x) => <button key={x} className={tab === x ? 'btn-primary' : 'btn-ghost'} onClick={() => { setTab(x); setPage(1) }}>{x}</button>)}>
    <Err e={error} />{loading ? <Skeleton /> : (<><Table head={cols.map((c) => c[1])}>{data.items.map((r) => <tr key={r.id}>{cols.map(([k]) => <td key={k} className="td text-xs">{k === 'created_at' ? when(r[k]) : String(r[k] ?? '—')}</td>)}</tr>)}</Table>
      <Pager total={data.total} page={page} setPage={setPage} size={50} /></>)}</Page>)
}

const GROUPS = [['Domain & hosting', [['site_url', 'Main Website URL', 'https://logen-khpay.onrender.com'], ['api_base_url', 'API Base URL', 'https://api.logenkhpay.com'], ['checkout_base_url', 'Checkout Base URL', 'https://pay.logenkhpay.com'], ['webhook_base_url', 'Webhook Base URL', ''], ['allowed_origins', 'Allowed CORS origins (comma separated)', 'https://app.example.com']]],
  ['Payment provider', [['provider_base_url', 'Provider base URL', 'https://khqrpay.site'], ['provider_check_url', 'Provider status-check URL ({ref} {order_id} {transaction_id})', 'https://khqrpay.site/…/{ref}'], ['provider_check_method', 'Status-check method (GET/POST)', 'GET'], ['test_amount', 'Test Connection amount', '0.01'], ['qr_ttl_minutes', 'QR lifetime (minutes)', '10']]],
  ['Limits', [['rate_limit_per_min', 'Rate limit per API key / minute', '60']]]]

export function AdminSettings() {
  const { data, error, loading, reload } = useLoad(() => get(`${A}/settings`)); const [v, setV] = useState(null); const [msg, setMsg] = useState(null); const [err, setErr] = useState(null)
  useEffect(() => { if (data) setV(data.values) }, [data])
  if (loading || !v) return <Skeleton />
  const save = async () => { setErr(null); setMsg(null); try { await put(`${A}/settings`, v); setMsg('Saved'); reload() } catch (e) { setErr(e) } }
  const sys = data.system
  return (<Page title="System Settings" actions={<button className="btn-primary" onClick={save}>Save</button>}>
    <Err e={err || error} />{msg && <div className="text-sm text-emerald-600">{msg}</div>}
    <div className="card"><h3 className="mb-2 font-semibold">Setup checklist</h3><div className="grid gap-2 text-sm sm:grid-cols-2">{[['Encryption key (FERNET_KEY)', sys.fernet_configured], ['HTTPS site URL', sys.https], ['Provider status-check URL', sys.provider_check_configured], ['Google login', sys.google_configured], ['GitHub login', sys.github_configured], ['Telegram login', sys.telegram_configured], ['SMTP (password reset emails)', sys.smtp_configured]].map(([l, ok]) => <div key={l} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">{l}<Badge v={ok ? 'ok' : 'failed'}>{ok ? 'ready' : 'missing'}</Badge></div>)}</div></div>
    <div className="card flex items-center justify-between"><div><b>Maintenance mode</b><div className="text-xs text-slate-500">Blocks payment creation (API + dashboard). Health, login and admin keep working.</div></div><Toggle on={v.maintenance_mode === '1'} onChange={(on) => setV({ ...v, maintenance_mode: on ? '1' : '0' })} /></div>
    {GROUPS.map(([title, fields]) => <div key={title} className="card space-y-3"><h3 className="font-semibold">{title}</h3>{fields.map(([k, label, ph]) => <Field key={k} label={label}><input className="input" value={v[k] ?? ''} placeholder={ph} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>)}</div>)}
  </Page>)
}
