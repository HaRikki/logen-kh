import { useEffect, useState } from 'react'
import { Github, Send } from 'lucide-react'
import { get, post, patch, del } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { Page, Field, Err, Badge } from '../lib/ui'
import { TelegramButton } from './AuthPages'
import { useSearchParams } from 'react-router-dom'

export default function Settings() {
  const { t } = useI18n(); const { user, setUser, refresh } = useAuth(); const [sp] = useSearchParams()
  const [name, setName] = useState(user.display_name || ''); const [pw, setPw] = useState({ current_password: '', new_password: '' })
  const [cfg, setCfg] = useState({}); const [msg, setMsg] = useState(sp.get('connected') ? `${sp.get('connected')} connected` : null); const [err, setErr] = useState(sp.get('error') ? { message: sp.get('error') } : null)
  useEffect(() => { get('/auth/config').then(setCfg) }, [])
  const run = async (fn, ok) => { setErr(null); setMsg(null); try { await fn(); setMsg(ok); refresh() } catch (e) { setErr(e) } }
  const linked = (p) => user.socials.find((s) => s.provider === p)
  const Row = ({ p, icon: I, label, enabled }) => { const l = linked(p); return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-white/10"><div className="flex items-center gap-3"><I size={18} /><div><div className="text-sm font-medium">{label}</div><div className="text-xs text-slate-500">{l ? `@${l.username || l.provider}` : 'Not connected'}</div></div></div>
      {l ? <button className="btn-ghost" onClick={() => run(() => del(`/auth/social/${p}`), `${label} disconnected`)}>{t('Disconnect')}</button> : enabled ? (p === 'telegram' ? <TelegramButton bot={cfg.telegram_bot} mode="connect" /> : <a className="btn-primary" href={`/auth/${p}/start?mode=connect`}>{t('Connect')}</a>) : <Badge v="untested">not configured</Badge>}</div>) }
  return (
    <Page title={t('Profile & Settings')}>
      <Err e={err} />{msg && <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{msg}</div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card space-y-3"><h3 className="font-semibold">Profile</h3>
          <div className="flex items-center gap-3">{user.avatar_url && <img src={user.avatar_url} className="h-14 w-14 rounded-full" alt="" referrerPolicy="no-referrer" />}<div className="text-sm text-slate-500">{user.email || 'No email on this account'}</div></div>
          <Field label="Display name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <button className="btn-primary" onClick={() => run(async () => setUser(await patch('/auth/profile', { display_name: name })), 'Saved')}>{t('Save')}</button></div>
        <div className="card space-y-3"><h3 className="font-semibold">{t('Change password')}</h3>
          {user.has_password && <Field label="Current password"><input className="input" type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>}
          <Field label="New password"><input className="input" type="password" minLength={8} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
          <button className="btn-primary" onClick={() => run(() => post('/auth/change-password', pw), 'Password updated. Other sessions were signed out.')}>{t('Save')}</button></div>
        <div className="card space-y-3 lg:col-span-2"><h3 className="font-semibold">{t('Connected accounts')}</h3>
          <Row p="google" icon={() => <span className="text-base font-bold">G</span>} label="Google" enabled={cfg.google} /><Row p="github" icon={Github} label="GitHub" enabled={cfg.github} /><Row p="telegram" icon={Send} label="Telegram" enabled={cfg.telegram} /></div>
      </div>
    </Page>)
}
