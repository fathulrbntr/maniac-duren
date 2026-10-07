// Runs outside /pos/ so the old POS worker cannot serve a cached recovery page.
export async function recoverPos({origin,serviceWorker,cacheStorage}) {
  const scope = new URL('/pos/',origin).href;
  let workers=0,assets=0;
  if(serviceWorker){
    for(const registration of await serviceWorker.getRegistrations()){
      if(registration.scope===scope){
        if(!await registration.unregister())throw Error('Pemulihan belum selesai. Tutup tab POS lainnya lalu coba lagi.');
        workers++;
      }
    }
  }
  if(cacheStorage){
    for(const key of await cacheStorage.keys()){
      if(key.startsWith('maniac-pos-shell-')){
        if(!await cacheStorage.delete(key))throw Error('Cache belum terhapus. Coba sekali lagi.');
        assets++;
      }
    }
  }
  return {workers,assets};
}
