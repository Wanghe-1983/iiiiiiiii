const CACHE_NAME = 'indonesian-v1.2';
const ASSETS = ['./','./index.html','./login.html','./admin.html','./app.js','./style.css','./config.js','./indonesian_learning_data.json','./whitelist.json','./manifest.json','./Wang_he.jpg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS).catch(()=>{})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE_NAME).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    const u = new URL(e.request.url);
    if (u.origin !== self.location.origin && !u.href.includes('bootcdn.net')) return;
    e.respondWith(caches.match(e.request).then(cached => {
        if (cached) { fetch(e.request).then(r => { if(r&&r.status===200) caches.open(CACHE_NAME).then(c=>c.put(e.request,r.clone())); }).catch(()=>{}); return cached; }
        return fetch(e.request).then(r => { if(!r||r.status!==200) return r; const cl=r.clone(); caches.open(CACHE_NAME).then(c=>c.put(e.request,cl)); return r; }).catch(() => e.request.destination==='document' ? caches.match('./index.html') : undefined);
    }));
});