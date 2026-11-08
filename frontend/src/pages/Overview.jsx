import { Link } from 'react-router-dom'
import { CreditCard, CheckCircle2, Clock, XCircle, Coins, Activity, KeyRound, AlertTriangle } from 'lucide-react'
import { get, D } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { Page, Stat, Spinner, Err, Bars, money, useLoad } from '../lib/ui'

export default function Overview() {
  const { t } = useI18n(); const { data: d, error, loading } = useLoad(() => get(`${D}/overview`))
  if (loading) return <Spinner />
  if (error) return <Err e={error} />
  const todo = []
  if (!d.has_aba && !d.has_bakong) todo.push(['Connect a merchant (ABA or Bakong)', '/dashboard/aba'])
  if (!d.active_keys) todo.push(['Create your first API key', '/dashboard/keys'])
  return (
    <Page title={t('Overview')}>
      {todo.length > 0 && <div className="card border-sea/40 bg-sea/5"><b>Getting started</b><ul className="mt-2 space-y-1 text-sm">{todo.map(([l, to]) => <li key={to}>→ <Link className="text-sea hover:underline" to={to}>{l}</Link></li>)}</ul></div>}
      {!d.provider_check_configured && <div className="card flex gap-3 border-amber-400/40 bg-amber-50 text-sm dark:bg-amber-500/10"><AlertTriangle className="shrink-0 text-amber-500" size={18} />Payment verification is not configured yet: the admin must set the provider status-check URL (Admin → Settings). Until then payments stay Pending.</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={CreditCard} label="Total Payments" value={d.total} />
        <Stat icon={CheckCircle2} label="Successful Payments" value={d.paid} />
        <Stat icon={Clock} label="Pending Payments" value={d.pending} />
        <Stat icon={XCircle} label="Expired Payments" value={d.expired} />
        <Stat icon={Coins} label="Total Payment Amount" value={money(d.paid_amount)} sub="paid only" />
        <Stat icon={Activity} label="Total API Requests" value={d.api_requests} />
        <Stat icon={KeyRound} label="Active API Keys" value={d.active_keys} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card"><h3 className="mb-3 font-semibold">Payments (14 days)</h3><Bars data={d.payments_series} label="per day" /></div>
        <div className="card"><h3 className="mb-3 font-semibold">API requests (14 days)</h3><Bars data={d.requests_series} label="per day" /></div>
      </div>
    </Page>)
}
