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
