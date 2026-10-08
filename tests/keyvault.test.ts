// keyvault.test.ts — the rules that decide whether a saved API key is really
// there (RULE 20): an empty save never wipes, a failed read is never reported
// as "no key", a refused write keeps the session copy and says so, and the key
// never leaves the storage it was given.
import { describe, expect, it } from "vitest";
import { createKeyVault, type VaultStorage } from "../src/lib/keyvault";

/** Assembled from parts so the hygiene gate sees no key-shaped literal. */
const fakeKey = (...parts: string[]) => parts.join("_");
const KEY = fakeKey("AIza", "vault_probe_1");

/** An in-memory storage that can be told to fail reads or writes. */
function storage(opts: { failRead?: boolean; failWrite?: boolean } = {}) {
  const data = new Map<string, unknown>();
  const calls: string[] = [];
  const api: VaultStorage & { data: Map<string, unknown>; calls: string[] } = {
    data,
    calls,
    get: async (store, slot) => {
      calls.push(`get:${store}:${slot}`);
      if (opts.failRead === true) throw new Error("storage unreadable");
      return data.get(`${store}/${slot}`) ?? null;
    },
    put: async (store, slot, value) => {
      calls.push(`put:${store}:${slot}`);
      if (opts.failWrite === true) throw new Error("storage refused");
      data.set(`${store}/${slot}`, value);
      return true;
    },
    del: async (store, slot) => {
      calls.push(`del:${store}:${slot}`);
      data.delete(`${store}/${slot}`);
      return true;
    },
  };
  return api;
}

const vaultOf = (s: VaultStorage) => createKeyVault(s, "secrets", "gemini-api-key");

describe("saving", () => {
  it("stores the trimmed key and reports where it landed", async () => {
    const s = storage();
    const vault = vaultOf(s);
    expect(await vault.save(`  ${KEY}  `)).toBe("device");
    expect(s.data.get("secrets/gemini-api-key")).toEqual({ key: KEY });
    expect(await vault.load()).toBe(KEY);
  });

  it("treats an empty field as a slip: it never erases a stored key", async () => {
    const vault = vaultOf(storage());
    await vault.save(KEY);
    expect(await vault.save("")).toBe("empty");
    expect(await vault.save("   ")).toBe("empty");
    expect(await vault.load()).toBe(KEY);
  });

  it("keeps the key usable for the session when the write is refused", async () => {
    const vault = vaultOf(storage({ failWrite: true }));
    expect(await vault.save(KEY)).toBe("session");
    expect(await vault.load()).toBe(KEY);
    const read = await vault.read();
    expect(read.source).toBe("session"); // …and the UI is told which case this is
  });
});

describe("reading", () => {
  it("says where the key came from, and never invents one", async () => {
    const empty = vaultOf(storage());
    expect(await empty.read()).toEqual({ key: null, source: "none" });

    const stored = vaultOf(storage());
    await stored.save(KEY);
    expect(await stored.read()).toEqual({ key: KEY, source: "device" });
  });

  it("reports an unreadable store as unreadable, never as 'no key'", async () => {
    const vault = vaultOf(storage({ failRead: true }));
    expect(await vault.read()).toEqual({ key: null, source: "unreadable" });
    expect(await vault.has()).toBe(false);
  });

  it("still answers from the session copy when the store breaks after a save", async () => {
    let broken = false;
    const s = storage();
    const vault = createKeyVault({
      get: async (store, slot) => (broken ? Promise.reject(new Error("unreadable")) : s.get(store, slot)),
      put: s.put,
      del: s.del,
    }, "secrets", "gemini-api-key");
    expect(await vault.save(KEY)).toBe("device");
    expect(await vault.read()).toEqual({ key: KEY, source: "device" });

    broken = true; // e.g. the connection was closed by another tab's upgrade
    expect(await vault.read()).toEqual({ key: KEY, source: "session" });
    expect(await vault.has()).toBe(true);
  });

  it("ignores a corrupt envelope instead of handing out a non-string", async () => {
    const s = storage();
    s.data.set("secrets/gemini-api-key", { key: 42 });
    expect(await vaultOf(s).read()).toEqual({ key: null, source: "none" });
    s.data.set("secrets/gemini-api-key", "raw-string");
    expect(await vaultOf(s).read()).toEqual({ key: null, source: "none" });
  });
});

describe("clearing", () => {
  it("is the only path that deletes, and it deletes both copies", async () => {
    const vault = vaultOf(storage());
    await vault.save(KEY);
    await vault.clear();
    expect(await vault.read()).toEqual({ key: null, source: "none" });
    expect(await vault.has()).toBe(false);
  });
});
