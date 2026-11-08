import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { get, post, D } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { Page, Table, Badge, Field, Err, Spinner, Empty, CopyBtn, Pager, useLoad, money, when } from '../lib/ui'

export function CreatePayment() {
  const { t } = useI18n(); const [f, setF] = useState({ kind: 'aba', amount: '', reference: '' }); const [r, setR] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false)
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(null); setR(null)
    try { setR(await post(`${D}/payments`, { kind: f.kind, amount: Number(f.amount), reference: f.reference || null })) } catch (x) { setErr(x) } finally { setBusy(false) } }
  return (
    <Page title={t('Create Payment')}>
      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={go} className="card space-y-3"><Err e={err} />
          <Field label="Method"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="aba">ABA PayWay KHQR</option><option value="bakong">Bakong KHQR</option></select></Field>
          <Field label="Amount"><input className="input" type="number" step="0.01" min="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Reference (optional)"><input className="input" maxLength={120} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
          <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : t('Create Payment')}</button></form>
        {r && <div className="card space-y-3 text-center"><div className="text-lg font-bold">{money(r.amount, r.currency)}</div>
          <div className="mx-auto w-fit rounded-xl bg-white p-3">{r.qr_image ? <img src={r.qr_image} alt="QR" width={200} /> : <QRCodeSVG value={r.qr} size={200} />}</div>
          <div className="break-all font-mono text-xs">{r.checkout_url}</div>
          <div className="flex justify-center gap-2"><CopyBtn text={r.checkout_url} /><a className="btn-ghost" href={r.checkout_url} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open</a></div>
          <div className="text-xs text-slate-500">Order {r.order_id} · expires {when(r.expires_at)}</div></div>}
      </div>
    </Page>)
}

export function Payments() {
  const { t } = useI18n(); const [status, setStatus] = useState(''); const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useLoad(() => get(`${D}/payments?page=${page}${status ? `&status=${status}` : ''}`), [status, page])
  const refresh = async (id) => { try { await post(`${D}/payments/${id}/refresh`) } catch { /* shown on reload */ } reload() }
  return (
    <Page title={t('Payment History')} actions={<select className="input !w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}><option value="">All</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="expired">Expired</option></select>}>
      <Err e={error} />
      {loading ? <Spinner /> : !data?.items.length ? <Empty>No payments yet. <Link className="text-sea" to="/dashboard/create">Create one</Link>.</Empty> : (<>
        <Table head={['Order ID', 'Type', t('Merchant'), t('Amount'), t('Status'), 'Transaction', t('Created'), 'Expires', '']}>
          {data.items.map((p) => (<tr key={p.order_id}><td className="td font-mono text-xs"><a className="text-sea" href={p.checkout_url} target="_blank" rel="noreferrer">{p.order_id}</a></td><td className="td uppercase">{p.type}</td><td className="td">{p.merchant_name}</td>
            <td className="td font-semibold">{money(p.amount, p.currency)}</td><td className="td"><Badge v={p.status} /></td><td className="td font-mono text-xs">{p.transaction_id || '—'}</td>
            <td className="td text-xs">{when(p.created_at)}</td><td className="td text-xs">{when(p.expires_at)}</td>
            <td className="td">{p.status === 'pending' && <button className="btn-ghost !p-2" title="Check now" onClick={() => refresh(p.order_id)}><RefreshCw size={14} /></button>}</td></tr>))}
        </Table><Pager total={data.total} page={page} setPage={setPage} /></>)}
    </Page>)
}
