// Loaded outside /pos/, beyond the scope of the retired POS service worker.
const DATABASE = 'maniac-pos-offline-v1';

async function openExistingDatabase(indexedDB) {
  if (!indexedDB) return null;
  if (typeof indexedDB.databases === 'function') {
    if (!(await indexedDB.databases()).some(row => row.name === DATABASE)) return null;
  }
  return new Promise((resolve, reject) => {
    let absent = false;
    const request = indexedDB.open(DATABASE);
    request.onupgradeneeded = event => {
      if (event.oldVersion === 0) { absent = true; request.transaction.abort(); }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => absent ? resolve(null) : reject(request.error);
    request.onblocked = () => reject(Error('Tutup tab POS lainnya, lalu coba lagi.'));
  });
}

export async function clearOfflineSnapshots(indexedDB, inspectOnly = false) {
  const result = {checked: !!indexedDB, snapshots: 0, sessions: 0, pending: 0, protectedAccounts: 0, backup: []};
  const db = await openExistingDatabase(indexedDB);
  if (!db) return result;
  try {
    if (!db.objectStoreNames.contains('records')) {
      result.protectedAccounts++;
      return result;
    }
    // Queue check and deletion share a transaction: no sale can be inserted
    // between observing an empty queue and deleting its cached snapshot.
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('records', inspectOnly ? 'readonly' : 'readwrite');
      const records = tx.objectStore('records');
      let hasSession = false;
      const request = records.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          if (!inspectOnly && hasSession && !result.protectedAccounts && !result.pending) {
            records.delete('session'); result.sessions++;
          }
          return;
        }
        const key = cursor.key;
        if (key === 'session') hasSession = true;
        if (typeof key === 'string' && key.startsWith('account:')) {
          const bundle = cursor.value;
          if (!bundle || !Array.isArray(bundle.queue) || !Object.hasOwn(bundle, 'snapshot') ||
              Object.keys(bundle).some(name => !['snapshot', 'queue', 'syncedAt'].includes(name))) {
            result.protectedAccounts++;
          } else if (bundle.queue.length) {
            result.pending += bundle.queue.length;
            result.backup.push({account: key, queue: bundle.queue});
          } else if (!inspectOnly) {
            cursor.delete(); result.snapshots++;
          }
        } else if (key !== 'session' && key !== 'device') result.protectedAccounts++;
        cursor.continue();
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(tx.error || Error('Data lokal belum dapat diperiksa.'));
    });
  } finally { db.close(); }
}

export function inspectRetries(storage) {
  const retries = [];
  if (!storage) return {checked: false, count: 0, retries};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith('maniac-pos-pending-operation-v1')) continue;
    const value = storage.getItem(key);
    if (!value || value === 'null') continue;
    try { const data = JSON.parse(value); if (data) retries.push({key, data}); }
    catch { retries.push({key, raw: value}); }
  }
  return {checked: true, count: retries.length, retries};
}

export async function inspectPending({indexedDB, sessionStorage}) {
  return {...await clearOfflineSnapshots(indexedDB, true), retry: inspectRetries(sessionStorage)};
}

export async function recoverPos({origin, serviceWorker, cacheStorage, indexedDB, localStorage, locks}) {
  const clean = async () => {
    const result = {...await clearOfflineSnapshots(indexedDB), workers: 0, assets: 0};
    const scope = new URL('/pos/', origin).href;
    if (serviceWorker) {
      for (const registration of await serviceWorker.getRegistrations()) {
        if (registration.scope !== scope) continue;
        if (!await registration.unregister()) throw Error('Tutup tab POS lainnya, lalu coba lagi.');
        result.workers++;
      }
    }
    if (cacheStorage) {
      for (const key of await cacheStorage.keys()) {
        if (!key.startsWith('maniac-pos-shell-')) continue;
        if (await cacheStorage.delete(key)) result.assets++;
        else if ((await cacheStorage.keys()).includes(key)) throw Error('Cache belum terhapus. Coba lagi.');
      }
    }
    localStorage?.removeItem('maniac-pos-demo-v1');
    return result;
  };
  if (!locks) return clean();
  return locks.request('maniac-pos-terminal', {ifAvailable: true}, lock => {
    if (!lock) throw Error('POS masih terbuka. Selesaikan transaksi dan tutup tab/PWA POS lainnya, lalu coba lagi.');
    return clean();
  });
}
