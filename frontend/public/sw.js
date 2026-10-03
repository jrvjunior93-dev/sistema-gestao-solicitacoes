const STATIC_CACHE = 'fluxy-shell-v1';
const STATIC_ASSETS = ['/fluxy-favicon.png', '/manifest.webmanifest', '/fluxy-pwa-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.pathname.startsWith('/api/') || requestUrl.hostname.startsWith('api.')) return;
  if (!STATIC_ASSETS.includes(requestUrl.pathname)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch (_) { data = {}; }
  event.waitUntil(self.registration.showNotification(data.title || 'Fluxy', {
    body: data.body || 'Há pagamentos aguardando sua autorização.',
    icon: '/fluxy-pwa-icon.svg', badge: '/fluxy-pwa-icon.svg',
    data: { url: data.url || '/financeiro/autorizacoes-pagamento' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || '/financeiro/autorizacoes-pagamento'));
});
