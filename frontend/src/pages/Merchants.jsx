import { useState } from 'react'
import { Plus, Pencil, Trash2, PlugZap } from 'lucide-react'
import { get, post, patch, del, D } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { Page, Table, Badge, Modal, Field, Err, Skeleton, Empty, Toggle, useLoad, when } from '../lib/ui'

function Manager({ kind, title, fields, cols, note }) {
  const { t } = useI18n(); const { data, error, loading, reload } = useLoad(() => get(`${D}/${kind}`), [kind])
  const [edit, setEdit] = useState(null); const [f, setF] = useState({}); const [err, setErr] = useState(null); const [busy, setBusy] = useState(null)
  const open = (m) => { setErr(null); setEdit(m || {}); setF(m ? { ...m, provider_key: '' } : {}) }
  const save = async () => { try { const body = { ...f }; if (!body.provider_key) delete body.provider_key
    edit.id ? await patch(`${D}/${kind}/${edit.id}`, body) : await post(`${D}/${kind}`, body); setEdit(null); reload() } catch (e) { setErr(e) } }
  const test = async (m) => { setBusy(m.id); try { await post(`${D}/${kind}/${m.id}/test`) } catch (e) { setErr(e) } setBusy(null); reload() }
  const toggle = async (m, v) => { await patch(`${D}/${kind}/${m.id}`, { ...m, enabled: v }); reload() }
  return (
    <Page title={title} actions={<button className="btn-primary" onClick={() => open()}><Plus size={16} />{t('Add')}</button>}>
      <div className="card text-sm text-slate-600 dark:text-slate-300">{note}</div>
      <Err e={err || error} />
      {loading ? <Skeleton /> : !data?.length ? <Empty>Nothing connected yet.</Empty> : (
        <Table head={[...cols.map((c) => c[1]), 'Provider key', 'Connection', t('Enabled'), t('Actions')]}>
          {data.map((m) => (<tr key={m.id}>{cols.map(([k]) => <td key={k} className="td font-medium">{m[k]}</td>)}
            <td className="td font-mono text-xs">{m.key_hint}</td>
            <td className="td"><Badge v={m.connection_status} />{m.last_test_error && <div className="max-w-[180px] truncate text-xs text-red-500" title={m.last_test_error}>{m.last_test_error}</div>}<div className="text-[10px] text-slate-500">{m.last_tested_at && when(m.last_tested_at)}</div></td>
            <td className="td"><Toggle on={m.enabled} onChange={(v) => toggle(m, v)} /></td>
            <td className="td"><div className="flex gap-1"><button className="btn-ghost !p-2" title={t('Test Connection')} disabled={busy === m.id} onClick={() => confirm('Test Connection asks the provider for one small test QR. Continue?') && test(m)}><PlugZap size={14} /></button>
              <button className="btn-ghost !p-2" onClick={() => open(m)}><Pencil size={14} /></button>
              <button className="btn-ghost !p-2 text-red-500" onClick={async () => { if (confirm('Delete and remove the stored provider key?')) { await del(`${D}/${kind}/${m.id}`); reload() } }}><Trash2 size={14} /></button></div></td></tr>))}
        </Table>)}
      {edit && <Modal title={edit.id ? t('Edit') : t('Add')} onClose={() => setEdit(null)}><div className="space-y-3">
        <Err e={err} />
        {fields.map(([k, label, ph]) => <Field key={k} label={label}><input className="input" value={f[k] || ''} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
        <Field label="Provider API Key" hint="Stored encrypted on the server and never shown again. Leave empty to keep the current key."><input className="input font-mono" type="password" autoComplete="off" value={f.provider_key || ''} onChange={(e) => setF({ ...f, provider_key: e.target.value })} /></Field>
        <button className="btn-primary w-full" onClick={save}>{t('Save')}</button></div></Modal>}
    </Page>)
}

export const Aba = () => <Manager kind="aba" title="ABA Merchant"
  note="Your ABA static payment link lives inside the provider API key (khqrpay.site). Paste the provider key that belongs to your ABA merchant. Logen KHPay cannot create provider keys from an ABA link."
  cols={[['name', 'Merchant name'], ['aba_link', 'ABA link']]} fields={[['name', 'Merchant name', 'My Shop'], ['aba_link', 'ABA link (optional note)', 'https://pay.ababank.com/…']]} />
export const Bakong = () => <Manager kind="bakong" title="Bakong Settings"
  note="Bakong ID and account name are bound to the provider API key at khqrpay.site. Enter them here for your own reference and paste the matching provider key."
  cols={[['account_name', 'Account name'], ['bakong_id', 'Bakong ID']]} fields={[['bakong_id', 'Bakong ID', 'name@bank'], ['account_name', 'Account name', 'My Shop']]} />
