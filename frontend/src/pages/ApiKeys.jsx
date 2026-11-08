import { useState } from 'react'
import { Plus, RefreshCw, Ban, Trash2, KeyRound } from 'lucide-react'
import { get, post, del, D } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { Page, Table, Badge, Modal, Field, CopyBtn, Err, Spinner, Empty, useLoad, when } from '../lib/ui'

export default function ApiKeys() {
  const { t } = useI18n(); const { data, error, loading, reload } = useLoad(() => get(`${D}/keys`))
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [perms, setPerms] = useState(['payments:create', 'payments:read'])
  const [secret, setSecret] = useState(null); const [err, setErr] = useState(null)
  const act = async (fn) => { setErr(null); try { await fn(); reload() } catch (e) { setErr(e) } }
  const create = async () => { try { const r = await post(`${D}/keys`, { name, permissions: perms }); setSecret(r); setOpen(false); setName(''); reload() } catch (e) { setErr(e) } }
  return (
    <Page title={t('API Keys')} actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />{t('Create API Key')}</button>}>
      <p className="text-sm text-slate-500">These are Logen KHPay platform keys (<code>sk_live_…</code>), not ABA/Bakong official keys. Use them in the <code>Authorization: Bearer</code> header.</p>
      <Err e={err || error} />
      {loading ? <Spinner /> : !data?.length ? <Empty><KeyRound className="mx-auto mb-2" />No API keys yet.</Empty> : (
        <Table head={['Name', 'Key', 'Permissions', 'Requests', 'Last used', 'Created', 'Status', t('Actions')]}>
          {data.map((k) => (<tr key={k.id}><td className="td font-medium">{k.name}</td><td className="td font-mono text-xs">{k.prefix}…</td>
            <td className="td text-xs">{k.permissions.join(', ')}</td><td className="td">{k.request_count}</td><td className="td text-xs">{when(k.last_used_at)}</td><td className="td text-xs">{when(k.created_at)}</td>
            <td className="td"><Badge v={k.revoked ? 'revoked' : 'active'} /></td>
            <td className="td"><div className="flex gap-1">
              {!k.revoked && <button title="Regenerate" className="btn-ghost !p-2" onClick={() => confirm('Regenerate? The old key stops working immediately.') && act(async () => setSecret(await post(`${D}/keys/${k.id}/regenerate`)))}><RefreshCw size={14} /></button>}
              {!k.revoked && <button title={t('Revoke')} className="btn-ghost !p-2" onClick={() => act(() => post(`${D}/keys/${k.id}/revoke`))}><Ban size={14} /></button>}
              <button title={t('Delete')} className="btn-ghost !p-2 text-red-500" onClick={() => confirm('Delete this key permanently?') && act(() => del(`${D}/keys/${k.id}`))}><Trash2 size={14} /></button></div></td></tr>))}
        </Table>)}
      {open && <Modal title={t('Create API Key')} onClose={() => setOpen(false)}><div className="space-y-3">
        <Field label="Name"><input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Telegram bot" /></Field>
        <div><span className="label">Permissions</span>{['payments:create', 'payments:read'].map((p) => <label key={p} className="mr-4 text-sm"><input type="checkbox" className="mr-1" checked={perms.includes(p)} onChange={(e) => setPerms(e.target.checked ? [...perms, p] : perms.filter((x) => x !== p))} />{p}</label>)}</div>
        <button className="btn-primary w-full" disabled={!name.trim() || !perms.length} onClick={create}>{t('Create API Key')}</button></div></Modal>}
      {secret && <Modal title="Your new API key" onClose={() => setSecret(null)}><div className="space-y-3">
        <p className="text-sm text-amber-600 dark:text-amber-300">{secret.notice}</p>
        <div className="break-all rounded-xl bg-navy-950 p-3 font-mono text-sm text-emerald-300">{secret.secret}</div>
        <div className="flex justify-end gap-2"><CopyBtn text={secret.secret} /><button className="btn-primary" onClick={() => setSecret(null)}>I saved it</button></div></div></Modal>}
    </Page>)
}
