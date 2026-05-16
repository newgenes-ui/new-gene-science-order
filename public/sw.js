// Simple Service Worker for PWA installability
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // 모든 요청을 캐시하지 않고 네트워크에서 직접 가져오도록 강제 (PWA 동기화 문제 해결)
  event.respondWith(fetch(event.request));
});
