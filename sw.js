const CACHE_NAME = 'indonesian-cache-v5';
const ASSETS = ['./','./index.html','./login.html','./admin.html','./indonesian_learning_data.json','./manifest.json','./Wang_he.jpg'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS).catch(()=>{})).then(() => {}))  // 不跳过等待，避免浏览器原生confirm弹窗;
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()));
});

self.addEventListener('message', e => {
    if (e.data && e.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
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

    // 同源请求：network-first（优先网络，离线回退缓存）
    e.respondWith(
        fetch(e.request)
            .then(r => {
                if (!r || r.status !== 200) return r;
                const cl = r.clone();
                caches.open(CACHE_NAME).then(c => c.put(e.request, cl));
                return r;
            })
            .catch(() => {
                // 网络失败时回退缓存
                return caches.match(e.request) ||
                    (e.request.destination === 'document' ? caches.match('./index.html') : new Response('Offline', { status: 503 }));
            })
    );
});
