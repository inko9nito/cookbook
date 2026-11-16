import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// which build is running, shown in Settings: Netlify's commit for the deploy (COMMIT_REF), and when it was built
const version = (process.env.COMMIT_REF ?? 'local').slice(0, 7);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
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
        navigateFallback: '/index.html',
        // the API and Netlify's own endpoints (sign-in) always go to the network
        navigateFallbackDenylist: [/^\/api\//, /^\/\.netlify\//],
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
