// upload_stores_gemkey.test.ts — the upload tab's persistence (design §5/§7/§8)
// and the Gemini key store (RULE 20): every localStorage payload is read
// tolerantly (junk costs one ignored load, never a broken tab), the metadata
// cache is shape-checked per fingerprint, and the key lives in IndexedDB
// `secrets` under `gemini-api-key` — never localStorage, never a log line.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as fakeIndexedDb from "fake-indexeddb";
import { DEFAULT_EXPORT_SETTINGS, type ExportOverride } from "../src/lib/upsettings";
import { DEFAULT_META_PROMPT } from "../src/lib/upprompt";
import { DEFAULT_GEMINI_CONFIG } from "../src/lib/gemconfig";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";

const META: IconMetadata = {
  title: "Forward Motion and Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `c${i}`)],
};

describe("upload stores — localStorage, tolerant on read (RULE 13)", () => {
  beforeEach(() => localStorage.clear());

  it("defaults round-trip and junk falls back to the documented defaults", async () => {
    const { loadUploadDefaults, saveUploadDefaults } = await import("../src/upload/stores");
    saveUploadDefaults({ ...DEFAULT_EXPORT_SETTINGS, strokePt: 4 });
    expect(loadUploadDefaults().strokePt).toBe(4);
    localStorage.setItem("iconSplitter.upload.defaults.v1", "{junk");
    expect(loadUploadDefaults()).toEqual(DEFAULT_EXPORT_SETTINGS);
  });

  it("overrides round-trip per pair id and drop junk values", async () => {
    const { loadUploadOverrides, saveUploadOverrides } = await import("../src/upload/stores");
    const o: Record<string, ExportOverride | null> = { "pairs/a|_AI": { strokePt: 3, optimizeSvg: false }, "pairs/b|_AI": null };
    saveUploadOverrides(o);
    expect(loadUploadOverrides()["pairs/a|_AI"]).toEqual({ strokePt: 3, optimizeSvg: false });
    localStorage.setItem("iconSplitter.upload.overrides.v1", JSON.stringify({ overrides: { x: { nonsense: 1 }, y: { strokePt: 99 } } }));
    const loaded = loadUploadOverrides();
    expect(loaded.x).toBeUndefined();
    expect(loaded.y).toEqual({ strokePt: 8 }); // clamped by the ONE rule, not trusted
  });

  it("the prompt round-trips; empty or missing means the default", async () => {
    const { loadMetaPrompt, saveMetaPrompt } = await import("../src/upload/stores");
    expect(loadMetaPrompt()).toBe(DEFAULT_META_PROMPT);
    saveMetaPrompt("Custom prompt. Different words entirely.");
    expect(loadMetaPrompt()).toBe("Custom prompt. Different words entirely.");
    localStorage.setItem("iconSplitter.upload.prompt.v1", JSON.stringify({ prompt: "   " }));
    expect(loadMetaPrompt()).toBe(DEFAULT_META_PROMPT);
  });

  it("the Gemini config round-trips clamped", async () => {
    const { loadGeminiConfig, saveGeminiConfig } = await import("../src/upload/stores");
    saveGeminiConfig({ ...DEFAULT_GEMINI_CONFIG, timeoutS: 300, concurrency: 3 });
    expect(loadGeminiConfig()).toEqual({ ...DEFAULT_GEMINI_CONFIG, timeoutS: 300, concurrency: 3 });
    localStorage.setItem("iconSplitter.upload.gemini.v1", "null");
    expect(loadGeminiConfig()).toEqual(DEFAULT_GEMINI_CONFIG);
  });

  it("the metadata cache is keyed by fingerprint and shape-checked on read", async () => {
    const { loadMetaCache, saveMetaCache } = await import("../src/upload/stores");
    saveMetaCache({ "40:3300": META });
    expect(loadMetaCache()["40:3300"]).toEqual(META);
    // a source change (different fingerprint) simply misses the cache
    expect(loadMetaCache()["41:3300"]).toBeUndefined();
    localStorage.setItem("iconSplitter.upload.meta.v1", JSON.stringify({ cache: { good: META, bad: { title: "x" }, worse: 7 } }));
    const loaded = loadMetaCache();
    expect(loaded.good).toEqual(META);
    expect(loaded.bad).toBeUndefined();
    expect(loaded.worse).toBeUndefined();
  });
});

describe("gemkey — the Gemini API key in IndexedDB (RULE 20)", () => {
  beforeAll(() => {
    vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
    vi.stubGlobal("IDBKeyRange", fakeIndexedDb.IDBKeyRange);
  });

  it("stores, reads and clears the key under gemini-api-key", async () => {
    const { saveGeminiKey, loadGeminiKey, hasGeminiKey, clearGeminiKey } = await import("../src/upload/gemkey");
    const key = ["AIza", "test-key-0123456789abcdefg"].join(""); // assembled: no key-shaped literal in the repo
    expect(await saveGeminiKey(key)).toBe(true);
    expect(await loadGeminiKey()).toBe(key);
    expect(await hasGeminiKey()).toBe(true);
    await clearGeminiKey();
    expect(await loadGeminiKey()).toBeNull();
    expect(await hasGeminiKey()).toBe(false);
  });

  it("an empty save clears the key", async () => {
    const { saveGeminiKey, loadGeminiKey } = await import("../src/upload/gemkey");
    await saveGeminiKey("  ");
    expect(await loadGeminiKey()).toBeNull();
  });

  it("never writes the key to localStorage", async () => {
    const { saveGeminiKey } = await import("../src/upload/gemkey");
    await saveGeminiKey(["AIza", "another-test-key-0123456789"].join(""));
    const persisted = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? "").join(" ");
    expect(persisted).not.toContain("AIza");
  });
});
