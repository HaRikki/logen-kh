import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const api = 'http://localhost:8000'
export default defineConfig({
  plugins: [react()],
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 600,
    rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], icons: ['lucide-react'], qr: ['qrcode.react'] } } } },
  server: { port: 5173, proxy: { '/api': api, '/auth': api, '/admin/api': api, '/health': api } },
})
