const CACHE_NAME = 'dani-messenger-v1';
const urlsToCache = [
  '/',
  '/index.html'
];

// Установка Service Worker и кэширование базовых файлов
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Перехват запросов для работы в офлайн-режиме
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});