self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(String(data.title || 'DC Foundry CRM').slice(0, 180), {
      body: String(data.body || 'Uma atualização está disponível.').slice(0, 500),
      tag: String(data.tag || 'crm'),
      icon: '/logosemfundonova.png',
      data: { url: '/' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: 'crm:notifications' });
      } else await self.clients.openWindow('/');
    }),
  );
});
const STATIC_CACHE = 'dc-foundry-static-v4';
const STATIC_PATHS = [
  '/offline.html',
  '/app-icon-192.png',
  '/app-icon-512.png',
  '/logosemfundonova.png',
  '/dcsemfundooriginal.png',
  '/fonts/manrope-latin.woff2',
];
self.addEventListener('install', (event) =>
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_PATHS))),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('dc-foundry-static-') && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          // Only the public app shell is reusable offline. Never cache portal/signature URLs.
          if (response.ok && url.pathname === '/' && !url.search) {
            const cache = await caches.open(STATIC_CACHE);
            await cache.put('/', response.clone());
          }
          return response;
        })
        .catch(async () => {
          if (url.pathname === '/' && !url.search) {
            const shell = await caches.match('/');
            if (shell) return shell;
          }
          return (
            (await caches.match('/offline.html')) ||
            new Response('CRM sem conexão', { status: 503 })
          );
        }),
    );
  } else if (
    !url.search &&
    (STATIC_PATHS.includes(url.pathname) ||
      /^\/assets\/[\w.-]+\.(js|css|woff2)$/.test(url.pathname))
  ) {
    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(STATIC_CACHE);
          await cache.put(event.request, response.clone());
        }
        return response;
      }),
    );
  }
});
