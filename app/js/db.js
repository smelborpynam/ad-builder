// Small IndexedDB wrapper. Everything (including photos) is stored in this browser.
window.DB = (() => {
  'use strict';
  const NAME = 'dhp-ad-builder';
  const STORES = ['acts', 'theatres', 'shows', 'meta'];
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s of STORES) {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function run(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    open,
    all: (store) => run(store, 'readonly', (s) => s.getAll()),
    get: (store, id) => run(store, 'readonly', (s) => s.get(id)),
    put: (store, obj) => run(store, 'readwrite', (s) => s.put(obj)),
    del: (store, id) => run(store, 'readwrite', (s) => s.delete(id)),
  };
})();
