import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // A POS terminal is usually a shared browser tab open all shift on a counter machine, not
    // always the same laptop `npm run dev` was started from — same reasoning as
    // apps/customer_web's `--host` default (see its vite.config.ts / package.json). Port fixed
    // at 3001 to match the LAN CORS allow-list DineEasy has shipped with since before this app
    // existed (see .env.example's `CORS_ORIGINS=http://localhost:5173,http://localhost:3001`).
    port: 3001,
    strictPort: true,
  },
})
