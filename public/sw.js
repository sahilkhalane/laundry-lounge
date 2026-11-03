const CACHE = 'laundry-lounge-v1';
const PRECACHE = [];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', ...PRECACHE])).then(()=>self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())); });
self.addEventListener('message', event=>{ if(event.data?.type==='CACHE_ASSETS' && Array.isArray(event.data.urls)) event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(event.data.urls.filter(url=>typeof url==='string' && new URL(url,self.location.origin).origin===self.location.origin)))); });
self.addEventListener('fetch', event => {
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin) return;
 if(event.request.mode==='navigate') { event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put('/index.html',copy)));}return response;}).catch(()=>caches.match('/index.html'))); return; }
 event.respondWith(caches.match(event.request, { ignoreVary: true }).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;})));
});
