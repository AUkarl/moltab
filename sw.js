/**
 * Service Worker - MolTab 离线缓存
 * 策略：stale-while-revalidate（优先返回缓存，后台更新）
 * 排除所有 API 请求（天气/一言/壁纸等），只缓存静态资源
 */
const CACHE_NAME = 'moltap-v2.1';
// 首次安装时预缓存的核心静态资源
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './app/app.js',
    './app/time.js',
    './app/search.js',
    './app/weather.js',
    './app/hitokoto.js',
    './app/wallpaper.js',
    './app/theme.js',
    './app/bookmarks.js',
    './app/settings.js',
    './app/greeting.js',
    './app/focus.js',
    './app/favicon.js'
];

// 安装阶段：预缓存所有静态资源，跳过等待立即接管
self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
});

// 激活阶段：清理旧版本缓存，立即接管所有客户端
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    // 排除 API 域名请求，走正常网络（天气/一言/壁纸/定位等接口）
    if (['api', 'v1', 'picsum', 'bing', 'ipapi', 'ip.sb', 'ipinfo', 'bigdatacloud', 'open-meteo', 'hitokoto'].some(s => url.hostname.includes(s))) return;
    // stale-while-revalidate：优先返回缓存，同时后台请求网络更新缓存
    e.respondWith(
        caches.match(e.request).then(cached => {
            const fetched = fetch(e.request).then(resp => {
                if (resp.ok && e.request.method === 'GET') {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return resp;
            }).catch(() => cached);
            return cached || fetched;
        })
    );
});
