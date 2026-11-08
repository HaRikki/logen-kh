import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Github, Send } from 'lucide-react'
import { get, post } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { Logo, Err, Field } from '../lib/ui'
import { LangTheme } from './Layout'

const ERR = { oauth_failed: 'Social login failed. Please try again.', provider_not_configured: 'This login method is not configured yet.', telegram_verification_failed: 'Telegram verification failed.',
  account_suspended: 'Your account is suspended.', login_required: 'Please log in first.', social_already_linked: 'That social account is linked to another user.' }

export function TelegramButton({ mode = 'login', bot }) {
  useEffect(() => {
    const host = document.getElementById('tg-host'); if (!host || !bot) return
    host.innerHTML = ''
    const s = document.createElement('script'); s.async = true; s.src = 'https://telegram.org/js/telegram-widget.js?22'
    s.setAttribute('data-telegram-login', bot); s.setAttribute('data-size', 'large'); s.setAttribute('data-radius', '12')
    s.setAttribute('data-auth-url', `${location.origin}/auth/telegram/callback${mode === 'connect' ? '?mode=connect' : ''}`); s.setAttribute('data-request-access', 'write')
    host.appendChild(s)
  }, [bot, mode])
  return <div id="tg-host" className="flex min-h-[40px] justify-center" />
}

export function Social({ mode = 'login' }) {
  const { t } = useI18n(); const [cfg, setCfg] = useState(null)
  useEffect(() => { get('/auth/config').then(setCfg).catch(() => setCfg({})) }, [])
  if (!cfg) return null
  const none = !cfg.google && !cfg.github && !cfg.telegram
  return (<div className="space-y-2">
    <div className="my-4 flex items-center gap-3 text-xs text-slate-500"><div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />{t('or')}<div className="h-px flex-1 bg-slate-200 dark:bg-white/10" /></div>
    {cfg.google && <a className="btn-ghost w-full" href={`/auth/google/start?mode=${mode}`}><svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" /><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 010-9.4l-7.9-6.1a24 24 0 000 21.6l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>{t('Sign in with')} Google</a>}
    {cfg.github && <a className="btn-ghost w-full" href={`/auth/github/start?mode=${mode}`}><Github size={16} />{t('Sign in with')} GitHub</a>}
    {cfg.telegram && <><div className="flex items-center justify-center gap-2 text-xs text-slate-500"><Send size={12} />Telegram</div><TelegramButton bot={cfg.telegram_bot} mode={mode} /></>}
    {none && <p className="text-center text-xs text-slate-500">Google / GitHub / Telegram login are enabled by the admin (see README).</p>}
  </div>)
}

function Shell({ title, children }) {
  return (<div className="grid min-h-screen place-items-center bg-gradient-to-br from-navy-950 to-navy-800 p-4">
    <div className="absolute right-4 top-4"><LangTheme /></div>
    <div className="w-full max-w-md fade-up"><div className="mb-6 flex justify-center text-2xl text-white"><Link to="/"><Logo size={40} /></Link></div>
      <div className="card"><h1 className="mb-4 text-xl font-bold">{title}</h1>{children}</div></div></div>)
}

function CredForm({ mode }) {
  const { t } = useI18n(); const nav = useNavigate(); const { setUser } = useAuth(); const [sp] = useSearchParams()
  const [f, setF] = useState({ email: '', password: '', remember: true }); const [err, setErr] = useState(sp.get('error') ? { message: ERR[sp.get('error')] || sp.get('error') } : null); const [busy, setBusy] = useState(false)
  const submit = async (e) => { e.preventDefault(); setBusy(true); setErr(null)
    try { setUser(await post(`/auth/${mode}`, f)); nav('/dashboard') } catch (x) { setErr(x) } finally { setBusy(false) } }
  return (<form onSubmit={submit} className="space-y-3">
    <Err e={err} />
    <Field label="Email"><input className="input" type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
    <Field label="Password"><input className="input" type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
    <div className="flex items-center justify-between text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={f.remember} onChange={(e) => setF({ ...f, remember: e.target.checked })} />{t('Remember me')}</label>
      {mode === 'login' && <Link className="text-sea hover:underline" to="/forgot-password">{t('Forgot password?')}</Link>}</div>
    <button className="btn-primary w-full" disabled={busy}>{mode === 'login' ? t('Login') : t('Create account')}</button>
    <Social />
    <p className="pt-2 text-center text-sm text-slate-500">{mode === 'login' ? <>No account? <Link className="text-sea" to="/register">{t('Register')}</Link></> : <>Have an account? <Link className="text-sea" to="/login">{t('Login')}</Link></>}</p>
  </form>)
}
export const Login = () => { const { t } = useI18n(); return <Shell title={t('Login')}><CredForm mode="login" /></Shell> }
export const Register = () => { const { t } = useI18n(); return <Shell title={t('Register')}><CredForm mode="register" /></Shell> }

export function Forgot() {
  const [email, setEmail] = useState(''); const [done, setDone] = useState(false); const [err, setErr] = useState(null)
  return (<Shell title="Forgot password"><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); try { await post('/auth/forgot-password', { email }); setDone(true) } catch (x) { setErr(x) } }}>
    <Err e={err} />{done ? <p className="text-sm">If that email exists, a reset link has been sent.</p> : <><Field label="Email"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field><button className="btn-primary w-full">Send reset link</button></>}
    <Link className="block text-center text-sm text-sea" to="/login">Back to login</Link></form></Shell>)
}
export function Reset() {
  const [sp] = useSearchParams(); const nav = useNavigate(); const [pw, setPw] = useState(''); const [err, setErr] = useState(null)
  return (<Shell title="Reset password"><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); try { await post('/auth/reset-password', { token: sp.get('token') || '', new_password: pw }); nav('/login') } catch (x) { setErr(x) } }}>
    <Err e={err} /><Field label="New password"><input className="input" type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /></Field><button className="btn-primary w-full">Set password</button></form></Shell>)
}
