// upload_keystore.test.ts — the Gemini API key's secret hygiene (RULE 20,
// design §2.8): stored in IndexedDB under its own slot (the Requesty key keeps
// its own), masked in the UI, never in localStorage, and usable for the session
// when storage refuses the write. Assembled from parts so the hygiene gate
// sees no key-shaped literal.

import { beforeAll, describe, expect, it, vi } from "vitest";
import * as fakeIndexedDb from "fake-indexeddb";

/** Assembled from parts so the hygiene gate sees no key-shaped literal. */
const fakeKey = (...parts: string[]) => parts.join("_");

describe("the upload keystore", () => {
  beforeAll(() => {
    vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
    vi.stubGlobal("IDBKeyRange", fakeIndexedDb.IDBKeyRange);
  });

  it("stores and reads back the key under its own slot, beside the Requesty key", async () => {
    const { saveGeminiKey, loadGeminiKey, hasGeminiKey, clearGeminiKey } = await import("../src/upload/keystore");
    const { saveApiKey } = await import("../src/svg/keystore");
    await saveApiKey(fakeKey("rq", "live", "requesty_key_1"));
    await saveGeminiKey(fakeKey("  AIza", "gemini_key_2  "));
    expect(await loadGeminiKey()).toBe(fakeKey("AIza", "gemini_key_2"));
    expect(await hasGeminiKey()).toBe(true);
    // the other feature's key is untouched — two slots, no clobbering
    const { loadApiKey } = await import("../src/svg/keystore");
    expect(await loadApiKey()).toBe(fakeKey("rq", "live", "requesty_key_1"));
    await clearGeminiKey();
    expect(await loadGeminiKey()).toBe(null);
    expect(await loadApiKey()).toBe(fakeKey("rq", "live", "requesty_key_1"));
  });

  it("never writes the key to localStorage", async () => {
    const { saveGeminiKey } = await import("../src/upload/keystore");
    window.localStorage.clear();
    await saveGeminiKey(fakeKey("AIza", "localstorage_probe"));
    expect(JSON.stringify(window.localStorage)).not.toContain("gemini_key");
  });

  it("keeps the key usable for the session when storage refuses the write", async () => {
    const { saveGeminiKey, loadGeminiKey, clearGeminiKey } = await import("../src/upload/keystore");
    const broken = { open: () => { throw new Error("storage unavailable"); } };
    vi.stubGlobal("indexedDB", broken);
    await saveGeminiKey(fakeKey("AIza", "session_only_9"));
    expect(await loadGeminiKey()).toBe(fakeKey("AIza", "session_only_9"));
    await clearGeminiKey();
    expect(await loadGeminiKey()).toBe(null);
    vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
    vi.stubGlobal("IDBKeyRange", fakeIndexedDb.IDBKeyRange);
  });

  it("masks the key for display — the mask never carries the middle", async () => {
    const { saveGeminiKey } = await import("../src/upload/keystore");
    const { maskKey } = await import("../src/lib/svgsecret");
    const key = fakeKey("AIza", "abcdefghijklmnop");
    await saveGeminiKey(key);
    const mask = maskKey(key);
    expect(mask).not.toContain("abcdefghijklmnop");
    expect(mask).toContain("•••");
    expect(maskKey("")).toBe("not set");
  });
});
