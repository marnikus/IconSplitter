// idbvault.ts — the ONE place that wires the key vault to the page's
// IndexedDB secret store (RULE 16.4/20). Both tabs' keystores are one call
// here, so the store name, the slot and the read/write/delete plumbing exist
// once and cannot drift apart between the two providers.

import { createKeyVault, type KeyVault, type VaultStorage } from "./keyvault";
import { idbDelete, idbGet, idbPut } from "../batch/store";

/** The IndexedDB object store every API key lives in (RULE 20: never localStorage). */
export const SECRET_STORE = "secrets";

/** A vault over `lib/keyvault`'s rules, reading and writing through IndexedDB. */
export function createIdbKeyVault(slot: string): KeyVault {
  const storage: VaultStorage = {
    get: (store, key) => idbGet<unknown>(store, key),
    put: (store, key, value) => idbPut(store, key, value),
    del: (store, key) => idbDelete(store, key),
  };
  return createKeyVault(storage, SECRET_STORE, slot);
}
