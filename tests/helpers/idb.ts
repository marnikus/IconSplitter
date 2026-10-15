// Shared IndexedDB reset — folder handles live in the "iconSplitter" database,
// so a test that must start without a remembered folder drops it first.
export async function dropDb(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const { __resetDbForTests } = await import("../../src/batch/store");
    await __resetDbForTests();
  } catch {}
  // Give fake-indexeddb a tick to process close
  await new Promise((r) => setTimeout(r, 10));
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase("iconSplitter");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => {
      // If blocked, try to close again and retry delete
      setTimeout(() => {
        const req2 = indexedDB.deleteDatabase("iconSplitter");
        req2.onsuccess = () => resolve();
        req2.onerror = () => resolve();
        req2.onblocked = () => resolve();
      }, 50);
    };
  });
}
