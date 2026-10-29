// keystore.ts — IndexedDB secret slots per Stock FTP preset (RULE 20).
// Keeps one CredVault instance per preset id so session fallback survives
// across reads within the same page session while never touching localStorage.

import { idbDelete, idbGet, idbPut } from "../batch/store";
import { SECRET_STORE } from "../lib/idbvault";
import type { KeySaveOutcome, VaultStorage } from "../lib/keyvault";
import {
  credSlotOf, createCredVault, type CredRead, type CredVault, type ExtraCredentials, type FtpCredentials,
} from "../lib/stockupload/credvault";

const vaults = new Map<string, CredVault>();

const idbStorage: VaultStorage = {
  get: (store, key) => idbGet<unknown>(store, key),
  put: (store, key, value) => idbPut(store, key, value),
  del: (store, key) => idbDelete(store, key),
};

function vaultFor(presetId: string): CredVault {
  const slot = credSlotOf(presetId);
  const existing = vaults.get(slot);
  if (existing) return existing;
  const created = createCredVault(idbStorage, SECRET_STORE, slot);
  vaults.set(slot, created);
  return created;
}

export function readStockCreds(presetId: string): Promise<CredRead> {
  return vaultFor(presetId).read();
}

export function loadStockCreds(presetId: string): Promise<FtpCredentials | null> {
  return vaultFor(presetId).load();
}

export function saveStockCreds(
  presetId: string, username: string, password: string, extra?: ExtraCredentials,
): Promise<KeySaveOutcome> {
  return vaultFor(presetId).save(username, password, extra);
}

export function clearStockCreds(presetId: string): Promise<void> {
  return vaultFor(presetId).clear();
}

export function resetStockCredVaults(): void {
  vaults.clear();
}

export function hasFtpCredentials(presetId: string): Promise<boolean> {
  return vaultFor(presetId).has();
}

export function readFtpCredentials(presetId: string): Promise<FtpCredentials | null> {
  return loadStockCreds(presetId);
}

export function saveFtpCredentials(presetId: string, creds: FtpCredentials): Promise<KeySaveOutcome> {
  return saveStockCreds(presetId, creds.username, creds.password, {
    apiKey: creds.apiKey,
    apiSecret: creds.apiSecret,
  });
}

export function clearFtpCredentials(presetId: string): Promise<void> {
  return clearStockCreds(presetId);
}

export async function resetFtpCredentialsForTests(): Promise<void> {
  for (const [slot] of vaults.entries()) {
    try { await idbDelete(SECRET_STORE, slot); } catch { /* test cleanup */ }
  }
  vaults.clear();
}
