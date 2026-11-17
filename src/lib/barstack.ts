// barstack.ts — which progress bar is on top (2026-11-09). Every bar (activity
// or job) registers here while it is mounted. The OLDEST registered bar is the
// main one — the longest-running process; the others stay hidden and are
// reachable with ▲/▼ on the main bar. A user's pick holds until that bar
// closes, then the oldest takes over again. Pure: no React, no timers.

export interface BarEntry {
  key: string;
  title: string;
  /** null = indeterminate (no count known). */
  percent: number | null;
}

export interface BarStackView {
  /** Oldest first. */
  list: readonly BarEntry[];
  /** The key of the bar that is shown, or null when there is none. */
  main: string | null;
}

let list: BarEntry[] = [];
let picked: string | null = null;
let current: BarStackView = { list, main: null };
const listeners = new Set<() => void>();

function publish(): void {
  if (picked !== null && !list.some((e) => e.key === picked)) picked = null;
  current = { list, main: picked ?? list[0]?.key ?? null };
  for (const listener of listeners) listener();
}

export const barStack = {
  view: (): BarStackView => current,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** A bar appeared: it is the newest, so it queues behind the others. */
  add(key: string): void {
    if (list.some((e) => e.key === key)) return;
    list = [...list, { key, title: "", percent: null }];
    publish();
  },
  update(key: string, title: string, percent: number | null): void {
    const at = list.find((e) => e.key === key);
    if (!at || (at.title === title && at.percent === percent)) return;
    list = list.map((e) => (e.key === key ? { key, title, percent } : e));
    publish();
  },
  remove(key: string): void {
    if (!list.some((e) => e.key === key)) return;
    list = list.filter((e) => e.key !== key);
    publish();
  },
  /** Show this bar until it closes. */
  select(key: string): void {
    if (!list.some((e) => e.key === key) || current.main === key) return;
    picked = key;
    publish();
  },
  /** The neighbour of `key` (+1 next, -1 previous), wrapping around. */
  step(key: string, dir: 1 | -1): string {
    const at = list.findIndex((e) => e.key === key);
    if (at < 0 || list.length === 0) return key;
    return list[(at + dir + list.length) % list.length].key;
  },
  /** Tests only: forget everything. */
  clear(): void {
    list = [];
    picked = null;
    publish();
  },
};
