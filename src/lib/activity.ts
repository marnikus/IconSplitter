// activity.ts — the app-wide list of long waits that are NOT jobs (2026-11-03):
// folder scans, list loading, imports, renders, saves. While one runs, the
// shell shows a bar saying what the page is busy with (ui/ActivityBars); the
// moment it ends, its bar is gone — there is nothing to review or dismiss.
// Jobs with results (generation, uploads, splits) keep their own job bars
// (ui/ProcessProgressBar), which stay until the user closes them.
// Pure: no React, no timers; counts are read from the label when it has them.

export interface Activity {
  id: string;
  /** Which tab or feature it belongs to — also its bar's test-id. */
  source: string;
  label: string;
  /** null = no count known: the bar is indeterminate. */
  done: number | null;
  total: number | null;
}

export interface ActivityHandle {
  /** New wording (and counts, when the text has "3/10" or "3 of 10"). */
  update: (label: string) => void;
  /** The work is over: the bar closes. Safe to call twice. */
  end: () => void;
}

const COUNTS = /(\d+)\s*(?:\/|of)\s*(\d+)/;

/** "Rendering 3/10…" → 3 of 10; a label without counts → indeterminate. */
export function activityProgress(label: string): { done: number | null; total: number | null } {
  const match = COUNTS.exec(label);
  if (match === null) return { done: null, total: null };
  const total = Number(match[2]);
  if (total <= 0) return { done: null, total: null };
  return { done: Math.min(Number(match[1]), total), total };
}

let items: Activity[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function publish(next: Activity[]): void {
  items = next;
  for (const listener of listeners) listener();
}

/** The one list the shell renders; subscribe/list fit React's external-store hook. */
export const activities = {
  list: (): readonly Activity[] => items,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  begin(source: string, label: string): string {
    seq += 1;
    const id = `activity-${seq}`;
    publish([...items, { id, source, label, ...activityProgress(label) }]);
    return id;
  },
  update(id: string, label: string): void {
    if (items.some((a) => a.id === id)) publish(items.map((a) => (a.id === id ? { ...a, label, ...activityProgress(label) } : a)));
  },
  end(id: string): void {
    if (items.some((a) => a.id === id)) publish(items.filter((a) => a.id !== id));
  },
  /** Tests only: forget everything. */
  clear: (): void => publish([]),
};

export function beginActivity(source: string, label: string): ActivityHandle {
  const id = activities.begin(source, label);
  return { update: (next) => activities.update(id, next), end: () => activities.end(id) };
}

/** Runs slow work under a bar that closes when it settles — also when it throws. */
export async function withActivity<T>(source: string, label: string, work: () => Promise<T>): Promise<T> {
  const handle = beginActivity(source, label);
  try {
    return await work();
  } finally {
    handle.end();
  }
}
