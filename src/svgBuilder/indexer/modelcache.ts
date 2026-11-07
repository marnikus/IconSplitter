// modelcache.ts — transformers.js `customCache` backed by IndexedDB, so the two
// models download from huggingface.co ONCE and then load offline — also when the
// app runs from file://, where the browser's Cache Storage may be unavailable.
// Stores model files only (public weights/configs); never icon data or keys.

const DB = "iconSplitter-models";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, body: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const req = body(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

interface Stored { body: ArrayBuffer; type: string }

export function modelCache() {
  return {
    async match(url: string): Promise<Response | undefined> {
      const hit = await run<Stored | undefined>("readonly", (s) => s.get(url)).catch(() => undefined);
      return hit === undefined ? undefined : new Response(hit.body, { headers: { "content-type": hit.type, "content-length": String(hit.body.byteLength) } });
    },
    async put(url: string, response: Response): Promise<void> {
      const body = await response.clone().arrayBuffer();
      const value: Stored = { body, type: response.headers.get("content-type") ?? "application/octet-stream" };
      await run("readwrite", (s) => s.put(value, url)).catch(() => undefined);
    },
  };
}
