'use strict';
/* Browser-local storage (IndexedDB). Nothing here leaves the user's machine. */
const Store = (() => {
  const DB = 'startpage', VERSION = 1;
  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
        const req = indexedDB.open(DB, VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
          if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB blocked'));
      });
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  }

  async function run(storeName, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = fn(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  return {
    get: key => run('kv', 'readonly', s => s.get(key)),
    set: (key, value) => run('kv', 'readwrite', s => s.put(value, key)),
    getImage: id => run('images', 'readonly', s => s.get(id)),
    putImage: (id, rec) => run('images', 'readwrite', s => s.put(rec, id)),
    deleteImage: id => run('images', 'readwrite', s => s.delete(id)),
    async listImages() {
      const keys = await run('images', 'readonly', s => s.getAllKeys());
      const vals = await run('images', 'readonly', s => s.getAll());
      return keys.map((id, i) => ({ id, rec: vals[i] }));
    },
    clearImages: () => run('images', 'readwrite', s => s.clear()),
    async clearAll() {
      await run('kv', 'readwrite', s => s.clear());
      await run('images', 'readwrite', s => s.clear());
    }
  };
})();
