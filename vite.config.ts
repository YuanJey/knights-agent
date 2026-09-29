import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const proxy = {
  '/api': 'http://127.0.0.1:8787',
  '/healthz': 'http://127.0.0.1:8787',
  '/readyz': 'http://127.0.0.1:8787',
}

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
