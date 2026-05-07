const CACHE_NAME = 'indonesian-v2.40';
const ASSETS = ['./','./index.html','./login.html','./admin.html','./app.js?v=20260507','./style.css?v=20260507','./config.js?v=20260507','./indonesian_learning_data.json','./manifest.json','./Wang_he.jpg','./module-challenge.js?v=20260507','./module-study.js?v=20260507','./module-study-practice.js?v=20260507','./course-content-loader.js?v=20260507','./modules.css?v=20260507'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS).catch(()=>{})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    const u = new URL(e.request.url);
    const isOwnOrigin = u.origin === self.location.origin;

    // 跨域请求：只对 bootcdn 做 network-first（不缓存，直接走网络）
    if (!isOwnOrigin) {
        if (u.href.includes('bootcdn.net') || u.href.includes('sheetjs.com')) {
            e.respondWith(fetch(e.request).catch(() => new Response('Offline', { status: 503 })));
        }
        return;
    }

    // 同源请求：stale-while-revalidate
    e.respondWith(caches.match(e.request).then(cached => {
        if (cached) {
            // 后台静默更新缓存
            fetch(e.request).then(r => {
                if (r && r.status === 200) caches.open(CACHE_NAME).then(c => c.put(e.request, r.clone()));
            }).catch(() => {});
            return cached;
        }
        return fetch(e.request).then(r => {
            if (!r || r.status !== 200) return r;
            const cl = r.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, cl));
            return r;
        }).catch(() =>
            e.request.destination === 'document' ? caches.match('./index.html') : undefined
        );
    }));
});
