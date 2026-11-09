import { useState } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, KeyRound, Landmark, Wallet, QrCode, History, Webhook, BookOpen, Activity, Settings as Cog, Menu, Moon, Sun, LogOut, Shield, Users, Server, ScrollText, Store, CreditCard, Globe2 } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { useAuth } from '../lib/auth'
import { Logo } from '../lib/ui'

export const LangTheme = () => {
  const { lang, setLang, dark, setDark } = useI18n()
  return (<div className="flex items-center gap-1">
    <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setLang(lang === 'en' ? 'km' : 'en')}><Globe2 size={14} />{lang === 'en' ? 'ខ្មែរ' : 'EN'}</button>
    <button className="btn-ghost !px-2.5 !py-1.5" aria-label="theme" onClick={() => setDark(!dark)}>{dark ? <Sun size={14} /> : <Moon size={14} />}</button></div>)
}

const USER_NAV = [['/dashboard', 'Overview', LayoutDashboard, true], ['/dashboard/keys', 'API Keys', KeyRound], ['/dashboard/aba', 'ABA Merchant', Landmark],
  ['/dashboard/bakong', 'Bakong Settings', Wallet], ['/dashboard/create', 'Create Payment', QrCode], ['/dashboard/payments', 'Payment History', History],
  ['/dashboard/webhooks', 'Webhooks', Webhook], ['/dashboard/docs', 'API Documentation', BookOpen], ['/dashboard/usage', 'API Usage', Activity], ['/dashboard/settings', 'Profile & Settings', Cog]]
const ADMIN_NAV = [['/admin', 'Overview', LayoutDashboard, true], ['/admin/users', 'Users', Users], ['/admin/keys', 'API Keys', KeyRound], ['/admin/merchants', 'ABA Merchant', Store],
  ['/admin/payments', 'Payment History', CreditCard], ['/admin/logs', 'Logs', ScrollText], ['/admin/settings', 'Settings', Server]]

export default function Layout({ admin }) {
  const { t } = useI18n(); const { user, logout } = useAuth(); const [open, setOpen] = useState(false); const loc = useLocation()
  const nav = admin ? ADMIN_NAV : USER_NAV
  const Side = (
    <aside className="flex h-full w-64 flex-col bg-navy-900 text-slate-300">
      <div className="flex h-16 items-center px-5 text-white"><Link to="/dashboard"><Logo /></Link></div>
      {admin && <div className="mx-4 mb-2 rounded-lg bg-sea/20 px-3 py-1 text-xs font-semibold text-sea-400">ADMIN</div>}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {nav.map(([to, label, I, end]) => (
          <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition duration-200 ${isActive ? 'bg-gradient-to-r from-sea to-sea-600 text-white shadow-lg shadow-sea/25' : 'hover:translate-x-0.5 hover:bg-white/5'}`}>
            <I size={18} />{t(label)}</NavLink>))}
      </nav>
      <div className="border-t border-white/10 p-3 space-y-2">
        {user?.is_admin && <Link to={admin ? '/dashboard' : '/admin'} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-white/5"><Shield size={18} />{admin ? 'User Dashboard' : t('Admin Panel')}</Link>}
        <div className="flex items-center gap-3 px-3 py-1">
          {user?.avatar_url ? <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" /> : <div className="grid h-8 w-8 place-items-center rounded-full bg-sea text-sm font-bold text-white">{(user?.display_name || user?.email || '?')[0].toUpperCase()}</div>}
          <div className="min-w-0 flex-1"><div className="truncate text-sm text-white">{user?.display_name || user?.email}</div><div className="truncate text-xs text-slate-400">{user?.email}</div></div>
          <button onClick={logout} title={t('Logout')} className="rounded-lg p-2 hover:bg-white/10"><LogOut size={16} /></button>
        </div>
      </div>
    </aside>)
  return (
    <div className="flex min-h-screen">
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">{Side}</div>
      {open && <div className="fixed inset-0 z-40 flex lg:hidden"><div className="h-full">{Side}</div><div className="flex-1 bg-black/60" onClick={() => setOpen(false)} /></div>}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur-sm dark:border-white/10 dark:bg-navy-950/90">
          <button className="btn-ghost !px-2.5 lg:hidden" onClick={() => setOpen(true)}><Menu size={18} /></button>
          <div className="hidden text-sm text-slate-500 lg:block">{t('Welcome back')}, <b className="text-slate-800 dark:text-white">{user?.display_name || user?.email}</b></div>
          <LangTheme />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6"><div key={loc.pathname}><Outlet /></div></main>
      </div>
    </div>)
}
