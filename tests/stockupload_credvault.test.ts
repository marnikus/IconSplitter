import { beforeAll, describe, expect, it, vi } from "vitest";
import * as fakeIndexedDb from "fake-indexeddb";
import type { VaultStorage } from "../src/lib/keyvault";
import { credSlotOf, createCredVault, redactCredentials } from "../src/lib/stockupload/credvault";
import { clearStockCreds, loadStockCreds, readStockCreds, resetStockCredVaults, saveStockCreds } from "../src/stockupload/keystore";

beforeAll(() => {
  vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
  vi.stubGlobal("IDBKeyRange", fakeIndexedDb.IDBKeyRange);
});

function memStorage(opts?: { failPut?: boolean; failGet?: boolean }): VaultStorage {
  const map = new Map<string, unknown>();
  return {
    async get(store, key) {
      if (opts?.failGet) throw new Error("idb blocked");
      return map.get(`${store}/${key}`) ?? null;
    },
    async put(store, key, value) {
      if (opts?.failPut) return false;
      map.set(`${store}/${key}`, value);
      return true;
    },
    async del(store, key) {
      map.delete(`${store}/${key}`);
      return true;
    },
  };
}

describe("stock FTP local credential vault", () => {
  it("stores username and password in the device slot and reads them back without touching localStorage", async () => {
    localStorage.clear();
    const vault = createCredVault(memStorage(), "secrets", credSlotOf("shutterstock"));
    expect(await vault.read()).toEqual({ creds: null, source: "none" });
    expect(await vault.has()).toBe(false);

    const saved = await vault.save("  contributor@example.com  ", "s3cr3t!Pass");
    expect(saved).toBe("device");
    expect(await vault.has()).toBe(true);
    expect(await vault.read()).toEqual({
      creds: { username: "contributor@example.com", password: "s3cr3t!Pass" },
      source: "device",
    });
    expect(localStorage.length).toBe(0);
  });

  it("refuses blank username or password without overwriting already-saved credentials", async () => {
    const vault = createCredVault(memStorage(), "secrets", credSlotOf("shutterstock"));
    await vault.save("alice", "hunter22");

    expect(await vault.save("", "newpass")).toBe("empty");
    expect(await vault.save("   ", "newpass")).toBe("empty");
    expect(await vault.save("bob", "")).toBe("empty");
    expect(await vault.load()).toEqual({ username: "alice", password: "hunter22" });
  });

  it("falls back to session memory when device storage refuses the write and clears cleanly", async () => {
    const vault = createCredVault(memStorage({ failPut: true }), "secrets", credSlotOf("shutterstock"));
    expect(await vault.save("alice", "pw1234")).toBe("session");
    expect(await vault.read()).toEqual({
      creds: { username: "alice", password: "pw1234" },
      source: "session",
    });
    await vault.clear();
    expect(await vault.read()).toEqual({ creds: null, source: "none" });
  });

  it("reports unreadable when IndexedDB throws and no session copy exists", async () => {
    const vault = createCredVault(memStorage({ failGet: true }), "secrets", credSlotOf("shutterstock"));
    expect(await vault.read()).toEqual({ creds: null, source: "unreadable" });
  });

  it("redacts username, password, apiKey, and apiSecret from error or status strings", () => {
    const out = redactCredentials(
      "401 OAuth failed for user contributor@example.com pass s3cr3t!Pass key gKey999 secret gSec888",
      { username: "contributor@example.com", password: "s3cr3t!Pass", apiKey: "gKey999", apiSecret: "gSec888" },
    );
    expect(out).not.toContain("contributor@example.com");
    expect(out).not.toContain("s3cr3t!Pass");
    expect(out).not.toContain("gKey999");
    expect(out).not.toContain("gSec888");
    expect(out).toContain("••••••••");
  });

  it("stores optional Getty ESP apiKey and apiSecret in the local device slot without touching localStorage", async () => {
    localStorage.clear();
    const vault = createCredVault(memStorage(), "secrets", credSlotOf("getty-images"));
    const outcome = await vault.save("  esp_artist@example.com ", "EspPass#1", {
      apiKey: "  getty_client_id_42  ",
      apiSecret: "getty_client_secret_99",
    });
    expect(outcome).toBe("device");
    expect(await vault.load()).toEqual({
      username: "esp_artist@example.com",
      password: "EspPass#1",
      apiKey: "getty_client_id_42",
      apiSecret: "getty_client_secret_99",
    });
    expect(localStorage.length).toBe(0);
  });

  it("stores API-key-only Getty OAuth2 PKCE credentials when username/password are blank, while still rejecting completely empty saves", async () => {
    const vault = createCredVault(memStorage(), "secrets", credSlotOf("getty-images"));
    expect(await vault.save("", "", { apiKey: "  ", apiSecret: "  " })).toBe("empty");
    expect(await vault.save("", "", { apiKey: "pkce_client_id_123", apiSecret: "pkce_secret_456" })).toBe("device");
    expect(await vault.load()).toEqual({
      username: "",
      password: "",
      apiKey: "pkce_client_id_123",
      apiSecret: "pkce_secret_456",
    });
  });

  it("persists per-preset credentials in IndexedDB keystore slots independently", async () => {
    resetStockCredVaults();
    await clearStockCreds("shutterstock");
    await clearStockCreds("custom-1");
    expect((await readStockCreds("shutterstock")).source).toBe("none");

    expect(await saveStockCreds("shutterstock", "user@ss.example", "ssPass1")).toBe("device");
    expect(await saveStockCreds("custom-1", "customUser", "customPass2")).toBe("device");

    expect(await loadStockCreds("shutterstock")).toEqual({ username: "user@ss.example", password: "ssPass1" });
    expect(await loadStockCreds("custom-1")).toEqual({ username: "customUser", password: "customPass2" });

    await clearStockCreds("shutterstock");
    expect(await loadStockCreds("shutterstock")).toBeNull();
    expect(await loadStockCreds("custom-1")).toEqual({ username: "customUser", password: "customPass2" });
    await clearStockCreds("custom-1");
  });
});
