// keyvault.ts — encrypted-at-rest Requesty key storage. The plaintext is never
// written to localStorage, preferences, sidecars, history, exports or logs.

const DB_NAME = "iconSplitter.secret-vault.v1";
const STORE = "credentials";
const KEY_ID = "requesty";

interface EncryptedCredential {
  key: CryptoKey;
  iv: ArrayBuffer;
  cipher: ArrayBuffer;
}

export async function hasRequestyKey(): Promise<boolean> {
  const db = await openVault();
  if (!db) return false;
  return Boolean(await readCredential(db));
}

export async function saveRequestyKey(secret: string): Promise<void> {
  const db = await requireVault();
  const key = await encryptionKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(secret));
  await writeCredential(db, { key, iv: iv.buffer, cipher });
}

export async function getRequestyKey(): Promise<string | null> {
  const db = await openVault();
  if (!db) return null;
  const stored = await readCredential(db);
  if (!stored) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: stored.iv }, stored.key, stored.cipher);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export async function clearRequestyKey(): Promise<void> {
  const db = await openVault();
  if (db) await deleteCredential(db);
}

async function requireVault(): Promise<IDBDatabase> {
  const db = await openVault();
  if (!db || !crypto?.subtle) throw new Error("Encrypted local key storage is unavailable in this browser.");
  return db;
}

async function encryptionKey(db: IDBDatabase): Promise<CryptoKey> {
  const stored = await readCredential(db);
  if (stored) return stored.key;
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function openVault(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readCredential(db: IDBDatabase): Promise<EncryptedCredential | null> {
  return request(db, "readonly", (store) => store.get(KEY_ID));
}

function writeCredential(db: IDBDatabase, value: EncryptedCredential): Promise<void> {
  return request(db, "readwrite", (store) => store.put(value, KEY_ID)).then(() => undefined);
}

function deleteCredential(db: IDBDatabase): Promise<void> {
  return request(db, "readwrite", (store) => store.delete(KEY_ID)).then(() => undefined);
}

function request<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
