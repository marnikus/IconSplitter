// reducer.ts owns batch review state: items, selection, settings, folders.
// Three sub-reducers combined by domain; selection never holds missing items.

import type { FsDirHandle } from "./fs";
import type { BatchSettings } from "./presets";
import type { ScannedFile } from "./scan";
import type { TrackState } from "./status";

export interface BatchItem {
  relPath: string;
  dir: string;
  name: string;
  size: number;
  mtime: number;
  state: TrackState;
  note?: string;
  referenceName: string;
  referenceFound: boolean;
  thumbUrl: string | null;
  source: ScannedFile | null;
  ref?: ScannedFile;
}

export type ItemPatch = Partial<Pick<BatchItem, "state" | "note" | "size" | "mtime">>;

export interface ReviewSlice {
  items: BatchItem[];
  selected: string[];
}

export interface FolderState {
  source: FsDirHandle | null;
  sourceName: string;
  dest: FsDirHandle | null;
  destName: string;
  useCustomDest: boolean;
}

export interface BatchState {
  items: BatchItem[];
  selected: string[];
  settings: BatchSettings;
  folders: FolderState;
}

export type BatchAction =
  | { type: "scan-applied"; items: BatchItem[]; selected: string[] }
  | { type: "toggle"; relPath: string }
  | { type: "select-all" }
  | { type: "deselect-all" }
  | { type: "item-patched"; relPath: string; patch: ItemPatch }
  | { type: "settings-set"; settings: BatchSettings }
  | { type: "source-set"; handle: FsDirHandle; name: string }
  | { type: "dest-set"; handle: FsDirHandle; name: string }
  | { type: "dest-mode"; useCustom: boolean }
  | { type: "folders-meta"; sourceName: string; destName: string; useCustomDest: boolean };

export function isEligible(i: BatchItem): boolean {
  return i.state !== "missing" && i.state !== "deleted";
}

export function eligibleRelPaths(items: BatchItem[]): string[] {
  return items.filter(isEligible).map((i) => i.relPath);
}

export function selectedItems(s: BatchState): BatchItem[] {
  const set = new Set(s.selected);
  return s.items.filter((i) => set.has(i.relPath));
}

function toggleSelect(s: ReviewSlice, relPath: string): ReviewSlice {
  if (s.selected.includes(relPath)) return { ...s, selected: s.selected.filter((r) => r !== relPath) };
  const item = s.items.find((i) => i.relPath === relPath);
  if (!item || !isEligible(item)) return s;
  return { ...s, selected: [...s.selected, relPath] };
}

function patchItem(s: ReviewSlice, relPath: string, patch: ItemPatch): ReviewSlice {
  const items = s.items.map((i) => (i.relPath === relPath ? { ...i, ...patch } : i));
  const fixed = items.find((i) => i.relPath === relPath);
  const drop = fixed !== undefined && !isEligible(fixed);
  return { items, selected: drop ? s.selected.filter((r) => r !== relPath) : s.selected };
}

function reviewReducer(s: ReviewSlice, a: BatchAction): ReviewSlice {
  switch (a.type) {
    case "scan-applied": {
      const keep = new Set(eligibleRelPaths(a.items));
      return { items: a.items, selected: a.selected.filter((r) => keep.has(r)) };
    }
    case "toggle":
      return toggleSelect(s, a.relPath);
    case "select-all":
      return { ...s, selected: eligibleRelPaths(s.items) };
    case "deselect-all":
      return { ...s, selected: [] };
    case "item-patched":
      return patchItem(s, a.relPath, a.patch);
    default:
      return s;
  }
}

function settingsReducer(s: BatchSettings, a: BatchAction): BatchSettings {
  switch (a.type) {
    case "settings-set":
      return a.settings;
    default:
      return s;
  }
}

function foldersReducer(s: FolderState, a: BatchAction): FolderState {
  switch (a.type) {
    case "source-set":
      return { ...s, source: a.handle, sourceName: a.name };
    case "dest-set":
      return { ...s, dest: a.handle, destName: a.name };
    case "dest-mode":
      return { ...s, useCustomDest: a.useCustom };
    case "folders-meta":
      return { ...s, sourceName: a.sourceName, destName: a.destName, useCustomDest: a.useCustomDest };
    default:
      return s;
  }
}

export function batchReducer(s: BatchState, a: BatchAction): BatchState {
  const review = reviewReducer({ items: s.items, selected: s.selected }, a);
  return { items: review.items, selected: review.selected, settings: settingsReducer(s.settings, a), folders: foldersReducer(s.folders, a) };
}

export function initBatch(settings: BatchSettings): BatchState {
  return { items: [], selected: [], settings, folders: { source: null, sourceName: "", dest: null, destName: "", useCustomDest: false } };
}
