var C='mc-shell-v1',S=['/','/mc-home.css','/mc-home.js','/manifest.json','/brand-m.webp','/favicon.svg','/mahi-profile.jpg'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(C).then(function(c){return c.addAll(S)}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x.indexOf('mc-shell-')===0&&x!==C}).map(function(x){return caches.delete(x)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){var r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin)return;
 if(r.mode==='navigate'){e.respondWith(fetch(r).catch(function(){return caches.match('/') }));return}
 if(S.indexOf(u.pathname)>-1)e.respondWith(fetch(r).then(function(res){if(!res.ok)return caches.match(r).then(function(c){return c||res});var cp=res.clone();caches.open(C).then(function(c){c.put(r,cp)});return res}).catch(function(){return caches.match(r)}))});
