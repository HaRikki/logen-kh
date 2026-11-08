import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { Spinner } from './lib/ui'
import Layout from './pages/Layout'
import Landing from './pages/Landing'
import { Login, Register, Forgot, Reset } from './pages/AuthPages'
import Overview from './pages/Overview'
import ApiKeys from './pages/ApiKeys'
import { Aba, Bakong } from './pages/Merchants'
import { CreatePayment, Payments } from './pages/PaymentsPages'
import Webhooks from './pages/Webhooks'
import Docs from './pages/Docs'
import Usage from './pages/Usage'
import Settings from './pages/Settings'
import Checkout from './pages/Checkout'
import { AdminOverview, AdminUsers, AdminKeys, AdminMerchants, AdminPayments, AdminLogs, AdminSettings } from './pages/Admin'

function Guard({ admin, children }) {
  const { user } = useAuth(); const loc = useLocation()
  if (user === undefined) return <div className="grid h-screen place-items-center"><Spinner /></div>
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (admin && !user.is_admin) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
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
  )
}
