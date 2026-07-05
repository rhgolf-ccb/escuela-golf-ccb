const CACHE_NAME = "ccb-golf-static-v2";
const STATIC_ASSETS = ["/manifest.webmanifest", "/icon.png", "/icon-512.png", "/apple-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// Solo los assets estáticos del PWA se sirven desde cache. Todo lo demás
// (páginas, APIs, datos de Supabase) siempre va a la red para evitar
// contenido desactualizado o de sesiones/roles distintos.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  }
});
