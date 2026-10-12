// previewstate.ts — one row's preview state, kept OUT of React's render path.
// A session can touch 1000 rows; re-rendering the list per finished row would make
// the tab the bottleneck the design forbids. So state lives in a small store the
// strip subscribes to per row (useSyncExternalStore), and each row re-renders only
// itself (design D6/D9). Pure: no IO, no React import.

export type RowState = "pending" | "reading" | "ready" | "capped" | "empty" | "error" | "stopped";

export interface RowPreview {
  state: RowState;
  /** One URL per chunk canvas, in order. */
  urls: string[];
  /** Icons the strip actually shows. */
  count: number;
  /** Icons the sheet has at this merge distance (may exceed `count`, see `capped`). */
  icons: number;
  /** True when the row has more icons than a strip shows (D7 — said in text, not silently). */
  capped: boolean;
  message: string;
}

export const PENDING: RowPreview = { state: "pending", urls: [], count: 0, icons: 0, capped: false, message: "" };

export interface RowStates {
  get(relPath: string): RowPreview;
  set(relPath: string, value: RowPreview): void;
  subscribe(relPath: string, listener: () => void): () => void;
  clear(): void;
}

export function createRowStates(): RowStates {
  const values = new Map<string, RowPreview>();
  const listeners = new Map<string, Set<() => void>>();
  const notify = (relPath: string) => {
    for (const l of listeners.get(relPath) ?? []) l();
  };
  return {
    get: (relPath) => values.get(relPath) ?? PENDING,
    set(relPath, value) {
      values.set(relPath, value);
      notify(relPath);
    },
    subscribe(relPath, listener) {
      const set = listeners.get(relPath) ?? new Set();
      listeners.set(relPath, set);
      set.add(listener);
      return () => set.delete(listener);
    },
    clear() {
      const keys = new Set(values.keys());
      for (const key of keys) {
        values.set(key, PENDING);
        notify(key);
      }
      values.clear();
    },
  };
}
