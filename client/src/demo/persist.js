// Saves the demo database in the visitor's browser (IndexedDB), so their changes survive reloads.
const DB_NAME = 'icms-demo';
const STORE = 'kv';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function withStore(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const r = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(r?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function loadSnapshot(key) {
  try { return (await withStore('readonly', (s) => s.get(key))) ?? null; } catch { return null; }
}
export async function saveSnapshot(key, bytes) {
  try { await withStore('readwrite', (s) => s.put(bytes, key)); } catch { /* storage unavailable: demo still works in memory */ }
}
export async function clearSnapshots() {
  try { await withStore('readwrite', (s) => s.clear()); } catch { /* ignore */ }
}
