import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { Spinner, Skeleton } from './lib/ui'
import { lazy, Suspense } from 'react'
import Layout from './pages/Layout'
import Landing from './pages/Landing'
import { Login, AdminLogin, Register, Forgot, Reset } from './pages/AuthPages'

// Everything behind login is code-split so the first paint (landing / login) stays small and fast.
const L = (load, name) => lazy(() => load().then((m) => ({ default: name ? m[name] : m.default })))
const Overview = L(() => import('./pages/Overview'))
const ApiKeys = L(() => import('./pages/ApiKeys'))
const Aba = L(() => import('./pages/Merchants'), 'Aba')
const Bakong = L(() => import('./pages/Merchants'), 'Bakong')
const CreatePayment = L(() => import('./pages/PaymentsPages'), 'CreatePayment')
const Payments = L(() => import('./pages/PaymentsPages'), 'Payments')
const Webhooks = L(() => import('./pages/Webhooks'))
const Docs = L(() => import('./pages/Docs'))
const Usage = L(() => import('./pages/Usage'))
const Settings = L(() => import('./pages/Settings'))
const Checkout = L(() => import('./pages/Checkout'))
const AdminOverview = L(() => import('./pages/Admin'), 'AdminOverview')
const AdminUsers = L(() => import('./pages/Admin'), 'AdminUsers')
const AdminKeys = L(() => import('./pages/Admin'), 'AdminKeys')
const AdminMerchants = L(() => import('./pages/Admin'), 'AdminMerchants')
const AdminPayments = L(() => import('./pages/Admin'), 'AdminPayments')
const AdminLogs = L(() => import('./pages/Admin'), 'AdminLogs')
const AdminSettings = L(() => import('./pages/Admin'), 'AdminSettings')

function Guard({ admin, children }) {
  const { user } = useAuth(); const loc = useLocation()
  if (user === undefined) return <div className="grid h-screen place-items-center"><Spinner /></div>
  if (!user) return <Navigate to={admin ? '/admin/login' : '/login'} state={{ from: loc.pathname }} replace />
  if (admin && !user.is_admin) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <Suspense fallback={<div className="p-6"><Skeleton /></div>}>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<Forgot />} />
      <Route path="/reset-password" element={<Reset />} />
      <Route path="/pay/:orderId" element={<Checkout />} />
      <Route path="/docs" element={<Docs standalone />} />
      <Route path="/dashboard" element={<Guard><Layout /></Guard>}>
        <Route index element={<Overview />} />
        <Route path="keys" element={<ApiKeys />} />
        <Route path="aba" element={<Aba />} />
        <Route path="bakong" element={<Bakong />} />
        <Route path="create" element={<CreatePayment />} />
        <Route path="payments" element={<Payments />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="docs" element={<Docs />} />
        <Route path="usage" element={<Usage />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="/admin" element={<Guard admin><Layout admin /></Guard>}>
        <Route index element={<AdminOverview />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="keys" element={<AdminKeys />} />
        <Route path="merchants" element={<AdminMerchants />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
