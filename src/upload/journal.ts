// journal.ts — the in-flight metadata-request journal (design §3.2, I-20).
// A Gemini request that was in flight when the app closed is OUTCOME-UNKNOWN:
// it is journalled, and on restart every still-open entry is reported as
// `interrupted` — never auto-resent (no duplicate paid submission). The
// journal is deliberately dumb (begin/end/pending/clear); the caller decides
// what "pending" means after a restart.

export interface JournalEntry {
  rowId: string;
  startedAt: number;
  requestId: string | null;
}

export interface MetadataJournal {
  begin(entry: JournalEntry): void;
  end(rowId: string): void;
  /** Entries still in flight (this session or a previous one). */
  pending(): JournalEntry[];
  clear(): void;
}

/** The in-memory journal (tests, or a session that wants no persistence). */
export function createMemoryJournal(): MetadataJournal {
  const open = new Map<string, JournalEntry>();
  return {
    begin: (entry) => { open.set(entry.rowId, entry); },
    end: (rowId) => { open.delete(rowId); },
    pending: () => [...open.values()],
    clear: () => { open.clear(); },
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const JOURNAL_KEY = "iconSplitter.upload.journal.v1";

/**
 * The localStorage-backed journal. Entries survive a restart, which is the
 * point: a still-open entry after a restart is an interrupted request.
 */
export function createStoredJournal(storage: StorageLike = localStorage, key = JOURNAL_KEY): MetadataJournal {
  const read = (): JournalEntry[] => {
    try {
      const raw = JSON.parse(storage.getItem(key) ?? "[]");
      return Array.isArray(raw) ? raw.filter(isEntry) : [];
    } catch {
      return [];
    }
  };
  const write = (entries: JournalEntry[]): void => {
    try {
      storage.setItem(key, JSON.stringify(entries));
    } catch {
      // a full/unavailable store must never break a generation
    }
  };
  return {
    begin: (entry) => write([...read().filter((e) => e.rowId !== entry.rowId), entry]),
    end: (rowId) => write(read().filter((e) => e.rowId !== rowId)),
    pending: read,
    clear: () => { try { storage.removeItem(key); } catch { /* see write */ } },
  };
}

function isEntry(value: unknown): value is JournalEntry {
  return typeof value === "object" && value !== null
    && typeof (value as JournalEntry).rowId === "string"
    && typeof (value as JournalEntry).startedAt === "number";
}
