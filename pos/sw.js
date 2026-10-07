// POS web mode: retirement worker, no fetch interception or offline asset cache.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 try{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('maniac-pos-shell-')).map(key=>caches.delete(key)));
 }finally{
  await self.registration.unregister();
 }
})()));
// Do not navigate clients: an open terminal may have an unsaved form or payment.
