// uploadactions.ts — the upload tab's gesture bodies (RULE 4/5): module-level
// functions over one context bundle, so useUpload stays wiring-only and every
// action stays small, named and readable. The context carries the live
// snapshot ref, the run ref (root handle + cancel/running flags), the reducer
// dispatch, the history API, the toasts and the state setters it needs.

import type { Dispatch } from "react";
import { log } from "../log/logstore";
import { getAppState, patchUpload } from "../state/appstore";
import type { NewEntry } from "../state/HistoryProvider";
import type { DirHandleLike } from "../lib/fs";
import type { GeminiConfig } from "../lib/gemconfig";
import { buildGeminiRequest, describeGeminiRequest } from "../lib/geminireq";
import type { IconMetadata } from "../lib/upmeta";
import { clampExportNumber, type ExportOverride, type ExportSettings, type NumericField } from "../lib/upsettings";
import type { UploadRowSource } from "./sources";
import { makeRunnerDeps } from "./browserdeps";
import { runUploadJobs, type JobRequest, type JobResult, type JobState, type RunnerDeps } from "./runner";
import { acceptMetadata, effectiveFor, type UploadAction, type UploadModel, type UploadRow } from "./statemodel";
import { knownMeta, knownProvenance, rememberMeta, saveGeminiConfig, saveMetaPrompt } from "./stores";
import { userProvenanceFor } from "./jobartifacts";
import { saveGeminiKey } from "./gemkey";

/** The live snapshot the gestures read — never a stale closure. */
export interface LatestState {
  model: UploadModel;
  /** The picked root's identity (captured path, else the handle's name). */
  rootName: string;
  key: string | null;
  gemini: GeminiConfig;
  prompt: string;
  app: { upload: { checked: string[] } };
}

/** The run-scoped mutable state: the picked root plus the cancel/running flags. */
export interface RunState {
  root: DirHandleLike | null;
  cancelled: boolean;
  running: boolean;
}

export type Say = (msg: string, err?: boolean) => void;

/** Everything a gesture body needs — one bundle, passed by the hook. */
export interface UploadCtx {
  latest: { current: LatestState };
  run: { current: RunState };
  dispatch: Dispatch<UploadAction>;
  hist: { push: (entry: NewEntry) => void };
  say: Say;
  scan: () => Promise<void>;
  chooseRoot: () => void;
  setBusy: (b: string | null) => void;
  setKeyState: (k: string | null) => void;
  setGeminiState: (g: GeminiConfig) => void;
  setPromptState: (t: string) => void;
}

export function toggleChecked(ctx: UploadCtx, id: string): void {
  const now = ctx.latest.current.app.upload.checked;
  patchUpload({ checked: now.includes(id) ? now.filter((x) => x !== id) : [...now, id] });
}

export function checkAllIds(ctx: UploadCtx, ids: string[], on: boolean): void {
  const now = new Set(ctx.latest.current.app.upload.checked);
  for (const id of ids) {
    if (on) now.add(id);
    else now.delete(id);
  }
  patchUpload({ checked: [...now] });
}

/** Every default is clamped on the way in (RULE 13); an override survives. */
export function setDefaultField(ctx: UploadCtx, field: keyof ExportSettings, value: string | boolean): void {
  const defaults = ctx.latest.current.model.defaults;
  const next: ExportSettings = typeof value === "boolean"
    ? { ...defaults, [field]: value }
    : { ...defaults, [field]: clampInput(field, value, defaults) };
  ctx.dispatch({ type: "set-defaults", settings: next });
}

function clampInput(field: keyof ExportSettings, value: string, defaults: ExportSettings): number | string {
  const numeric: readonly NumericField[] = ["paddingPct", "strokePt", "jpegMpx", "jpegQuality"];
  if ((numeric as readonly string[]).includes(field)) {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? clampExportNumber(field as NumericField, n) : defaults[field] as number;
  }
  return value;
}

export function setGeminiField(ctx: UploadCtx, patch: Partial<GeminiConfig>): void {
  const next = { ...ctx.latest.current.gemini, ...patch };
  ctx.setGeminiState(next);
  saveGeminiConfig(next);
}

export function setPromptText(ctx: UploadCtx, text: string): void {
  ctx.setPromptState(text);
  saveMetaPrompt(text);
}

export function saveKeyOnDevice(ctx: UploadCtx, k: string): void {
  void saveGeminiKey(k).then((persisted) => {
    ctx.setKeyState(k.trim() === "" ? null : k.trim());
    if (k.trim() !== "" && !persisted) ctx.say("The key works for this session but could not be stored on this device", true);
  });
}

export function acceptRowMeta(ctx: UploadCtx, row: UploadRowSource, meta: IconMetadata): void {
  const next = acceptMetadata(ctx.latest.current.model, row.id, meta);
  ctx.dispatch({ type: "meta-accepted", id: row.id, metadata: meta });
  const cur = ctx.latest.current;
  rememberMeta(row, meta, userProvenanceFor(cur.prompt, cur.gemini, new Date().toISOString()));
  ctx.say(next.toast ?? "Metadata accepted");
}

/** The redacted exact-request preview — nothing is sent to build it (RULE 20). */
export function requestPreviewOf(ctx: UploadCtx, row: UploadRowSource): string | null {
  const request = buildGeminiRequest({
    config: ctx.latest.current.gemini, apiKey: ctx.latest.current.key ?? "",
    prompt: ctx.latest.current.prompt, imageBase64: "",
  });
  void row;
  return describeGeminiRequest(request);
}

/** ONE history entry for the whole selection, carrying the previous overrides. */
export function applyToSelected(fields: ExportOverride, ctx: UploadCtx): void {
  const cur = ctx.latest.current;
  const ids = cur.app.upload.checked;
  if (ids.length === 0) return ctx.say("Select at least one icon first", true);
  const before: Record<string, ExportOverride | null> = {};
  for (const id of ids) before[id] = cur.model.overrides[id] ?? null;
  ctx.dispatch({ type: "apply-override", ids, fields });
  ctx.hist.push({
    type: "uploadSettings",
    label: `Apply export settings to ${ids.length} icon${ids.length === 1 ? "" : "s"}`,
    origin: getAppState().tab, ids,
    before: { overrides: before }, after: { overrides: overridesAfter(cur.model.overrides, ids, fields) },
  });
  ctx.say(`Settings applied to ${ids.length} icon${ids.length === 1 ? "" : "s"}`);
}

function overridesAfter(
  current: UploadModel["overrides"], ids: string[], fields: ExportOverride,
): Record<string, ExportOverride | null> {
  const out: Record<string, ExportOverride | null> = {};
  for (const id of ids) out[id] = { ...(current[id] ?? null), ...fields };
  return out;
}

/** Runs the selected icons' jobs; one failure never touches another's package. */
export async function runExport(allowAi: boolean, ctx: UploadCtx): Promise<void> {
  const run = ctx.run.current;
  if (run.running) return;
  if (run.root === null) return ctx.say("Pick a folder first", true);
  const rows = selectedRows(ctx.latest.current);
  if (rows.length === 0) return ctx.say("Select at least one icon first", true);
  const requests = jobRequestsFor(ctx.latest.current, rows, allowAi);
  run.running = true;
  run.cancelled = false;
  ctx.setBusy(`Exporting ${requests.length} icon${requests.length === 1 ? "" : "s"}…`);
  try {
    const deps = exportDeps(ctx, run.root);
    const results = await runUploadJobs(requests, deps, { concurrency: ctx.latest.current.gemini.concurrency });
    reportResults(results, ctx.say);
    await ctx.scan(); // the committed record becomes the row's export state
  } finally {
    run.running = false;
    ctx.setBusy(null);
  }
}

function selectedRows(cur: LatestState): UploadRow[] {
  return cur.model.rows.filter((r) => cur.app.upload.checked.includes(r.source.id));
}

function jobRequestsFor(cur: LatestState, rows: UploadRow[], allowAi: boolean): JobRequest[] {
  return rows.map((row) => ({
    row: row.source,
    rootName: cur.rootName,
    settings: effectiveFor(cur.model, row.source.id),
    prompt: cur.prompt,
    apiKey: cur.key ?? "",
    gemini: cur.gemini,
    // One resolver answers "does this icon already have metadata?" (R03/R10),
    // and the provenance says where that metadata came from.
    metadata: knownMeta(row),
    metadataProvenance: knownProvenance(row),
    allowAi,
  }));
}



function exportDeps(ctx: UploadCtx, root: DirHandleLike): RunnerDeps {
  return makeRunnerDeps({
    root,
    gemini: ctx.latest.current.gemini,
    apiKey: ctx.latest.current.key ?? "",
    onState: (id, state, detail) => onJobState(ctx, id, state, detail),
    cancelled: () => ctx.run.current.cancelled,
  });
}

function onJobState(ctx: UploadCtx, id: string, state: JobState, detail?: string): void {
  if (state === "processed" || state === "partial" || state === "failed") {
    ctx.dispatch({ type: "export-state", id, state, record: null });
  }
  if (detail !== undefined && state === "failed") log({ level: "warn", feature: "upload", action: "job-failed", detail });
}

function reportResults(results: Map<string, JobResult>, say: Say): void {
  let ok = 0;
  const failed: string[] = [];
  for (const result of results.values()) {
    if (result.ok) ok++;
    else if (result.state !== "cancelled") failed.push(result.error.split("\n")[0]);
  }
  say(`Exported ${ok} of ${results.size} icon${results.size === 1 ? "" : "s"}`);
  if (failed.length > 0) say(`${failed.length} icon${failed.length === 1 ? "" : "s"} failed — the reason is on the row`, true);
}
