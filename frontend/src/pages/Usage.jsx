import { get, D } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { Page, Table, Badge, Stat, Bars, Skeleton, Err, Empty, useLoad, when } from '../lib/ui'
import { Activity } from 'lucide-react'

export default function Usage() {
  const { t } = useI18n(); const { data: d, error, loading } = useLoad(() => get(`${D}/usage`))
  if (loading) return <Skeleton />
  if (error) return <Err e={error} />
  return (
    <Page title={t('API Usage')}>
      <div className="grid gap-4 lg:grid-cols-3"><Stat icon={Activity} label="Total API Requests" value={d.total} /><div className="card lg:col-span-2"><Bars data={d.series} label="requests / day" /></div></div>
      <h2 className="font-semibold">By key</h2>
      <Table head={['Name', 'Key', 'Requests', 'Last used', 'Status']}>{d.keys.map((k) => <tr key={k.id}><td className="td">{k.name}</td><td className="td font-mono text-xs">{k.prefix}…</td><td className="td">{k.request_count}</td><td className="td text-xs">{when(k.last_used_at)}</td><td className="td"><Badge v={k.revoked ? 'revoked' : 'active'} /></td></tr>)}</Table>
      <h2 className="font-semibold">Recent requests</h2>
      {!d.recent.length ? <Empty>No requests yet.</Empty> : <Table head={['Time', 'Method', 'Path', 'Status', 'ms', 'IP']}>{d.recent.map((l, i) => <tr key={i}><td className="td text-xs">{when(l.created_at)}</td><td className="td">{l.method}</td><td className="td font-mono text-xs">{l.path}</td><td className="td"><Badge v={l.status_code < 400 ? 'ok' : 'failed'}>{String(l.status_code)}</Badge></td><td className="td">{l.latency_ms}</td><td className="td text-xs">{l.ip}</td></tr>)}</Table>}
    </Page>)
}
