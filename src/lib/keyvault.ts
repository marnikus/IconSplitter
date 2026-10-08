// keyvault.ts — ONE set of rules for keeping an API key on this device
// (RULE 10/20). Both tabs' keystores are thin wrappers over it, so "the key
// survived" means the same thing everywhere.
//
// The rules, each one a field bug this module exists to prevent:
//   * a SAVE with an empty field never destroys a stored key — clearing is its
//     own deliberate action (`clear`), and an empty save reports "empty" and
//     touches nothing;
//   * a FAILED READ is never reported as "no key": the answer says where the
//     key came from (`device` / `session`) or that the device's storage could
//     not be read at all (`unreadable`), so the UI can stop asking the user to
//     paste a key it already holds;
//   * the key never leaves IndexedDB: not into localStorage, a settings payload
//     or a log — this module has no such path at all;
//   * a write that storage refused keeps the key usable for the session, and
//     says so (`session`).

/** Where the key that is in hand came from. */
export type KeySource = "device" | "session" | "unreadable" | "none";

export interface KeyRead {
  key: string | null;
  source: KeySource;
}

/** What a save really achieved. */
export type KeySaveOutcome = "device" | "session" | "empty";

/** The storage this vault writes through (IndexedDB in the app, a fake in tests). */
export interface VaultStorage {
  get(store: string, key: string): Promise<unknown>;
  put(store: string, key: string, value: unknown): Promise<boolean>;
  del(store: string, key: string): Promise<boolean>;
}

export interface KeyVault {
  /** The key in hand, and where it came from — never a bare null on failure. */
  read(): Promise<KeyRead>;
  /** The trimmed key, or null when there is none available right now. */
  load(): Promise<string | null>;
  save(raw: string): Promise<KeySaveOutcome>;
  clear(): Promise<void>;
  has(): Promise<boolean>;
}

/** The shape a stored secret has; anything else is treated as absent. */
const ENVELOPE = "key";

function keyOf(stored: unknown): string | null {
  if (typeof stored !== "object" || stored === null) return null;
  const value = (stored as Record<string, unknown>)[ENVELOPE];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * One vault: the storage given, plus the session-only copy a refused write
 * leaves behind (a browser in private mode, a blocked upgrade, a file:// page).
 */
/** A write storage refused is reported, not thrown: the session copy stands in. */
async function putKey(storage: VaultStorage, store: string, slot: string, key: string): Promise<boolean> {
  try {
    return await storage.put(store, slot, { [ENVELOPE]: key });
  } catch {
    return false;
  }
}

/** A delete that failed is fine: the key is already out of the page. */
async function dropKey(storage: VaultStorage, store: string, slot: string): Promise<void> {
  try {
    await storage.del(store, slot);
  } catch {
    // nothing to do
  }
}

async function readKey(storage: VaultStorage, store: string, slot: string, session: string | null): Promise<KeyRead> {
  try {
    const stored = keyOf(await storage.get(store, slot));
    if (stored !== null) return { key: stored, source: "device" };
    // A readable store with nothing in it: the session copy is the honest
    // answer only when a write in THIS page failed to persist.
    return session === null ? { key: null, source: "none" } : { key: session, source: "session" };
  } catch {
    // Unreadable storage is not an empty one: say so, never "no key".
    return session === null ? { key: null, source: "unreadable" } : { key: session, source: "session" };
  }
}

/**
 * One vault: the storage given, plus the session-only copy a refused write
 * leaves behind (a browser in private mode, a blocked upgrade, a file:// page).
 */
export function createKeyVault(storage: VaultStorage, store: string, slot: string): KeyVault {
  let session: string | null = null;

  const read = () => readKey(storage, store, slot, session);

  const save = async (raw: string): Promise<KeySaveOutcome> => {
    const key = raw.trim();
    if (key === "") return "empty"; // never a wipe: clearing is `clear`
    session = key;
    return (await putKey(storage, store, slot, key)) ? "device" : "session";
  };

  const clear = async (): Promise<void> => {
    session = null;
    await dropKey(storage, store, slot);
  };

  return { read, load: async () => (await read()).key, save, clear, has: async () => (await read()).key !== null };
}
