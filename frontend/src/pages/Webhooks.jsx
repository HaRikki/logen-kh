import { useState } from 'react'
import { Plus, Trash2, Send, RotateCw, KeyRound } from 'lucide-react'
import { get, post, patch, del, D } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { Page, Table, Badge, Modal, Field, Err, Skeleton, Empty, Toggle, CopyBtn, useLoad, when } from '../lib/ui'

const EV = ['payment.pending', 'payment.paid', 'payment.expired']
export default function Webhooks() {
  const { t } = useI18n(); const hooks = useLoad(() => get(`${D}/webhooks`)); const logs = useLoad(() => get(`${D}/webhooks/deliveries`))
  const [open, setOpen] = useState(false); const [f, setF] = useState({ url: '', events: EV }); const [secret, setSecret] = useState(null); const [err, setErr] = useState(null); const [msg, setMsg] = useState(null)
  const all = () => { hooks.reload(); logs.reload() }
  const add = async () => { try { setSecret(await post(`${D}/webhooks`, f)); setOpen(false); setF({ url: '', events: EV }); all() } catch (e) { setErr(e) } }
  const run = async (fn) => { setErr(null); try { await fn() } catch (e) { setErr(e) } all() }
  return (
    <Page title={t('Webhooks')} actions={<button className="btn-primary" onClick={() => { setErr(null); setOpen(true) }}><Plus size={16} />{t('Add')}</button>}>
      <div className="card text-sm">Events are sent only after Logen KHPay has confirmed the status with the provider. Each request carries <code>X-KHPay-Signature</code> = HMAC-SHA256(secret, <code>timestamp + "." + body</code>) and <code>X-KHPay-Timestamp</code>. See the docs for verification code.</div>
      <Err e={err || hooks.error} />{msg && <div className="text-sm">{msg}</div>}
      {hooks.loading ? <Skeleton /> : !hooks.data?.length ? <Empty>No webhooks yet.</Empty> : (
        <Table head={['URL', 'Events', t('Enabled'), t('Actions')]}>
          {hooks.data.map((w) => (<tr key={w.id}><td className="td break-all font-mono text-xs">{w.url}</td><td className="td text-xs">{w.events.join(', ')}</td>
            <td className="td"><Toggle on={w.enabled} onChange={(v) => run(() => patch(`${D}/webhooks/${w.id}`, { url: w.url, events: w.events, enabled: v }))} /></td>
            <td className="td"><div className="flex gap-1">
              <button className="btn-ghost !p-2" title="Send test" onClick={() => run(async () => { const r = await post(`${D}/webhooks/${w.id}/test`); setMsg(r.ok ? `Test OK (HTTP ${r.status_code})` : `Test failed: ${r.error || r.status_code}`) })}><Send size={14} /></button>
              <button className="btn-ghost !p-2" title="Rotate secret" onClick={() => confirm('Rotate the signing secret?') && run(async () => setSecret(await post(`${D}/webhooks/${w.id}/rotate-secret`)))}><KeyRound size={14} /></button>
              <button className="btn-ghost !p-2 text-red-500" onClick={() => confirm('Delete webhook?') && run(() => del(`${D}/webhooks/${w.id}`))}><Trash2 size={14} /></button></div></td></tr>))}
        </Table>)}
      <h2 className="pt-2 font-semibold">Webhook logs</h2>
      {!logs.data?.length ? <Empty>No deliveries yet.</Empty> : (
        <Table head={['Time', 'Event', 'Result', 'Attempts', 'Next retry', '']}>
          {logs.data.map((d) => (<tr key={d.id}><td className="td text-xs">{when(d.created_at)}</td><td className="td text-xs">{d.event}</td>
            <td className="td"><Badge v={d.ok ? 'ok' : d.next_retry_at ? 'pending' : 'failed'}>{d.ok ? `HTTP ${d.status_code}` : d.error || 'failed'}</Badge></td><td className="td">{d.attempts}</td><td className="td text-xs">{when(d.next_retry_at)}</td>
            <td className="td">{!d.ok && <button className="btn-ghost !p-2" title="Retry now" onClick={() => run(() => post(`${D}/webhooks/deliveries/${d.id}/retry`))}><RotateCw size={14} /></button>}</td></tr>))}
        </Table>)}
      {open && <Modal title="Add webhook" onClose={() => setOpen(false)}><div className="space-y-3"><Err e={err} />
        <Field label="HTTPS URL"><input className="input" placeholder="https://example.com/khpay-webhook" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
        <div>{EV.map((x) => <label key={x} className="mr-3 block text-sm sm:inline"><input type="checkbox" className="mr-1" checked={f.events.includes(x)} onChange={(e) => setF({ ...f, events: e.target.checked ? [...f.events, x] : f.events.filter((y) => y !== x) })} />{x}</label>)}</div>
        <button className="btn-primary w-full" disabled={!f.url || !f.events.length} onClick={add}>{t('Save')}</button></div></Modal>}
      {secret && <Modal title="Signing secret" onClose={() => setSecret(null)}><p className="mb-2 text-sm text-amber-600 dark:text-amber-300">{secret.notice}</p>
        <div className="break-all rounded-xl bg-navy-950 p-3 font-mono text-sm text-emerald-300">{secret.secret}</div><div className="mt-3 flex justify-end gap-2"><CopyBtn text={secret.secret} /><button className="btn-primary" onClick={() => setSecret(null)}>Done</button></div></Modal>}
    </Page>)
}
