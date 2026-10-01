// Shared IndexedDB reset — folder handles live in the "iconSplitter" database,
// so a test that must start without a remembered folder drops it first.
export function dropDb(): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase("iconSplitter");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
