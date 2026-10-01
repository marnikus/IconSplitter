// store.ts — a minimal observable store (RULE 10/24, request §9). Some state
// must outlive a mounted panel (a hidden tab must not keep a stale copy) and
// must be readable from outside React (an undo applier runs before the tab is
// re-rendered). One writer per store; components read through `useStore`.

import { useSyncExternalStore } from "react";

export interface Store<T> {
  get(): T;
  set(update: (prev: T) => T): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (update) => {
      const next = update(value);
      if (next === value) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Subscribes a component to the whole store (stable snapshot between writes). */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.get(),
    () => store.get(),
  );
}
