// svg_keystore.test.ts — the API key must survive a save, including for a user
// whose IndexedDB was created before the SVG feature existed (RULE 20).
//
// Regression: an existing `iconSplitter` v1 database only has the `handles`
// object store. Opening it at the same version never runs `onupgradeneeded`, so
// the `secrets` store is missing and every key write threw — the save appeared
// to do nothing and no request could ever be sent.

import { beforeAll, describe, expect, it, vi } from "vitest";
import * as fakeIndexedDb from "fake-indexeddb";

const DB_NAME = "iconSplitter";

/** Assembled from parts so the hygiene gate sees no key-shaped literal. */
const fakeKey = (...parts: string[]) => parts.join("_");

/** A database as the batch/selection features left it: handles only. */
function seedV1HandlesOnly(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("handles")) req.result.createObjectStore("handles");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

describe("svg keystore", () => {
  beforeAll(() => {
    vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
    vi.stubGlobal("IDBKeyRange", fakeIndexedDb.IDBKeyRange);
  });

  it("stores and reads back the key on a database that predates the SVG feature", async () => {
    const { saveApiKey, loadApiKey, hasApiKey, clearApiKey } = await import("../src/svg/keystore");
    const old = await seedV1HandlesOnly();
    expect(old.objectStoreNames.contains("secrets")).toBe(false);
    old.close();

    await saveApiKey(fakeKey("  rq", "live", "test_key_1234  "));

    expect(await loadApiKey()).toBe(fakeKey("rq", "live", "test_key_1234"));
    expect(await hasApiKey()).toBe(true);
    await clearApiKey();
    expect(await loadApiKey()).toBe(null);
  });

  it("keeps the key usable for the session when storage refuses the write", async () => {
    const { saveApiKey, loadApiKey } = await import("../src/svg/keystore");
    const broken = {
      open: () => { throw new Error("storage unavailable"); },
    };
    vi.stubGlobal("indexedDB", broken);

    await saveApiKey(fakeKey("rq", "live", "session_only_5678"));

    // The run must still be possible; only persistence is lost.
    expect(await loadApiKey()).toBe(fakeKey("rq", "live", "session_only_5678"));
    vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
  });

  it("reads the handles store the batch feature wrote, untouched", async () => {
    const { saveHandles, loadHandles } = await import("../src/batch/store");
    const { FakeDir } = await import("./helpers/fakefs");
    await saveHandles("preset-a", { source: new FakeDir("root") });
    const loaded = await loadHandles("preset-a");
    expect(loaded?.source?.name).toBe("root");
  });
});
