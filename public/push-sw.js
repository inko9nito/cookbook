// Push notifications for cook mode timers (issue #169), loaded into the generated service worker (vite.config.ts,
// workbox importScripts). The server sends a timer's push when it's up (netlify/lib/push.ts); this shows it.
// Tapping it opens the app with cook mode on screen.

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : '' };
  }
  // every push must show a notification (iPhone Safari takes the permission away otherwise)
  event.waitUntil(
    self.registration.showNotification(message.title || 'Cookbook', {
      body: message.body || 'A timer is up.',
      tag: message.tag || 'timer',
      icon: '/icons/icon-192.png',
      data: { cook: true },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const app = open[0];
      if (app) {
        // the app shows cook mode (src/data/cook.tsx listens)
        app.postMessage({ type: 'ck-show-cook' });
        await app.focus();
        return;
      }
      // the app isn't running: it opens with cook mode as it was, since cook mode is kept on the phone
      await self.clients.openWindow('/');
    })(),
  );
});
