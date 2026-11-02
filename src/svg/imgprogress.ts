// Image-only process state: no provider credentials, bytes or SVG counters.
// The store itself is lib/processslot, shared with the register bars (2026-11-02).
import { createSlotMap, publishProcess } from "../lib/processslot";
import type { SvgRefs } from "./types";
export interface ImageProcess {
  id: string; total: number; requests: number; request: number;
  saved: number; failed: number; discarded: number; stopping: boolean;
  phase: "running" | "saving" | "review" | "complete" | "stopped";
}
const slotOf = createSlotMap<ImageProcess>();

export function imageProgressStore(refs: SvgRefs) {
  return slotOf(refs);
}
export function startImageProcess(refs: SvgRefs, spec: Pick<ImageProcess, "id" | "total" | "requests">): void {
  publishProcess(imageProgressStore(refs), {
    ...spec, request: 0, saved: 0, failed: 0, discarded: 0, stopping: false, phase: "running",
  });
}
export function updateImageProcess(refs: SvgRefs, id: string, patch: Partial<Omit<ImageProcess, "id">>): void {
  const store = imageProgressStore(refs);
  if (store.value?.id !== id) return;
  publishProcess(store, { ...store.value, ...patch });
}
export function stopImageProcess(refs: SvgRefs): void {
  const current = imageProgressStore(refs).value;
  if (current) updateImageProcess(refs, current.id, { stopping: true });
}
export function finishImageProcess(refs: SvgRefs, id: string, stopped: boolean): void {
  updateImageProcess(refs, id, { phase: stopped ? "stopped" : "complete" });
}
