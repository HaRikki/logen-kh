import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Loader2, X } from 'lucide-react'
import { useI18n } from './i18n'

export const Logo = ({ size = 32 }) => (
  <span className="inline-flex items-center gap-2 font-bold tracking-tight">
    <svg width={size} height={size} viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#087FA5" /><path d="M18 14h8v28h20v8H18z" fill="#fff" /><rect x="34" y="14" width="12" height="12" rx="2" fill="#0a1628" /></svg>
    <span>Logen <span className="text-sea-400">KHPay</span></span>
  </span>
)
export const Spinner = () => <Loader2 className="h-5 w-5 animate-spin text-sea" />
export const Page = ({ title, actions, children }) => (
  <div className="fade-up space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-bold md:text-2xl">{title}</h1><div className="flex gap-2">{actions}</div></div>
    {children}
  </div>
)
const tone = { paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', untested: 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300',
  expired: 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300', failed: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  revoked: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', suspended: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' }
export const Badge = ({ v, children }) => { const { t } = useI18n(); return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${tone[v] || tone.untested}`}>{t(children ?? v)}</span> }
export const Stat = ({ icon: I, label, value, sub }) => { const { t } = useI18n(); return (
  <div className="card"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t(label)}</span>{I && <span className="rounded-lg bg-sea/10 p-2 text-sea"><I size={16} /></span>}</div>
    <div className="mt-2 text-2xl font-bold">{value}</div>{sub && <div className="text-xs text-slate-500">{sub}</div>}</div>) }
export const Empty = ({ children }) => <div className="py-10 text-center text-sm text-slate-500">{children}</div>
export const Err = ({ e }) => e ? <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{e.message || String(e)}</div> : null
export const Table = ({ head, children }) => (
  <div className="card overflow-x-auto p-0"><table className="w-full min-w-[640px]"><thead className="border-b border-slate-200 dark:border-white/10"><tr>{head.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
    <tbody className="divide-y divide-slate-100 dark:divide-white/5">{children}</tbody></table></div>)
export const money = (n, c = 'USD') => `${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`
export const when = (d) => d ? new Date(d.endsWith?.('Z') || /[+-]\d\d:?\d\d$/.test(d) ? d : d + 'Z').toLocaleString() : '—'

export function Modal({ title, onClose, children }) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="card fade-up w-full max-w-lg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">{title}</h3><button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-white/10"><X size={18} /></button></div>
        {children}
      </div>
    </div>)
}
export function CopyBtn({ text, label = true }) {
  const { t } = useI18n(); const [ok, setOk] = useState(false)
  return <button type="button" className="btn-ghost !px-2.5 !py-1 text-xs" onClick={async () => { try { await navigator.clipboard.writeText(text) } catch { const a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove() } setOk(true); setTimeout(() => setOk(false), 1500) }}>
    {ok ? <Check size={14} /> : <Copy size={14} />}{label && (ok ? t('Copied') : t('Copy'))}</button>
}
export function Code({ children, lang }) {
  return <div className="relative rounded-xl bg-navy-950 text-slate-200 ring-1 ring-white/10"><div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-xs text-slate-400"><span>{lang}</span><CopyBtn text={children} /></div>
    <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">{children}</pre></div>
}
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null); const [error, setError] = useState(null); const [loading, setLoading] = useState(true)
  const run = useCallback(async () => { setLoading(true); try { setData(await fn()); setError(null) } catch (e) { setError(e) } finally { setLoading(false) } }, deps) // eslint-disable-line
  useEffect(() => { run() }, [run])
  return { data, error, loading, reload: run, setData }
}
export function Bars({ data, label }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (<div><div className="flex h-28 items-end gap-1">{data.map((d) => <div key={d.date} title={`${d.date}: ${d.count}`} className="group flex-1"><div className="w-full rounded-t bg-sea/70 transition group-hover:bg-sea" style={{ height: `${Math.max(3, (d.count / max) * 100)}%` }} /></div>)}</div>
    <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>{data[0]?.date.slice(5)}</span><span>{label}</span><span>{data[data.length - 1]?.date.slice(5)}</span></div></div>)
}
export function Field({ label, children, hint }) { const { t } = useI18n(); return <label className="block"><span className="label">{t(label)}</span>{children}{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label> }
export function Toggle({ on, onChange }) { return <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-sea' : 'bg-slate-300 dark:bg-white/20'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${on ? 'left-5' : 'left-0.5'}`} /></button> }
export function Pager({ total, page, setPage, size = 25 }) {
  const pages = Math.max(1, Math.ceil(total / size)); if (pages <= 1) return null
  return <div className="flex items-center justify-end gap-2 text-sm"><button className="btn-ghost !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span>{page} / {pages}</span><button className="btn-ghost !py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button></div>
}
