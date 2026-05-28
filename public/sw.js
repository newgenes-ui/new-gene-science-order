// PWA Service Worker supporting background push notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Pass-through fetch to avoid PWA caching sync issues
  event.respondWith(fetch(event.request));
});

// Background Push Notification Listener
self.addEventListener('push', (event) => {
  let data = { title: '관리자대시보드', body: '새로운 주문/견적이 접수되었습니다!' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: '관리자대시보드', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: '/admin'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Event Listener
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = new URL(event.notification.data?.url || '/admin', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
