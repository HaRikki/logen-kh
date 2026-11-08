import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { I18nProvider } from './lib/i18n'
import { AuthProvider } from './lib/auth'
import './index.css'

createRoot(document.getElementById('root')).render(
  <I18nProvider><AuthProvider><BrowserRouter><App /></BrowserRouter></AuthProvider></I18nProvider>)
