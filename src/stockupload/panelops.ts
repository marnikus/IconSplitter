// panelops.ts — folder pick/rescan, metadata accept/copy, and FTPS batch runner ops.

import { useMemo, useRef } from "react";
import { copyFolderText } from "../lib/copypath";
import { probeBridgeFtps } from "../lib/stockupload/bridgeclient";
import { probeBridgeGettyWeb } from "../lib/stockupload/gettywebclient";
import { buildGettyEspCsv } from "../lib/stockupload/gettycsv";
import { gettyWebRequestBytes } from "../lib/stockupload/gettyweb";
import { buildStockUploadPlan, type StockUploadPlan } from "../lib/stockupload/plan";
import type { ExportedItem, StockFtpPreset, StockPresetState } from "../lib/stockupload/types";
import type { IconMetadata } from "../lib/upload/meta";
import { pickFolderFor } from "../ui/pickroot";
import { retryCapture } from "../ui/rootcapture";
import { readFtpCredentials } from "./keystore";
import { saveExportedMetadata } from "./metaembed";
import type { StockModelAction, StockRefs, StockUploadModel } from "./model";
import type { StockUploadPrefs } from "./prefsstore";
import { ALL_STOCK_FILTER, initialMetaDraft, type StockListFilter, type StockMetaDraft, type StockUploadSort } from "./rowlist";
import { log } from "../log/logstore";
import { executeStockUploadBatch, type UploadBatchSummary, type UploadProgressStep } from "./runupload";
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
  /** Closes a finished (or cancelled) bar there is nothing left to watch. */
  dismissProgress: () => void;
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

/** The re-upload list, said out loud instead of hiding in the failure count. */
function reuploadNote(summary: UploadBatchSummary): string {
  const icons = summary.reuploadIcons ?? 0;
  return icons > 0 ? ` — ${icons} icon(s) need re-upload` : "";
}

function summarizeBatch(summary: UploadBatchSummary, targetCount: number): { text: string; err: boolean } {
  const reupload = reuploadNote(summary);
  if (summary.cancelled) {
    return { text: `Upload cancelled (${summary.uploadedFiles} file(s) sent)${reupload}`, err: false };
  }
  if (summary.failedFiles > 0) {
    return { text: `Uploaded ${summary.uploadedFiles} file(s), ${summary.failedFiles} failed: ${summary.lastError ?? ""}${reupload}`, err: true };
  }
  if (summary.stagedDir) {
    return {
      text: `Staged ${summary.uploadedFiles} file(s) + getty_esp_metadata.csv into ${summary.stagedDir}/ — drag into esp.gettyimages.com or DeepMeta 4`,
      err: false,
    };
  }
  if (summary.lastError) {
    return {
      text: `Uploaded ${summary.uploadedFiles} file(s) across ${targetCount} stock site(s) — ${summary.lastError}`,
      err: true,
    };
  }
  return { text: `Uploaded ${summary.uploadedFiles} file(s) across ${targetCount} stock site(s)`, err: false };
}

/** What the helper said about its Getty limits, or why the probe refused the run. */
interface HelperProbe { failure: string | null; gettyMaxBytes: number }

/**
 * Probes the loopback helper exactly for the protocols this run will use. The
 * Getty body cap travels with the answer: batches are sized to the helper that is
 * actually running, not to what this build assumes it can take.
 */
async function probeUploadHelpers(c: OpsCtx, targets: readonly StockFtpPreset[]): Promise<HelperProbe> {
  const probe = await probeBridgeFtps(c.model.prefs.bridgeUrl, globalThis.fetch, {
    requireSftp: targets.some((t) => t.protocol === "sftp"),
    requireEsp: targets.some((t) => t.protocol === "esp-https"),
  });
  if (!probe.ok) return { failure: probe.reason, gettyMaxBytes: gettyWebRequestBytes() };
  if (!targets.some((t) => t.protocol === "getty-web")) return { failure: null, gettyMaxBytes: gettyWebRequestBytes() };
  const gettyWeb = await probeBridgeGettyWeb(c.model.prefs.bridgeUrl, globalThis.fetch);
  if (!gettyWeb.ok) return { failure: gettyWeb.reason, gettyMaxBytes: gettyWebRequestBytes() };
  return { failure: null, gettyMaxBytes: gettyWebRequestBytes(gettyWeb.maxBytes) };
}

/** The helper's Getty byte cap, or why the run may not start at all. */
async function budgetFor(c: OpsCtx, targets: readonly StockFtpPreset[]): Promise<{ failure: string | null; gettyMaxBytes?: number }> {
  if (targets.length === 0) return { failure: null };
  const probe = await probeUploadHelpers(c, targets);
  return probe.failure !== null ? { failure: probe.failure } : { failure: null, gettyMaxBytes: probe.gettyMaxBytes };
}

async function performConfirmUpload(c: OpsCtx, plan: StockUploadPlan): Promise<void> {
  if (!c.r.root.current) return;
  const networkTargets = plan.targets.filter((t) => t.protocol !== "esp-batch");
  c.dispatch({ type: "patch", patch: { dialog: null, uploading: true, progress: { done: 0, total: plan.tasks.length, label: "Preparing upload batch…" } } });
  const budget = await budgetFor(c, networkTargets);
  if (budget.failure !== null) {
    c.dispatch({ type: "patch", patch: { uploading: false, progress: null } });
    c.say(budget.failure, true);
    return;
  }
  const controller = new AbortController();
  c.r.abort.current = controller;
  const summary = await executeStockUploadBatch(plan, {
    root: c.r.root.current,
    bridgeUrl: c.model.prefs.bridgeUrl,
    signal: controller.signal,
    loadCreds: readFtpCredentials,
    // The batch bytes the running helper can take, so no request is sent blind.
    gettyWebMaxBytes: budget.gettyMaxBytes,
    // Random batch selection: each 100-icon batch is a random draw from what is left.
    gettyWebRandomBatches: c.model.prefs.randomBatches,
    onProgress: (progress) => c.dispatch({ type: "patch", patch: { progress } }),
    logFn: log,
    onCertWarning: (_id, sha256) => c.dispatch({ type: "patch", patch: { testStatus: { busy: false, ok: false, note: "Server certificate requires trust", certSha256: sha256 } } }),
  });
  c.r.abort.current = null;
  const msg = summarizeBatch(summary, plan.targets.length);
  c.dispatch({ type: "patch", patch: { uploading: false, progress: finishedProgress(plan, summary, msg.text) } });
  c.say(msg.text, msg.err);
}

/**
 * The bar stays as the finished state (100%, ✕ to close) instead of vanishing or
 * sitting at 100% offering a Cancel that no longer does anything.
 */
function finishedProgress(plan: StockUploadPlan, summary: UploadBatchSummary, label: string): UploadProgressStep {
  return {
    // The bar counts files that really uploaded: a run where everything failed
    // must not paint "418 completed / 418 · 100 %" in green.
    done: summary.uploadedFiles, total: plan.tasks.length, label,
    complete: true, failed: summary.failedFiles,
  };
}

function performStartUpload(c: OpsCtx): void {
  if (c.model.uploading) { c.say("An upload batch is already running", true); return; }
  const plan = buildStockUploadPlan({
    items: c.items, checkedIds: c.checked, presets: c.presetState.presets,
    checkedTargets: c.presetState.checkedTargets, formats: c.presetState.formats,
    combineTitleDescription: c.model.prefs.combineTitleDescription,
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

function editMetaDraft(c: OpsCtx, item: ExportedItem, patch: Partial<IconMetadata>): void {
  const prev = c.model.drafts[item.id] ?? initialMetaDraft(item);
  c.dispatch({ type: "draft", id: item.id, draft: { ...prev, metadata: { ...prev.metadata, ...patch }, edited: true } });
}

function copyMetaField(c: OpsCtx, item: ExportedItem, field: "title" | "description" | "tags"): void {
  const m = (c.model.drafts[item.id] ?? initialMetaDraft(item)).metadata;
  const text = field === "title" ? m.title : field === "description" ? m.description : m.tags.join(", ");
  void navigator.clipboard.writeText(text)
    .then(() => c.say(`Copied ${field}`))
    .catch(() => c.say("Clipboard blocked — copy text manually", true));
}

function buildMetaAndUploadOps(ref: { current: OpsCtx }): Pick<
  StockPanelOps,
  "metaDraftOf" | "editMeta" | "acceptMeta" | "copyMeta" | "startUploadFlow" | "confirmUpload"
  | "cancelUpload" | "dismissProgress" | "downloadGettyCsv"
> {
  return {
    metaDraftOf: (item) => ref.current.model.drafts[item.id] ?? initialMetaDraft(item),
    editMeta: (item, patch) => editMetaDraft(ref.current, item, patch),
    acceptMeta: (item) => { void performAcceptMeta(ref.current, item); },
    copyMeta: (item, field) => copyMetaField(ref.current, item, field),
    startUploadFlow: () => performStartUpload(ref.current),
    confirmUpload: () => {
      const d = ref.current.model.dialog;
      if (d?.kind === "confirmUpload") void performConfirmUpload(ref.current, d.plan);
    },
    cancelUpload: () => {
      ref.current.r.abort.current?.abort();
      ref.current.say("Cancelling upload — completed files stay on server");
    },
    dismissProgress: () => ref.current.dispatch({ type: "patch", patch: { progress: null } }),
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
