// 들판처럼 통신이 약한 곳에서도 열리도록: 네트워크 우선, 실패하면 캐시.
const CACHE = 'youngnong-v10';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/report.js', 'data/crops.json', 'icons/icon.svg', 'manifest.webmanifest', 'assets/rice-farmer-joam-ri-south-korea.jpg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  // 다른 사이트(날씨 등)로 가는 요청은 건드리지 않는다
  // 이 앱 폴더 밖의 요청(리프노트 로그인·계정 API, 날씨 등)은 건드리지 않는다 — 내 기록이 캐시에 남지 않게
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.registration.scope)) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
