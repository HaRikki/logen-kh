import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Github, Send, Eye, EyeOff, User, Mail, Lock, ShieldCheck, Zap, KeyRound, CheckCircle2, Loader2 } from 'lucide-react'
import { get, post } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { Logo, Err } from '../lib/ui'
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
  if (!cfg || (!cfg.google && !cfg.github && !cfg.telegram)) return null
  return (<div className="space-y-2">
    <div className="my-4 flex items-center gap-3 text-xs text-slate-500"><div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />{t('or')}<div className="h-px flex-1 bg-slate-200 dark:bg-white/10" /></div>
    <div className="grid gap-2 sm:grid-cols-2">
      {cfg.google && <a className="btn-ghost" href={`/auth/google/start?mode=${mode}`}><svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" /><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 010-9.4l-7.9-6.1a24 24 0 000 21.6l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>Google</a>}
      {cfg.github && <a className="btn-ghost" href={`/auth/github/start?mode=${mode}`}><Github size={16} />GitHub</a>}</div>
    {cfg.telegram && <div className="pt-1"><div className="mb-1 flex items-center justify-center gap-2 text-xs text-slate-500"><Send size={12} />Telegram</div><TelegramButton bot={cfg.telegram_bot} mode={mode} /></div>}
  </div>)
}

/* ---------- split-screen shell ---------- */
const POINTS = [[ShieldCheck, 'Payments verified by the provider', 'Never trusts a browser redirect.'], [KeyRound, 'Your own API keys', 'Hashed, shown once, revoke instantly.'], [Zap, 'ABA PayWay & Bakong KHQR', 'One API, hosted checkout, webhooks.']]
function Shell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="hero-bg relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="grid-bg absolute inset-0" />
        <div className="absolute -left-24 top-1/3 h-72 w-72 animate-drift rounded-full bg-sea/30 blur-3xl" />
        <Link to="/" className="relative text-xl"><Logo size={36} /></Link>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight">Accept <span className="grad-text">KHQR</span> payments in minutes.</h2>
          <ul className="mt-8 space-y-5">{POINTS.map(([I, h, p]) => <li key={h} className="flex gap-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-sea-400 ring-1 ring-white/10"><I size={18} /></span><div><div className="font-semibold">{h}</div><div className="text-sm text-slate-400">{p}</div></div></li>)}</ul>
        </div>
        <div className="relative text-xs text-slate-500">© Logen KHPay · Cambodia</div>
      </aside>
      <main className="relative flex items-center justify-center bg-slate-50 p-5 dark:bg-navy-950 sm:p-10">
        <div className="absolute right-4 top-4"><LangTheme /></div>
        <div className="fade-up w-full max-w-md">
          <Link to="/" className="mb-8 flex justify-center text-xl lg:hidden"><Logo size={36} /></Link>
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mb-6 mt-1 text-sm text-slate-500">{subtitle}</p>}
          <div className={subtitle ? '' : 'mt-6'}>{children}</div>
        </div>
      </main>
    </div>)
}

/* ---------- inputs ---------- */
function Input({ icon: I, label, type = 'text', value, onChange, error, right, ...rest }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="relative block">
        {I && <I size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />}
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={`input ${I ? '!pl-10' : ''} ${right ? '!pr-11' : ''} ${error ? '!border-red-400 focus:!ring-red-200' : ''}`} {...rest} />
        {right}
      </span>
      {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
    </label>)
}
function PasswordInput({ label, value, onChange, error, ...rest }) {
  const [show, setShow] = useState(false)
  return <Input icon={Lock} label={label} type={show ? 'text' : 'password'} value={value} onChange={onChange} error={error} {...rest}
    right={<button type="button" tabIndex={-1} aria-label="toggle password" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-sea">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>} />
}
function Strength({ pw }) {
  const score = useMemo(() => { let s = 0; if (pw.length >= 8) s++; if (pw.length >= 12) s++; if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++; if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++; return s }, [pw])
  if (!pw) return null
  const label = ['Weak', 'Weak', 'Fair', 'Good', 'Strong'][score], color = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-sea', 'bg-emerald-500'][score]
  return <div className="-mt-1"><div className="flex gap-1">{[1, 2, 3, 4].map((i) => <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= score ? color : 'bg-slate-200 dark:bg-white/10'}`} />)}</div><div className="mt-1 text-right text-[11px] text-slate-500">{label}</div></div>
}

/* ---------- forms ---------- */
const UNAME = /^[A-Za-z0-9_.]{3,30}$/
function CredForm({ mode, admin }) {
  const { t } = useI18n(); const nav = useNavigate(); const { setUser } = useAuth(); const [sp] = useSearchParams()
  const reg = mode === 'register'
  const [f, setF] = useState({ username: '', email: '', password: '', confirm_password: '', remember: true })
  const [err, setErr] = useState(sp.get('error') ? { message: ERR[sp.get('error')] || sp.get('error') } : null); const [busy, setBusy] = useState(false); const [touched, setTouched] = useState({})
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }))
  const bad = {
    username: reg && f.username && !UNAME.test(f.username) ? '3–30 characters: letters, numbers, _ or .' : null,
    email: reg && f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email) ? 'Enter a valid email address' : null,
    password: reg && f.password && f.password.length < 8 ? 'At least 8 characters' : null,
    confirm_password: reg && touched.confirm_password && f.confirm_password && f.confirm_password !== f.password ? 'Passwords do not match' : null,
  }
  const matched = reg && f.confirm_password && f.confirm_password === f.password
  const ready = reg ? UNAME.test(f.username) && !bad.email && f.email && f.password.length >= 8 && matched : f.email && f.password
  const submit = async (e) => {
    e.preventDefault(); if (!ready) return; setBusy(true); setErr(null)
    try {
      const body = reg ? f : { email: f.email, password: f.password, remember: f.remember }
      const u = await post(`/auth/${mode}`, body); setUser(u); nav(admin && u.is_admin ? '/admin' : '/dashboard')
    } catch (x) { setErr(x) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Err e={err} />
      {reg && <Input icon={User} label="Username" value={f.username} onChange={set('username')} error={bad.username} autoComplete="username" placeholder="yourname" maxLength={30} required />}
      <Input icon={reg ? Mail : User} label={reg ? 'Email' : 'Email or username'} type={reg ? 'email' : 'text'} value={f.email} onChange={set('email')} error={bad.email}
        autoComplete={reg ? 'email' : 'username'} placeholder={reg ? 'you@example.com' : 'admin1 or you@example.com'} required />
      <PasswordInput label="Password" value={f.password} onChange={set('password')} error={bad.password} autoComplete={reg ? 'new-password' : 'current-password'} required />
      {reg && <Strength pw={f.password} />}
      {reg && <PasswordInput label="Confirm password" value={f.confirm_password} onChange={set('confirm_password')} error={bad.confirm_password}
        onBlur={() => setTouched({ ...touched, confirm_password: true })} autoComplete="new-password" required />}
      {reg && matched && <div className="-mt-2 flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 size={13} />Passwords match</div>}
      {!reg && <div className="flex items-center justify-between text-sm"><label className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#087FA5]" checked={f.remember} onChange={(e) => set('remember')(e.target.checked)} />{t('Remember me')}</label>
        {!admin && <Link className="font-medium text-sea hover:underline" to="/forgot-password">{t('Forgot password?')}</Link>}</div>}
      <button className="btn-primary w-full !py-3" disabled={busy || !ready}>{busy && <Loader2 size={16} className="animate-spin" />}{reg ? t('Create account') : t('Login')}</button>
      {!admin && <Social />}
      {!admin && <p className="pt-1 text-center text-sm text-slate-500">{reg ? <>Already have an account? <Link className="font-semibold text-sea" to="/login">{t('Login')}</Link></> : <>New here? <Link className="font-semibold text-sea" to="/register">{t('Create account')}</Link></>}</p>}
    </form>)
}
export const Login = () => { const { t } = useI18n(); return <Shell title={t('Welcome back')} subtitle="Sign in to your Logen KHPay dashboard."><CredForm mode="login" /></Shell> }
export const AdminLogin = () => <Shell title="Admin login" subtitle="Restricted area. Sign in with your admin username."><CredForm mode="login" admin /></Shell>
export const Register = () => <Shell title="Create your account" subtitle="Start accepting KHQR payments with your own API key."><CredForm mode="register" /></Shell>

export function Forgot() {
  const [email, setEmail] = useState(''); const [done, setDone] = useState(false); const [err, setErr] = useState(null)
  return (<Shell title="Forgot password" subtitle="We will email you a reset link."><form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); try { await post('/auth/forgot-password', { email }); setDone(true) } catch (x) { setErr(x) } }}>
    <Err e={err} />{done ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">If that email exists, a reset link has been sent.</p> : <><Input icon={Mail} label="Email" type="email" required value={email} onChange={setEmail} /><button className="btn-primary w-full !py-3">Send reset link</button></>}
    <Link className="block text-center text-sm text-sea" to="/login">Back to login</Link></form></Shell>)
}
export function Reset() {
  const [sp] = useSearchParams(); const nav = useNavigate(); const [pw, setPw] = useState(''); const [err, setErr] = useState(null)
  return (<Shell title="Reset password"><form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); try { await post('/auth/reset-password', { token: sp.get('token') || '', new_password: pw }); nav('/login') } catch (x) { setErr(x) } }}>
    <Err e={err} /><PasswordInput label="New password" minLength={8} required value={pw} onChange={setPw} /><Strength pw={pw} /><button className="btn-primary w-full !py-3">Set password</button></form></Shell>)
}
