/**
 * vite.config.desk.ts
 * ───────────────────
 * Standalone build config for the Rewards Desk desktop app.
 * Used by `scripts/desk/build.js` (and the npm scripts below).
 *
 * Differences from vite.config.ts (Replit dev):
 *  - No PORT / BASE_PATH env vars required
 *  - base is "/" so the app works when served from localhost:3000 root
 *  - Output goes to ../../dist-desk so app-window.js can find it at
 *    <project-root>/dist-desk/
 *  - No Replit-specific plugins (cartographer, dev-banner)
 */

import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(import.meta.dirname, '..', '..', 'attached_assets'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, '../../dist-desk'),
    emptyOutDir: true,
  },
});
