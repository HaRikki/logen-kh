import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle2, Clock, XCircle, Smartphone } from 'lucide-react'
import { get } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { Logo, Spinner, money } from '../lib/ui'
import { LangTheme } from './Layout'

export default function Checkout() {
  const { orderId } = useParams(); const { t } = useI18n(); const [p, setP] = useState(null); const [err, setErr] = useState(null); const [left, setLeft] = useState(0); const timer = useRef()
  useEffect(() => {
    let stop = false
    const tick = async () => {
      try { const d = await get(`/api/public/pay/${orderId}`); if (stop) return; setP(d); setErr(null); if (d.status !== 'pending') return }
      catch (e) { if (e.status === 404) { setErr('Payment not found'); return } }
      timer.current = setTimeout(tick, 3000)
    }
    tick(); return () => { stop = true; clearTimeout(timer.current) }
  }, [orderId])
  useEffect(() => { if (!p) return; const i = setInterval(() => setLeft(Math.max(0, Math.floor((new Date(p.expires_at.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(p.expires_at) ? p.expires_at : p.expires_at + 'Z') - Date.now()) / 1000))), 500); return () => clearInterval(i) }, [p])
  const locallyExpired = p?.status === 'pending' && left === 0 && p.verification
  const st = p?.status === 'pending' && !locallyExpired ? 'pending' : p?.status === 'paid' ? 'paid' : 'expired'
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-navy-950 to-navy-800 p-4">
      <div className="absolute right-4 top-4"><LangTheme /></div>
      <div className="card fade-up w-full max-w-sm text-center">
        <div className="mb-3 flex justify-center text-xl"><Logo /></div>
        {err ? <p className="py-8 text-red-500">{err}</p> : !p ? <div className="grid place-items-center py-10"><Spinner /></div> : (<>
          <div className="text-sm text-slate-500">{p.merchant_name}</div>
          <div className="my-1 text-3xl font-extrabold">{money(p.amount, p.currency)}</div>
          <div className="mb-3 font-mono text-[11px] text-slate-500">{t('Order ID')}: {p.order_id}</div>
          {st === 'pending' && (<>
            <div className="mx-auto w-fit rounded-2xl bg-white p-3 ring-1 ring-slate-200">{p.qr_image ? <img src={p.qr_image} alt="KHQR" width={220} height={220} /> : <QRCodeSVG value={p.qr || ''} size={220} />}</div>
            <div className="mt-3 flex items-center justify-center gap-2 text-sm"><Clock size={16} className="text-sea" />{t('Time left')}: <b className="font-mono">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</b></div>
            <div className="mt-1 text-sm text-slate-500">{t('Waiting for payment...')}</div>
            {p.verification === false && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Status cannot be verified right now{p.verification_reason === 'provider_check_not_configured' ? ' (provider check not configured)' : ''}.</div>}
            {p.deeplink && <a className="btn-primary mt-4 w-full" href={/android/i.test(navigator.userAgent) && p.deeplink_android ? p.deeplink_android : p.deeplink}><Smartphone size={16} />{t('Open ABA Mobile')}</a>}</>)}
          {st === 'paid' && <div className="py-6"><CheckCircle2 className="mx-auto text-emerald-500" size={64} /><div className="mt-2 text-lg font-bold text-emerald-600">{t('Payment Successful')}</div></div>}
          {st === 'expired' && <div className="py-6"><XCircle className="mx-auto text-slate-400" size={64} /><div className="mt-2 text-lg font-bold">{t('Payment Expired')}</div><p className="mt-1 text-sm text-slate-500">Please request a new QR from the merchant.</p></div>}
        </>)}
      </div>
    </div>)
}
