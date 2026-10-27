// credvault.ts — local-only FTP/FTPS credential vault (RULE 10/20).
// Username and password live exclusively in IndexedDB `secrets` (with a
// session-only fallback when storage is blocked), never in localStorage,
// presets, sidecars or logs, and are never expanded back into UI plaintext.

import { isRecord } from "../isrecord";
import type { KeySaveOutcome, KeySource, VaultStorage } from "../keyvault";

export interface FtpCredentials {
  username: string;
  password: string;
}

export interface CredRead {
  creds: FtpCredentials | null;
  source: KeySource;
}

export interface CredVault {
  read(): Promise<CredRead>;
  load(): Promise<FtpCredentials | null>;
  save(username: string, password: string): Promise<KeySaveOutcome>;
  clear(): Promise<void>;
  has(): Promise<boolean>;
}

const MASK = "••••••••";

export function credSlotOf(presetId: string): string {
  return `stock-ftp-cred:${presetId.trim()}`;
}

export function redactCredentials(text: string, creds?: FtpCredentials | null): string {
  if (!creds) return text;
  let safe = text;
  for (const part of [creds.password, creds.username]) {
    const token = part.trim();
    if (token !== "") safe = safe.split(token).join(MASK);
  }
  return safe;
}

function parseStored(raw: unknown): FtpCredentials | null {
  if (!isRecord(raw)) return null;
  const username = typeof raw.username === "string" ? raw.username.trim() : "";
  const password = typeof raw.password === "string" ? raw.password : "";
  return username !== "" && password !== "" ? { username, password } : null;
}

async function putCreds(storage: VaultStorage, store: string, slot: string, creds: FtpCredentials): Promise<boolean> {
  try {
    return await storage.put(store, slot, creds);
  } catch {
    return false;
  }
}

async function dropCreds(storage: VaultStorage, store: string, slot: string): Promise<void> {
  try {
    await storage.del(store, slot);
  } catch {
    // already cleared from session memory
  }
}

async function readCreds(
  storage: VaultStorage,
  store: string,
  slot: string,
  session: FtpCredentials | null,
): Promise<CredRead> {
  try {
    const stored = parseStored(await storage.get(store, slot));
    if (stored !== null) return { creds: stored, source: "device" };
    return session === null ? { creds: null, source: "none" } : { creds: session, source: "session" };
  } catch {
    return session === null ? { creds: null, source: "unreadable" } : { creds: session, source: "session" };
  }
}

export function createCredVault(storage: VaultStorage, store: string, slot: string): CredVault {
  let session: FtpCredentials | null = null;
  const read = () => readCreds(storage, store, slot, session);

  const save = async (rawUser: string, rawPass: string): Promise<KeySaveOutcome> => {
    const username = rawUser.trim();
    if (username === "" || rawPass === "") return "empty";
    const creds: FtpCredentials = { username, password: rawPass };
    session = creds;
    return (await putCreds(storage, store, slot, creds)) ? "device" : "session";
  };

  const clear = async (): Promise<void> => {
    session = null;
    await dropCreds(storage, store, slot);
  };

  return {
    read,
    load: async () => (await read()).creds,
    save,
    clear,
    has: async () => (await read()).creds !== null,
  };
}
