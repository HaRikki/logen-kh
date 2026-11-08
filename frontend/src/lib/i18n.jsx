import { createContext, useContext, useEffect, useState } from 'react'

const km = {
  'Overview': 'ទិដ្ឋភាពទូទៅ', 'API Keys': 'API Keys', 'ABA Merchant': 'ABA Merchant', 'Bakong Settings': 'ការកំណត់ Bakong',
  'Create Payment': 'បង្កើតការទូទាត់', 'Payment History': 'ប្រវត្តិទូទាត់', 'Webhooks': 'Webhooks', 'API Documentation': 'ឯកសារ API',
  'API Usage': 'ការប្រើ API', 'Profile & Settings': 'ប្រវត្តិរូប និងការកំណត់', 'Admin Panel': 'ផ្ទាំង Admin',
  'Login': 'ចូលគណនី', 'Register': 'ចុះឈ្មោះ', 'Logout': 'ចាកចេញ', 'Email': 'អ៊ីមែល', 'Password': 'ពាក្យសម្ងាត់',
  'Forgot password?': 'ភ្លេចពាក្យសម្ងាត់?', 'Remember me': 'ចងចាំខ្ញុំ', 'Create account': 'បង្កើតគណនី',
  'Total Payments': 'ការទូទាត់សរុប', 'Successful Payments': 'ទូទាត់ជោគជ័យ', 'Pending Payments': 'កំពុងរង់ចាំ',
  'Expired Payments': 'ផុតកំណត់', 'Total Payment Amount': 'ចំនួនទឹកប្រាក់សរុប', 'Total API Requests': 'សំណើ API សរុប',
  'Active API Keys': 'API Keys សកម្ម', 'Create API Key': 'បង្កើត API Key', 'Revoke': 'ដកហូត', 'Delete': 'លុប', 'Save': 'រក្សាទុក',
  'Cancel': 'បោះបង់', 'Add': 'បន្ថែម', 'Edit': 'កែប្រែ', 'Test Connection': 'សាកល្បងការតភ្ជាប់', 'Name': 'ឈ្មោះ',
  'Status': 'ស្ថានភាព', 'Amount': 'ចំនួន', 'Created': 'បង្កើតនៅ', 'Actions': 'សកម្មភាព', 'Copy': 'ចម្លង', 'Copied': 'បានចម្លង',
  'Pending': 'រង់ចាំ', 'Paid': 'បានទូទាត់', 'Expired': 'ផុតកំណត់', 'Waiting for payment...': 'កំពុងរង់ចាំការទូទាត់...',
  'Payment Successful': 'ទូទាត់ជោគជ័យ', 'Payment Expired': 'ការទូទាត់ផុតកំណត់', 'Open ABA Mobile': 'បើក ABA Mobile',
  'Time left': 'ពេលវេលានៅសល់', 'Order ID': 'លេខកូដបញ្ជា', 'Merchant': 'អ្នកលក់', 'Generate new QR': 'បង្កើត QR ថ្មី',
  'Sign in with': 'ចូលដោយប្រើ', 'or': 'ឬ', 'Users': 'អ្នកប្រើប្រាស់', 'Settings': 'ការកំណត់', 'Logs': 'កំណត់ហេតុ',
  'Welcome back': 'សូមស្វាគមន៍ត្រឡប់មកវិញ', 'Enabled': 'បើក', 'Disabled': 'បិទ', 'Change password': 'ប្តូរពាក្យសម្ងាត់',
  'Connected accounts': 'គណនីដែលបានភ្ជាប់', 'Connect': 'ភ្ជាប់', 'Disconnect': 'ផ្តាច់',
}
const Ctx = createContext(null)
export function I18nProvider({ children }) {
  const [lang, setLang] = useState(localStorage.getItem('lang') || 'en')
  const [dark, setDark] = useState((localStorage.getItem('theme') || 'dark') === 'dark')
  useEffect(() => { localStorage.setItem('lang', lang); document.documentElement.lang = lang }, [lang])
  useEffect(() => { localStorage.setItem('theme', dark ? 'dark' : 'light'); document.documentElement.classList.toggle('dark', dark) }, [dark])
  const t = (s) => (lang === 'km' && km[s]) || s
  return <Ctx.Provider value={{ lang, setLang, dark, setDark, t }}>{children}</Ctx.Provider>
}
export const useI18n = () => useContext(Ctx)
