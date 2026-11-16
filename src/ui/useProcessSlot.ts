// useProcessSlot.ts — the one hook every process bar uses to read its slot
// (lib/processslot). Kept apart from the store so the store stays React-free.
import { useSyncExternalStore } from "react";
import { subscribeProcess, type ProcessSlot } from "../lib/processslot";

/** The slot's current snapshot; null when nothing is running or finished. */
export function useProcessSlot<T>(slot: ProcessSlot<T>): T | null {
  return useSyncExternalStore(
    (listener) => subscribeProcess(slot, listener),
    () => slot.value,
  );
}
