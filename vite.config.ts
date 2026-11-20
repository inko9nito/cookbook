import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// which build is running, shown in Settings: Netlify's commit for the deploy (COMMIT_REF), and when it was built
const version = (process.env.COMMIT_REF ?? 'local').slice(0, 7);
const built = new Date().toISOString();

export default defineConfig({
  // issue #141: a second page, /next/, the app without Framework7 (a trial on deploy previews)
  build: {
    rollupOptions: {
      input: { main: 'index.html', next: 'next/index.html' },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILT__: JSON.stringify(built),
  },
  plugins: [
    react(),
    // issue #141: /next/ (the app without Framework7) has its own manifest, so a home-screen icon made there opens it
    // (the PWA plugin adds its own link as the page is written, so this edits the written page)
    {
      name: 'cookbook-next-manifest',
      apply: 'build',
      enforce: 'post',
      closeBundle() {
        const file = path.resolve(__dirname, 'dist/next/index.html');
        if (fs.existsSync(file)) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('href="/manifest.webmanifest"', 'href="/next/manifest.webmanifest"'));
      },
    },
    // /version.json: which build is live. Builds before issue #91 compare it with the build they run to see whether
    // they're behind (the refresh icon now always reloads, src/lib/appUpdate.ts), so it stays for phones still on one.
    // It's never kept offline (not in the service worker's list below), so it's always the deploy's own.
    {
      name: 'cookbook-version-file',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, built }) });
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Cookbook',
        short_name: 'Cookbook',
        description: 'My recipes, cookbooks and meal plans',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f7f8',
        theme_color: '#f7f7f8',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'],
        // the launch images are for iOS to show as the home-screen app opens (one per iPhone screen); the app never loads them
        globIgnores: ['launch/**'],
        navigateFallback: '/index.html',
        // the API and Netlify's own endpoints (sign-in) always go to the network
        // /next/ is the app without Framework7 (issue #141, a trial): its own page, never this one
        navigateFallbackDenylist: [/^\/api\//, /^\/\.netlify\//, /^\/next(\/|$)/],
        runtimeCaching: [
          {
            // stored recipe photos never change (a new crop is a new photo), so keep them for the kitchen offline
            urlPattern: ({ url }) => url.pathname.startsWith('/api/photos/'),
            handler: 'CacheFirst',
            options: { cacheName: 'recipe-photos', expiration: { maxEntries: 2000 }, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
});
