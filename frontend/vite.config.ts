/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// 127.0.0.1, not `localhost`: on a dual-stack machine Node resolves `localhost`
// to ::1 first and does not fall back the way a browser does, so the proxy
// would fail against an API listening on IPv4 only.
const API_TARGET = process.env.VITE_PROXY_TARGET ?? 'http://127.0.0.1:3000';

const DEV_PROXY = {
  '/api': { target: API_TARGET, changeOrigin: true },
  '/realtime': { target: API_TARGET, ws: true, changeOrigin: true },
  '/socket.io': { target: API_TARGET, ws: true, changeOrigin: true },
};

// Tailwind v4 is a Vite plugin — there is no tailwind.config.ts, no postcss,
// no autoprefixer. Design tokens live in an @theme block in src/index.css.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    // Vendors that change on their own schedule get their own long-lived chunks,
    // so an app deploy does not invalidate React or Recharts in the browser cache.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          query: ['@tanstack/react-query', '@tanstack/react-table', 'axios'],
          forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
          dates: ['date-fns', 'date-fns-tz'],
          charts: ['recharts'],
        },
      },
    },
  },
  // Same-origin in development, so CORS can never mask a real bug.
  // In production the reverse proxy in front of the app does the same job.
  server: { port: 5173, proxy: DEV_PROXY },
  preview: { port: 4173, proxy: DEV_PROXY },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/store/**', 'src/schemas/**', 'src/api/client.ts'],
    },
  },
});
