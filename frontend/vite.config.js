import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const api = 'http://localhost:8000'
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': api, '/auth': api, '/admin/api': api, '/health': api } },
})
