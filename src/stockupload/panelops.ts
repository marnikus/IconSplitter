// panelops.ts — folder pick/rescan, metadata accept/copy, and FTPS batch runner ops.

import { useMemo, useRef } from "react";
import { copyFolderText } from "../lib/copypath";
import { probeBridgeFtps } from "../lib/stockupload/bridgeclient";
import { buildGettyEspCsv } from "../lib/stockupload/gettycsv";
import { buildStockUploadPlan, type StockUploadPlan } from "../lib/stockupload/plan";
import type { ExportedItem, StockPresetState } from "../lib/stockupload/types";
import type { IconMetadata } from "../lib/upload/meta";
import { pickFolderFor } from "../ui/pickroot";
import { retryCapture } from "../ui/rootcapture";
import { readFtpCredentials } from "./keystore";
import { saveExportedMetadata } from "./metaembed";
import type { StockModelAction, StockRefs, StockUploadModel } from "./model";
import type { StockUploadPrefs } from "./prefsstore";
import { ALL_STOCK_FILTER, initialMetaDraft, type StockListFilter, type StockMetaDraft, type StockUploadSort } from "./rowlist";
import { executeStockUploadBatch, type UploadBatchSummary } from "./runupload";
import { rememberStockRoot } from "./scan";

export interface OpsCtx {
  model: StockUploadModel;
  items: ExportedItem[];
  checked: string[];
  presetState: StockPresetState;
  r: StockRefs;
  dispatch: (a: StockModelAction) => void;
  say: (msg: string, err?: boolean) => void;
  runScan: (audible?: boolean) => void;
}

export interface StockPanelOps {
  chooseRoot: () => void;
  rescan: () => void;
  openLocation: (id: string) => void;
  setPrefs: (patch: Partial<StockUploadPrefs>) => void;
  setFilter: (patch: Partial<StockListFilter>) => void;
  setSort: (sort: StockUploadSort) => void;
  clearFilters: () => void;
  openRowBadges: () => void;
  closeDialog: () => void;
  metaDraftOf: (item: ExportedItem) => StockMetaDraft;
  editMeta: (item: ExportedItem, patch: Partial<IconMetadata>) => void;
  acceptMeta: (item: ExportedItem) => void;
  copyMeta: (item: ExportedItem, field: "title" | "description" | "tags") => void;
  startUploadFlow: () => void;
  confirmUpload: () => void;
  cancelUpload: () => void;
  downloadGettyCsv: () => void;
}

async function performChooseRoot(c: OpsCtx): Promise<void> {
  const picked = await pickFolderFor((h) => {
    c.r.root.current = h;
    c.r.scan.scanKey.current = null;
    c.dispatch({ type: "patch", patch: { rootName: h.name } });
    void rememberStockRoot(h);
  });
  if (!picked) { c.say("Folder picking needs Chrome or Edge — or was cancelled", true); return; }
  c.runScan(true);
}

async function performAcceptMeta(c: OpsCtx, item: ExportedItem): Promise<void> {
  const root = c.r.root.current;
  if (!root) { c.say("Open a folder first", true); return; }
  const cur = c.model.drafts[item.id] ?? initialMetaDraft(item);
  const res = await saveExportedMetadata(root, item, cur.metadata);
  if (!res.ok) {
    c.dispatch({ type: "draft", id: item.id, draft: { ...cur, state: "invalid", validation: res.validation, detail: res.reason } });
    c.say(res.reason, true);
    return;
  }
  c.dispatch({ type: "replace-item", item: res.item });
  const detail = "Saved & embedded into export/ files";
  c.dispatch({ type: "draft", id: item.id, draft: { metadata: res.metadata, edited: false, state: "accepted", validation: res.validation, detail } });
  c.say(`Metadata embedded into ${item.stem}`);
}

function summarizeBatch(summary: UploadBatchSummary, targetCount: number): { text: string; err: boolean } {
  if (summary.cancelled) return { text: `Upload cancelled (${summary.uploadedFiles} file(s) sent)`, err: false };
  if (summary.failedFiles > 0) {
    return { text: `Uploaded ${summary.uploadedFiles} file(s), ${summary.failedFiles} failed: ${summary.lastError ?? ""}`, err: true };
  }
  if (summary.stagedDir) {
    return {
      text: `Staged ${summary.uploadedFiles} file(s) + getty_esp_metadata.csv into ${summary.stagedDir}/ — drag into esp.gettyimages.com or DeepMeta 4`,
      err: false,
    };
  }
  return { text: `Uploaded ${summary.uploadedFiles} file(s) across ${targetCount} stock site(s)`, err: false };
}

async function performConfirmUpload(c: OpsCtx, plan: StockUploadPlan): Promise<void> {
  if (!c.r.root.current) return;
  const networkTargets = plan.targets.filter((t) => t.protocol !== "esp-batch");
  c.dispatch({ type: "patch", patch: { dialog: null, uploading: true, progress: { done: 0, total: plan.tasks.length, label: "Preparing upload batch…" } } });
  if (networkTargets.length > 0) {
    const probe = await probeBridgeFtps(c.model.prefs.bridgeUrl, globalThis.fetch, {
      requireSftp: networkTargets.some((t) => t.protocol === "sftp"),
      requireEsp: networkTargets.some((t) => t.protocol === "esp-https"),
    });
    if (!probe.ok) {
      c.dispatch({ type: "patch", patch: { uploading: false, progress: null } });
      c.say(probe.reason, true);
      return;
    }
  }
  const controller = new AbortController();
  c.r.abort.current = controller;
  const summary = await executeStockUploadBatch(plan, {
    root: c.r.root.current,
    bridgeUrl: c.model.prefs.bridgeUrl,
    signal: controller.signal,
    loadCreds: readFtpCredentials,
    onProgress: (progress) => c.dispatch({ type: "patch", patch: { progress } }),
    onCertWarning: (_id, sha256) => c.dispatch({ type: "patch", patch: { testStatus: { busy: false, ok: false, note: "Server certificate requires trust", certSha256: sha256 } } }),
  });
  c.r.abort.current = null;
  c.dispatch({ type: "patch", patch: { uploading: false, progress: null } });
  const msg = summarizeBatch(summary, plan.targets.length);
  c.say(msg.text, msg.err);
}

function performStartUpload(c: OpsCtx): void {
  if (c.model.uploading) { c.say("An upload batch is already running", true); return; }
  const plan = buildStockUploadPlan({
    items: c.items, checkedIds: c.checked, presets: c.presetState.presets,
    checkedTargets: c.presetState.checkedTargets, formats: c.presetState.formats,
  });
  if (plan.preflightErrors.length > 0) { c.say(plan.preflightErrors[0], true); return; }
  c.dispatch({ type: "patch", patch: { dialog: { kind: "confirmUpload", plan } } });
}

function triggerGettyCsvDownload(c: OpsCtx): void {
  const checkedSet = new Set(c.checked);
  const rows = checkedSet.size > 0 ? c.items.filter((it) => checkedSet.has(it.id)) : c.items;
  if (rows.length === 0) { c.say("Open a folder with exported items first", true); return; }
  const csv = buildGettyEspCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "getty-esp-metadata.csv";
  a.click();
  URL.revokeObjectURL(url);
  c.say(`Exported Getty ESP CSV for ${rows.length} item(s)`);
}

function buildMetaAndUploadOps(ref: { current: OpsCtx }): Pick<
  StockPanelOps,
  "metaDraftOf" | "editMeta" | "acceptMeta" | "copyMeta" | "startUploadFlow" | "confirmUpload" | "cancelUpload" | "downloadGettyCsv"
> {
  return {
    metaDraftOf: (item) => ref.current.model.drafts[item.id] ?? initialMetaDraft(item),
    editMeta: (item, patch) => {
      const prev = ref.current.model.drafts[item.id] ?? initialMetaDraft(item);
      ref.current.dispatch({ type: "draft", id: item.id, draft: { ...prev, metadata: { ...prev.metadata, ...patch }, edited: true } });
    },
    acceptMeta: (item) => { void performAcceptMeta(ref.current, item); },
    copyMeta: (item, field) => {
      const m = (ref.current.model.drafts[item.id] ?? initialMetaDraft(item)).metadata;
      const text = field === "title" ? m.title : field === "description" ? m.description : m.tags.join(", ");
      void navigator.clipboard.writeText(text)
        .then(() => ref.current.say(`Copied ${field}`))
        .catch(() => ref.current.say("Clipboard blocked — copy text manually", true));
    },
    startUploadFlow: () => performStartUpload(ref.current),
    confirmUpload: () => {
      const d = ref.current.model.dialog;
      if (d?.kind === "confirmUpload") void performConfirmUpload(ref.current, d.plan);
    },
    cancelUpload: () => {
      ref.current.r.abort.current?.abort();
      ref.current.say("Cancelling upload — completed files stay on server");
    },
    downloadGettyCsv: () => triggerGettyCsvDownload(ref.current),
  };
}

export function useStockPanelOps(ctx: OpsCtx): StockPanelOps {
  const ref = useRef(ctx);
  ref.current = ctx;
  return useMemo(() => ({
    chooseRoot: () => { void performChooseRoot(ref.current); },
    rescan: () => {
      const c = ref.current;
      void retryCapture(c.r.root.current).then((cap) => { if (cap) c.say(cap); });
      c.r.scan.scanKey.current = null;
      c.runScan(true);
    },
    openLocation: (id) => {
      const item = ref.current.items.find((it) => it.id === id);
      if (!item) return;
      const first = item.files.raster?.relPath ?? item.files.svg?.relPath ?? item.files.eps?.relPath ?? item.recordPath;
      void copyFolderText(ref.current.r.root.current, first, ref.current.say);
    },
    setPrefs: (patch) => ref.current.dispatch({ type: "prefs", patch }),
    setFilter: (patch) => ref.current.dispatch({ type: "filter", patch }),
    setSort: (sort) => ref.current.dispatch({ type: "patch", patch: { sort } }),
    clearFilters: () => ref.current.dispatch({ type: "patch", patch: { filter: ALL_STOCK_FILTER } }),
    openRowBadges: () => ref.current.dispatch({ type: "patch", patch: { dialog: { kind: "rowBadges" } } }),
    closeDialog: () => ref.current.dispatch({ type: "patch", patch: { dialog: null } }),
    ...buildMetaAndUploadOps(ref),
  }), []);
}
