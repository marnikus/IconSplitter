// model.ts — state model, reducer & mutable refs for the "Upload" tab.

import type { DirHandleLike } from "../lib/fs";
import { SCAN_IDLE, type ScanSeq } from "../lib/scanseq";
import type { StockDiscovery } from "../lib/stockupload/discovery";
import type { StockUploadPlan } from "../lib/stockupload/plan";
import type { ExportedItem } from "../lib/stockupload/types";
import type { FtpTestStatus } from "./ftpactions";
import { loadStockHistory } from "./historystore";
import { recoverInterruptedUploads } from "./journal";
import { loadStockPrefs, saveStockPrefs, type StockUploadPrefs } from "./prefsstore";
import { loadStockPresets } from "./presetstore";
import { ALL_STOCK_FILTER, type StockListFilter, type StockMetaDraft, type StockUploadSort } from "./rowlist";
import type { UploadProgressStep } from "./runupload";

export type StockDialog = null | { kind: "rowBadges" } | { kind: "confirmUpload"; plan: StockUploadPlan };

export interface StockUploadModel {
  rootName: string;
  rootToken: number;
  discovery: StockDiscovery | null;
  busy: string | null;
  prefs: StockUploadPrefs;
  filter: StockListFilter;
  sort: StockUploadSort;
  dialog: StockDialog;
  toast: { text: string; err: boolean } | null;
  drafts: Record<string, StockMetaDraft>;
  credSaved: Record<string, boolean>;
  testStatus: FtpTestStatus;
  uploading: boolean;
  progress: UploadProgressStep | null;
}

export type StockModelAction =
  | { type: "patch"; patch: Partial<StockUploadModel> }
  | { type: "prefs"; patch: Partial<StockUploadPrefs> }
  | { type: "filter"; patch: Partial<StockListFilter> }
  | { type: "cred"; id: string; saved: boolean }
  | { type: "draft"; id: string; draft: StockMetaDraft }
  | { type: "replace-item"; item: ExportedItem };

export interface StockRefs {
  root: { current: DirHandleLike | null };
  scan: { seq: ScanSeq; scanKey: { current: string | null } };
  abort: { current: AbortController | null };
  toastTimer: { current: ReturnType<typeof setTimeout> | null };
}

export function createStockRefs(): StockRefs {
  return {
    root: { current: null },
    scan: { seq: SCAN_IDLE, scanKey: { current: null } },
    abort: { current: null },
    toastTimer: { current: null },
  };
}

export function reduceStockModel(state: StockUploadModel, a: StockModelAction): StockUploadModel {
  switch (a.type) {
    case "patch": return { ...state, ...a.patch };
    case "prefs": {
      const prefs = { ...state.prefs, ...a.patch };
      saveStockPrefs(prefs);
      return { ...state, prefs };
    }
    case "filter": return { ...state, filter: { ...state.filter, ...a.patch } };
    case "cred": return { ...state, credSaved: { ...state.credSaved, [a.id]: a.saved } };
    case "draft": return { ...state, drafts: { ...state.drafts, [a.id]: a.draft } };
    case "replace-item": {
      if (!state.discovery) return state;
      const items = state.discovery.items.map((it) => (it.id === a.item.id ? a.item : it));
      return { ...state, discovery: { ...state.discovery, items } };
    }
  }
}

export function initialStockModel(): StockUploadModel {
  loadStockPresets();
  loadStockHistory();
  recoverInterruptedUploads();
  return {
    rootName: "", rootToken: 0, discovery: null, busy: null,
    prefs: loadStockPrefs(), filter: ALL_STOCK_FILTER, sort: "path",
    dialog: null, toast: null, drafts: {}, credSaved: {},
    testStatus: { busy: false, ok: null, note: "", certSha256: null },
    uploading: false, progress: null,
  };
}
