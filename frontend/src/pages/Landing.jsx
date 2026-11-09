import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
const QRCodeSVG = lazy(() => import('qrcode.react').then((m) => ({ default: m.QRCodeSVG })))   // loaded after first paint
import { ShieldCheck, Zap, Webhook, KeyRound, QrCode, Code2, ArrowRight, CheckCircle2, Users, Clock, Lock, Smartphone } from 'lucide-react'
import { Logo, Reveal, CopyBtn } from '../lib/ui'
import { LangTheme } from './Layout'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'

const COPY = {
  en: {
    badge: 'Public KHQR Payment API', h1a: 'Accept', h1b: 'ABA & Bakong', h1c: 'payments with one API',
    sub: 'Connect your own merchant, create your own API key and use it in websites, Telegram bots and apps. Hosted checkout and signed webhooks included.',
    start: 'Get started free', docs: 'API documentation', login: 'Login', dash: 'Dashboard',
    stepsT: 'Live in three steps', stepsS: 'From sign-up to your first QR in a few minutes.',
    steps: [['Create an account', 'Sign up with email, Google, GitHub or Telegram.'], ['Connect your merchant', 'Add your ABA or Bakong provider key. It is stored encrypted.'], ['Call the API', 'Create an sk_live_ key and generate KHQR payments.']],
    featT: 'Built for developers', featS: 'Everything you need to take KHQR payments, nothing you have to trust blindly.',
    codeT: 'One request. One QR.', ctaT: 'Ready to accept payments?', ctaS: 'Create your free account and make your first KHQR in minutes.',
  },
  km: {
    badge: 'Public KHQR Payment API', h1a: 'ទទួលការទូទាត់', h1b: 'ABA & Bakong', h1c: 'ដោយ API តែមួយ',
    sub: 'ភ្ជាប់ Merchant ផ្ទាល់ខ្លួន បង្កើត API Key ផ្ទាល់ខ្លួន ហើយប្រើក្នុង Website, Telegram Bot និង Application។ មាន Checkout Page និង Webhook ដែលមានហត្ថលេខា។',
    start: 'ចាប់ផ្ដើមឥឡូវនេះ', docs: 'ឯកសារ API', login: 'ចូលគណនី', dash: 'ផ្ទាំងគ្រប់គ្រង',
    stepsT: 'ដំណើរការក្នុង ៣ ជំហាន', stepsS: 'ពីការចុះឈ្មោះដល់ QR ដំបូងរបស់អ្នក ក្នុងប៉ុន្មាននាទី។',
    steps: [['បង្កើតគណនី', 'ចុះឈ្មោះដោយ Email, Google, GitHub ឬ Telegram។'], ['ភ្ជាប់ Merchant', 'បញ្ចូល Provider Key របស់ ABA ឬ Bakong ដែលត្រូវបាន Encrypt។'], ['ហៅ API', 'បង្កើត sk_live_ Key ហើយបង្កើតការទូទាត់ KHQR។']],
    featT: 'សាងសង់សម្រាប់អ្នកអភិវឌ្ឍន៍', featS: 'អ្វីៗដែលអ្នកត្រូវការដើម្បីទទួលការទូទាត់ KHQR។',
    codeT: 'សំណើមួយ។ QR មួយ។', ctaT: 'ត្រៀមខ្លួនទទួលការទូទាត់ហើយឬនៅ?', ctaS: 'បង្កើតគណនីឥតគិតថ្លៃ ហើយបង្កើត KHQR ដំបូងរបស់អ្នកក្នុងប៉ុន្មាននាទី។',
  },
}
const FEATS = [
  [QrCode, 'ABA PayWay & Bakong KHQR', 'Generate KHQR, hosted checkout pages and ABA deep links from one API.'],
  [KeyRound, 'Personal API keys', 'Create, revoke and rotate your own sk_live_ keys. Secrets are stored hashed.'],
  [ShieldCheck, 'Verified payments', 'Status always comes from the provider, never from a browser redirect.'],
  [Webhook, 'Signed webhooks', 'HMAC-SHA256 signatures, delivery logs and automatic retries.'],
  [Users, 'Multi-user isolation', 'Every user brings their own merchant. Data never mixes between accounts.'],
  [Code2, 'Developer friendly', 'Clean REST + cURL, Python and JavaScript examples.'],
]
const SNIPPETS = {
  cURL: `curl -X POST https://YOUR-DOMAIN/api/v1/aba/create \\
  -H "Authorization: Bearer sk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"amount": 5}'`,
  Python: `import requests

r = requests.post(
    "https://YOUR-DOMAIN/api/v1/aba/create",
    headers={"Authorization": "Bearer sk_live_YOUR_KEY"},
    json={"amount": 5},
)
print(r.json()["data"]["checkout_url"])`,
  JavaScript: `const r = await fetch("https://YOUR-DOMAIN/api/v1/aba/create", {
  method: "POST",
  headers: { Authorization: "Bearer sk_live_YOUR_KEY",
             "Content-Type": "application/json" },
  body: JSON.stringify({ amount: 5 }),
});
console.log((await r.json()).data.checkout_url);`,
}

function PhoneMock() {
  const [s, setS] = useState(599)
  useEffect(() => { const i = setInterval(() => setS((v) => (v <= 0 ? 599 : v - 1)), 1000); return () => clearInterval(i) }, [])
  return (
    <div className="relative mx-auto w-[290px] animate-float">
      <div className="halo absolute -inset-10" />
      <div className="relative rounded-[2.2rem] border border-white/15 bg-gradient-to-b from-white/15 to-white/5 p-3 shadow-2xl shadow-sea/20">
        <div className="rounded-[1.7rem] bg-white p-5 text-center text-slate-800">
          <Logo size={22} />
          <div className="mt-3 text-xs text-slate-500">My Coffee Shop</div>
          <div className="text-3xl font-extrabold">5.00 <span className="text-base font-semibold text-slate-400">USD</span></div>
          <div className="mx-auto mt-3 w-fit rounded-2xl bg-white p-2 ring-1 ring-slate-200"><Suspense fallback={<div className="skeleton h-[150px] w-[150px]" />}><QRCodeSVG value="https://logen-khpay.example/pay/demo" size={150} fgColor="#0a1628" /></Suspense></div>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500"><Clock size={13} className="text-sea" />{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</div>
          <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-sea py-2.5 text-sm font-semibold text-white"><Smartphone size={15} />Open ABA Mobile</div>
        </div>
      </div>
      <div className="absolute -right-8 top-24 hidden items-center gap-2 rounded-2xl border border-white/10 bg-navy-800/90 px-3 py-2 text-xs shadow-xl sm:flex"><CheckCircle2 size={16} className="text-emerald-400" /><div><div className="font-semibold text-white">payment.paid</div><div className="text-slate-400">verified by provider</div></div></div>
    </div>)
}

export default function Landing() {
  const { user } = useAuth(); const { lang } = useI18n(); const c = COPY[lang] || COPY.en
  const [tab, setTab] = useState('cURL'); const [stuck, setStuck] = useState(false)
  useEffect(() => { const h = () => setStuck((v) => { const n = window.scrollY > 12; return n === v ? v : n }); h(); window.addEventListener('scroll', h, { passive: true }); return () => window.removeEventListener('scroll', h) }, [])
  return (
    <div className="bg-navy-950 text-white">
      <header className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${stuck ? 'border-b border-white/10 bg-navy-950/95' : ''}`}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to="/"><Logo /></Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex"><a href="#how" className="hover:text-white">How it works</a><a href="#features" className="hover:text-white">Features</a><a href="#code" className="hover:text-white">Code</a><Link to="/docs" className="hover:text-white">Docs</Link></nav>
          <div className="flex items-center gap-2"><LangTheme /><Link to={user ? '/dashboard' : '/login'} className="btn-ghost !border-white/20 !text-white hover:!bg-white/10">{user ? c.dash : c.login}</Link>
            {!user && <Link to="/register" className="btn-primary hidden sm:inline-flex">{c.start}</Link>}</div>
        </div>
      </header>

      <section className="hero-bg relative overflow-hidden pt-28">
        <div className="grid-bg absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-24 lg:grid-cols-[1.15fr_1fr]">
          <div className="fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-sea/40 bg-sea/10 px-4 py-1.5 text-xs font-semibold text-sea-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{c.badge}</span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">{c.h1a} <span className="grad-text">{c.h1b}</span> {c.h1c}</h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">{c.sub}</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link to={user ? '/dashboard' : '/register'} className="btn-primary !px-6 !py-3.5 !text-base">{user ? c.dash : c.start}<ArrowRight size={18} /></Link>
              <Link to="/docs" className="btn-ghost !border-white/20 !px-6 !py-3.5 !text-base !text-white hover:!bg-white/10">{c.docs}</Link></div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">{['ABA PayWay', 'Bakong', 'Telegram bots', 'Webhooks'].map((x) => <span key={x} className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-sea-400" />{x}</span>)}</div>
          </div>
          <div className="pb-6 lg:pb-0"><PhoneMock /></div>
        </div>
      </section>

      <section className="cv-auto border-y border-white/10 bg-navy-900/60">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-8 text-center md:grid-cols-4">
          {[[Clock, '10 min', 'QR lifetime'], [Lock, 'AES-based', 'encrypted provider keys'], [ShieldCheck, 'HMAC-SHA256', 'signed webhooks'], [Zap, 'REST + JSON', 'simple integration']].map(([I, a, b]) => (
            <Reveal key={a}><I className="mx-auto mb-2 text-sea-400" size={20} /><div className="text-xl font-bold">{a}</div><div className="text-xs text-slate-400">{b}</div></Reveal>))}
        </div>
      </section>

      <section id="how" className="cv-auto mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
        <Reveal className="mx-auto max-w-2xl text-center"><h2 className="text-3xl font-extrabold md:text-4xl">{c.stepsT}</h2><p className="mt-3 text-slate-400">{c.stepsS}</p></Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {c.steps.map(([h, p], i) => <Reveal key={h} delay={i * 90}><div className="glass relative h-full rounded-2xl p-6 transition duration-300 hover:-translate-y-1 hover:border-sea/40">
            <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-sea to-sea-400 text-lg font-extrabold shadow-lg shadow-sea/30">{i + 1}</div><h3 className="text-lg font-semibold">{h}</h3><p className="mt-1 text-sm text-slate-400">{p}</p></div></Reveal>)}
        </div>
      </section>

      <section id="features" className="cv-auto scroll-mt-20 bg-navy-900/50 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center"><h2 className="text-3xl font-extrabold md:text-4xl">{c.featT}</h2><p className="mt-3 text-slate-400">{c.featS}</p></Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATS.map(([I, h, p], i) => <Reveal key={h} delay={(i % 3) * 80}><div className="glass group h-full rounded-2xl p-6 transition duration-300 hover:-translate-y-1 hover:border-sea/40 hover:bg-white/[.08]">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-sea/15 text-sea-400 transition group-hover:bg-sea group-hover:text-white"><I size={20} /></span><h3 className="mt-4 font-semibold">{h}</h3><p className="mt-1 text-sm text-slate-400">{p}</p></div></Reveal>)}
          </div>
        </div>
      </section>

      <section id="code" className="cv-auto mx-auto grid max-w-6xl scroll-mt-20 items-center gap-10 px-5 py-24 lg:grid-cols-2">
        <Reveal><h2 className="text-3xl font-extrabold md:text-4xl">{c.codeT}</h2><p className="mt-3 text-slate-400">Send an amount, get back a QR, a hosted checkout URL and an ABA deep link. We verify the payment with the provider and call your webhook.</p>
          <Link to="/docs" className="mt-6 inline-flex items-center gap-2 font-semibold text-sea-400 hover:underline">Read the docs <ArrowRight size={16} /></Link></Reveal>
        <Reveal delay={100}><div className="overflow-hidden rounded-2xl border border-white/10 bg-navy-950 shadow-2xl shadow-sea/10">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2"><div className="flex gap-1">{Object.keys(SNIPPETS).map((k) => <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${tab === k ? 'bg-sea text-white' : 'text-slate-400 hover:text-white'}`}>{k}</button>)}</div><CopyBtn text={SNIPPETS[tab]} /></div>
          <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-slate-200">{SNIPPETS[tab]}</pre></div></Reveal>
      </section>

      <section className="px-5 pb-24"><Reveal><div className="hero-bg relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-white/10 p-10 text-center md:p-14">
        <div className="grid-bg absolute inset-0" /><div className="relative"><h2 className="text-3xl font-extrabold md:text-4xl">{c.ctaT}</h2><p className="mx-auto mt-3 max-w-xl text-slate-300">{c.ctaS}</p>
          <Link to={user ? '/dashboard' : '/register'} className="btn-primary mt-8 !px-8 !py-3.5 !text-base">{user ? c.dash : c.start}<ArrowRight size={18} /></Link></div></div></Reveal></section>

      <footer className="cv-auto border-t border-white/10 py-8"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 text-sm text-slate-500"><Logo size={22} /><div className="flex gap-5"><Link to="/docs" className="hover:text-white">Docs</Link><Link to="/login" className="hover:text-white">Login</Link><Link to="/register" className="hover:text-white">Register</Link></div><span>© Logen KHPay</span></div></footer>
    </div>)
}
