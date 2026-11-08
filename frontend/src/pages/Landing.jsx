import { Link } from 'react-router-dom'
import { ShieldCheck, Zap, Webhook, KeyRound, QrCode, Code2 } from 'lucide-react'
import { Logo } from '../lib/ui'
import { LangTheme } from './Layout'
import { useAuth } from '../lib/auth'

const F = [[QrCode, 'ABA PayWay & Bakong KHQR', 'Generate KHQR, checkout pages and ABA deep links from one API.'], [KeyRound, 'Personal API keys', 'Create, revoke and rotate your own sk_live_ keys. Secrets are stored hashed.'],
  [ShieldCheck, 'Verified payments', 'Status always comes from the provider, never from a browser redirect.'], [Webhook, 'Signed webhooks', 'HMAC-SHA256 signed events with logs and retries.'],
  [Zap, 'Multi-user', 'Each user brings their own merchant. Data is isolated per account.'], [Code2, 'Developer friendly', 'REST + cURL / Python / JavaScript examples.']]

export default function Landing() {
  const { user } = useAuth()
  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-5"><Logo /><div className="flex items-center gap-2"><Link to="/docs" className="btn-ghost !border-white/20 !text-white">Docs</Link><LangTheme />
        <Link to={user ? '/dashboard' : '/login'} className="btn-primary">{user ? 'Dashboard' : 'Login'}</Link></div></header>
      <section className="mx-auto max-w-4xl px-5 py-20 text-center fade-up">
        <span className="rounded-full border border-sea/40 bg-sea/10 px-4 py-1 text-xs font-semibold text-sea-400">Public KHQR Payment API</span>
        <h1 className="mt-6 text-4xl font-extrabold leading-tight md:text-6xl">Accept <span className="text-sea-400">ABA &amp; Bakong</span> payments with one API</h1>
        <p className="mx-auto mt-5 max-w-2xl text-slate-300">Connect your own merchant, create your own API key and use it in websites, Telegram bots and apps.</p>
        <div className="mt-8 flex justify-center gap-3"><Link to="/register" className="btn-primary !px-6 !py-3">Get started</Link><Link to="/docs" className="btn-ghost !border-white/20 !px-6 !py-3 !text-white">API documentation</Link></div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {F.map(([I, h, p]) => <div key={h} className="rounded-2xl border border-white/10 bg-white/5 p-6"><I className="text-sea-400" /><h3 className="mt-3 font-semibold">{h}</h3><p className="mt-1 text-sm text-slate-400">{p}</p></div>)}
      </section>
    </div>)
}
