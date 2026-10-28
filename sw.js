/* TrailMate service worker — 快取 App 本體，離線也能開 */
const CACHE = 'trailmate-v48';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* 分享接收：Google 相簿等 App 分享檔案 → 先存進 share-inbox，再導回 App 由頁面匯入 */
function openInbox(){return new Promise((res,rej)=>{const r=indexedDB.open('share-inbox',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('files'))r.result.createObjectStore('files',{autoIncrement:true});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const files = fd.getAll('media').filter((f) => f && f.size);
        const db = await openInbox();
        await new Promise((res, rej) => {
          const t = db.transaction('files', 'readwrite');
          const st = t.objectStore('files');
          files.forEach((f) => st.add({ name: f.name || 'shared', type: f.type || '', blob: f, at: Date.now() }));
          t.oncomplete = () => res();
          t.onerror = () => rej(t.error);
        });
      } catch (_) {}
      return Response.redirect(new URL('./index.html?shared=1', self.location.href).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  // 只快取本站檔案；圖資走 App 內的 IndexedDB，不經 SW
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request, { ignoreSearch: false }).then(
        (hit) => hit || fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        }).catch(() => caches.match('./index.html'))
      )
    );
  }
});
