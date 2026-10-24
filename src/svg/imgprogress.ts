// Image-only process state: no provider credentials, bytes or SVG counters.
import type { SvgRefs } from "./types";
export interface ImageProcess {
  id: string; total: number; requests: number; request: number;
  saved: number; failed: number; discarded: number; stopping: boolean;
  phase: "running" | "saving" | "review" | "complete" | "stopped";
}
interface Store { value: ImageProcess | null; listeners: Set<() => void> }
const stores = new WeakMap<SvgRefs, Store>();
export function imageProgressStore(refs: SvgRefs): Store {
  let store = stores.get(refs);
  if (!store) { store = { value: null, listeners: new Set() }; stores.set(refs, store); }
  return store;
}
export function startImageProcess(refs: SvgRefs, spec: Pick<ImageProcess, "id" | "total" | "requests">): void {
  const store = imageProgressStore(refs);
  store.value = { ...spec, request: 0, saved: 0, failed: 0, discarded: 0, stopping: false, phase: "running" };
  for (const listener of store.listeners) listener();
}
export function updateImageProcess(refs: SvgRefs, id: string, patch: Partial<Omit<ImageProcess, "id">>): void {
  const store = imageProgressStore(refs);
  if (store.value?.id !== id) return;
  store.value = { ...store.value, ...patch };
  for (const listener of store.listeners) listener();
}
export function stopImageProcess(refs: SvgRefs): void {
  const current = imageProgressStore(refs).value;
  if (current) updateImageProcess(refs, current.id, { stopping: true });
}
export function finishImageProcess(refs: SvgRefs, id: string, stopped: boolean): void {
  updateImageProcess(refs, id, { phase: stopped ? "stopped" : "complete" });
}
