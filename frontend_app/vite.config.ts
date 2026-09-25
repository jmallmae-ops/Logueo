import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    // En desarrollo, /api se redirige al backend Flask local
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
