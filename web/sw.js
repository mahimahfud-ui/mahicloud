var C='mc-shell-v4',S=['/','/mc-home.css','/mc-home.js','/manifest.json','/brand-m.webp','/favicon.svg','/mahi-avatar.webp','/mahi-ai/config.js','/mahi-ai-launcher.js'];
function networkFirst(request,timeoutMs){
 if(typeof AbortController==='undefined')return fetch(request);
 var controller=new AbortController(),timer=setTimeout(function(){controller.abort()},timeoutMs||4500);
 return fetch(request,{cache:'no-cache',signal:controller.signal}).finally(function(){clearTimeout(timer)});
}
self.addEventListener('install',function(e){e.waitUntil(caches.open(C).then(function(c){return c.addAll(S)}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x.indexOf('mc-shell-')===0&&x!==C}).map(function(x){return caches.delete(x)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){
 var r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin)return;
 if(r.mode==='navigate'){
  var navigationRefresh=networkFirst(r,4500).then(function(res){
   if(!res.ok)return res;
   var copy=res.clone();
   return caches.open(C).then(function(c){return c.put(r,copy)}).then(function(){return res});
  });
  e.waitUntil(navigationRefresh.then(function(){}).catch(function(){}));
  e.respondWith(caches.match(r).then(function(cached){
   return cached||navigationRefresh.catch(function(){return caches.match('/')});
  }));
  return;
 }
 if(S.indexOf(u.pathname)>-1){
  var assetRefresh=networkFirst(r,4500).then(function(res){
   if(!res.ok)return caches.match(r).then(function(c){return c||res});
   var copy=res.clone();
   return caches.open(C).then(function(c){return c.put(r,copy)}).then(function(){return res});
  });
  e.waitUntil(assetRefresh.then(function(){}).catch(function(){}));
  e.respondWith(caches.match(r).then(function(cached){
   return cached||assetRefresh.catch(function(){return caches.match(r)});
  }));
 }
});
