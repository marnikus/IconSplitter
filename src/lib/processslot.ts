// processslot.ts — the tiny store behind every process bar (SVG images 2026-10-19,
// register passes 2026-11-02). One owner object (usually the tab's refs) owns one
// slot; a bar subscribes and renders whatever is published. Pure: no React, no
// timers — `ui/useProcessSlot` turns a slot into a hook, and callers publish only
// immutable snapshots.

export interface ProcessSlot<T> {
  value: T | null;
  listeners: Set<() => void>;
}

export function createProcessSlot<T>(): ProcessSlot<T> {
  return { value: null, listeners: new Set() };
}

/** Publishes a new snapshot and wakes every subscriber — null clears the slot. */
export function publishProcess<T>(slot: ProcessSlot<T>, value: T | null): void {
  slot.value = value;
  for (const listener of slot.listeners) listener();
}

/** Subscribes to a slot; the returned function unsubscribes. */
export function subscribeProcess<T>(slot: ProcessSlot<T>, listener: () => void): () => void {
  slot.listeners.add(listener);
  return () => { slot.listeners.delete(listener); };
}

/** One slot per owner, created on first use — a tab that is remounted keeps its bar. */
export function createSlotMap<T>(): (owner: object) => ProcessSlot<T> {
  const slots = new WeakMap<object, ProcessSlot<T>>();
  return (owner: object) => {
    let slot = slots.get(owner);
    if (slot === undefined) { slot = createProcessSlot<T>(); slots.set(owner, slot); }
    return slot;
  };
}
