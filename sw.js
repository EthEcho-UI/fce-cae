// Service worker for First & Advanced Prep. VERSION and ASSETS below are rewritten by
// tools/build_sw.py before each commit — do not hand-edit those two lines.
const VERSION = "6f55c6dd2c24"; // build:version
const CACHE_NAME = `fcecae-${VERSION}`;
const ASSETS = [
  "css/app.css",
  "data/cae/evaluation.json",
  "data/cae/read5.json",
  "data/cae/read6.json",
  "data/cae/read7.json",
  "data/cae/read8.json",
  "data/cae/tests.json",
  "data/cae/uoe1.json",
  "data/cae/uoe2.json",
  "data/cae/uoe3.json",
  "data/cae/uoe4.json",
  "data/cae/vocab.json",
  "data/fce/evaluation.json",
  "data/fce/read5.json",
  "data/fce/read6.json",
  "data/fce/read7.json",
  "data/fce/tests.json",
  "data/fce/uoe1.json",
  "data/fce/uoe2.json",
  "data/fce/uoe3.json",
  "data/fce/uoe4.json",
  "data/fce/vocab.json",
  "fonts/OFL.txt",
  "fonts/source-serif-4-latin-400-italic.woff2",
  "fonts/source-serif-4-latin-400-normal.woff2",
  "fonts/source-serif-4-latin-600-normal.woff2",
  "icons/icon-192.png",
  "icons/icon-512-maskable.png",
  "icons/icon-512.png",
  "icons/icon.svg",
  "index.html",
  "js/app.js",
  "js/data.js",
  "js/deck.js",
  "js/dom.js",
  "js/flashcards.js",
  "js/grading.js",
  "js/history.js",
  "js/icons.js",
  "js/mistakes.js",
  "js/normalize.js",
  "js/overrides.js",
  "js/players.js",
  "js/progress.js",
  "js/router.js",
  "js/settings.js",
  "js/skillmap.js",
  "js/srs.js",
  "js/store.js",
  "js/testEngine.js",
  "js/teststate.js",
  "js/validate.js",
  "js/views/about.js",
  "js/views/evaluation.js",
  "js/views/exerciseSet.js",
  "js/views/exercises.js",
  "js/views/flashcards.js",
  "js/views/home.js",
  "js/views/import.js",
  "js/views/mistakes.js",
  "js/views/more.js",
  "js/views/notFound.js",
  "js/views/practise.js",
  "js/views/progress.js",
  "js/views/settings.js",
  "js/views/tests.js",
  "js/views/vocab.js",
  "js/views/vocabQuiz.js",
  "manifest.webmanifest",
  "sw.js"
]; // build:assets

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {
      // Precaching is best-effort: a missing asset should not block install.
      return caches.open(CACHE_NAME).then((cache) => Promise.allSettled(ASSETS.map((a) => cache.add(a))));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => n.startsWith('fcecae-') && n !== CACHE_NAME)
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
