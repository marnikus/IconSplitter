// api.ts — the shared return type of useReview, so every panel component can
// take the pieces it needs without importing the hook itself (and without a
// circular import back into useReview.ts).

import type { Decision, DecisionRecord } from "../lib/reviewfile";
import type { ReviewItem } from "../lib/reviewmerge";
import type { QueryPatch, ReviewQuery } from "../lib/reviewquery";
import type { ToastMsg } from "../ui/Overlays";
import type { Thumbs } from "../ui/useThumbnails";
import type { CompareDetail } from "./sides";

/** What a rescan found, relative to the previous scan (design status bar). */
export interface ScanDelta {
  added: number;
  renamed: number;
  removed: number;
  changed: number;
  kept: number;
}

export interface ReviewViewState {
  rootName: string;
  items: ReviewItem[];
  orphans: DecisionRecord[];
  scanAt: number;
  counts: { total: number; pending: number; approved: number; declined: number };
  showing: number;
  search: string;
  query: ReviewQuery;
  busy: string | null;
  toast: ToastMsg | null;
  fileStatus: "idle" | "ok" | "missing" | "corrupt" | "write-error";
  fileNote: string | null;
  lastScanAt: number | null;
  delta: ScanDelta | null;
  folders: number;
  unsaved: number;
  watcher: boolean;
  zoom: "fit" | "100";
  autoNext: boolean;
  selectedId: string | null;
}

export interface ReviewApi {
  s: ReviewViewState;
  view: ReviewItem[];
  item: ReviewItem | null;
  detail: CompareDetail;
  thumbs: Thumbs;
  supported: boolean;
  rescan: (mode: "manual" | "auto" | "silent") => void;
  pickRoot: () => void;
  decide: (id: string, decision: Decision) => void;
  retry: () => void;
  resetFile: () => void;
  openItem: (id: string | null) => void;
  step: (delta: number) => void;
  patch: (patch: QueryPatch) => void;
  clearFilters: () => void;
  openPath: (relPath: string) => void;
  toggleWatcher: () => void;
  toggleZoom: () => void;
  setAutoNext: (on: boolean) => void;
}
