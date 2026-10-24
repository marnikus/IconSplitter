import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completionAudio, flushCompletionAudio, recordCompletionAudio } from "./helpers/completionAudio";
import { startUploadProgress } from "../src/upload/processprogress";
import type { UploadCtx } from "../src/upload/actions";
import { batchProcess } from "../src/batch/batchOps";
import type { BatchState, Ctx, Setter } from "../src/batch/useBatchTypes";
import { defaultPreset } from "../src/lib/presets";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { setImageDecodeTimeout } from "../src/lib/dom";
import { useBatchPreview } from "../src/batch/useBatchPreview";
import { setCompletionSound } from "../src/ui/completionSound";
import App from "../src/App";
import { HistoryProvider } from "../src/state/HistoryProvider";

import { scanUpload } from "../src/upload/scan";
import { scan as scanBatch } from "../src/batch/batchOps";
import { rescan as scanSelection, type Ctx as SelectionCtx } from "../src/selection/rootsource";
import { initialSelState } from "../src/selection/state";
import { scanSources } from "../src/svg/scan";
import type { SvgRefs } from "../src/svg/types";
import { SCAN_IDLE } from "../src/lib/scanseq";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { localStorage.clear(); setCompletionSound(true); recordCompletionAudio(); setImageDecodeTimeout(1); });
afterEach(() => { setImageDecodeTimeout(8000); vi.unstubAllGlobals(); });
const uploadCtx = () => ({ dispatch: vi.fn() } as unknown as UploadCtx);
function batchCtx() {
  const root = new FakeDir("root"); root.children.set("a_AI.png", new FakeFile("a_AI.png"));
  let state = { rows: [{ relPath: "a_AI.png", name: "a_AI.png", dirPath: "", refRelPath: null, selected: true, review: "approved", status: "unprocessed" }],
    preset: defaultPreset("Default"), rowMerges: {}, running: false } as unknown as BatchState;
  const ctx = { root: { current: root }, dest: { current: null }, keys: { current: [] }, stop: { current: false }, state: { current: state } } as Ctx;
  const set: Setter = (update) => { state = typeof update === "function" ? update(state) : update; ctx.state.current = state; };
  return { ctx, set };
}

describe("completion cues belong to real processes on every tab", () => {
  it("Upload independently cues metadata and export once, after finish (not each item)", async () => {
    const c = uploadCtx(); const metadata = startUploadProgress(c, "metadata", 2); const exp = startUploadProgress(c, "export", 1);
    metadata.advance(); exp.advance(); await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(0);
    metadata.advance(); metadata.finish("completed"); metadata.finish("completed"); exp.finish("completed");
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(2);
    expect(completionAudio.starts[1] - completionAudio.starts[0]).toBeCloseTo(2.1);
  });
  it("Upload completed-with-errors cues, while cancelled/empty batches stay silent", async () => {
    startUploadProgress(uploadCtx(), "export", 2).finish("failed");
    startUploadProgress(uploadCtx(), "metadata", 2).finish("cancelled");
    startUploadProgress(uploadCtx(), "export", 0).finish("completed");
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(1);
  });
  it("respects global mute outside Generate SVG too", async () => {
    setCompletionSound(false); startUploadProgress(uploadCtx(), "export", 1).finish("completed");
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(0);
  });
  it("Batch split cues after all results are finalized, including failed image attempts", async () => {
    const { ctx, set } = batchCtx(); await batchProcess(ctx, set); await flushCompletionAudio();
    expect(ctx.state.current.running).toBe(false);
    expect(ctx.state.current.progress?.failed).toBe(1);
    expect(completionAudio.starts).toHaveLength(1);
  });
  it("does not cue refused Batch selections", async () => {
    const { ctx, set } = batchCtx(); ctx.state.current.rows[0].review = "pending";
    await batchProcess(ctx, set); await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(0);
  });
  it("does not cue stopped Batch splitting", async () => {
    const { ctx, set } = batchCtx();
    await batchProcess(ctx, (update) => { set(update); if (ctx.state.current.running) ctx.stop.current = true; });
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(0);
  });
  it("Batch preview finishes once even when hidden; cached no-ops do not replay", async () => {
    const { ctx } = batchCtx(); let api!: ReturnType<typeof useBatchPreview>;
    const load = async () => new File(["invalid image"], "a_AI.png");
    function Preview() { api = useBatchPreview({ root: ctx.root.current, rows: ctx.state.current.rows, split: ctx.state.current.preset.split, loadFile: load }); return null; }
    const host = document.createElement("div"); host.hidden = true; document.body.append(host);
    const root = createRoot(host); await act(async () => root.render(<Preview />));
    await act(async () => { await api.previewSelected(ctx.state.current.rows); });
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(1);
    await act(async () => { await api.previewSelected(ctx.state.current.rows); });
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(1);
  });
  it("Single sheets import cues once for the full multi-file attempt, not each image", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<HistoryProvider><App /></HistoryProvider>));
    const input = host.querySelector('[data-testid="file-input"]')!;
    Object.defineProperty(input, "files", { value: [new File(["x"], "a.png", { type: "image/png" }), new File(["x"], "b.png", { type: "image/png" })] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 110)); });
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(1);
  });
  it("user-requested Batch, Selection and SVG folder scans cue; restoration scans stay silent", async () => {
    const { ctx, set } = batchCtx();
    await scanBatch(ctx, set, () => undefined);
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(0);
    await scanBatch(ctx, set, () => undefined, true);
    const selection = { root: { current: new FakeDir("selection") }, state: { current: initialSelState() }, seq: { current: SCAN_IDLE }, hist: {} } as unknown as SelectionCtx;
    await scanSelection(selection, (update) => { selection.state.current = typeof update === "function" ? update(selection.state.current) : update; }, () => undefined, true);
    const refs: SvgRefs = { root: { current: new FakeDir("svg") }, metas: new Map(), abort: { current: null }, queue: { current: [] }, key: { current: null }, scanKey: { current: null }, seq: { current: SCAN_IDLE } };
    await scanSources(refs, { setRootName() {}, setRows() {}, setDiscovery() {}, setBusy() {}, setRootToken() {}, say() {} }, true);
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(3);
  });
  it("Upload scan waits for asynchronous row assembly and cues only once it finishes", async () => {
    let release!: () => void; let assembled = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const refs = { seq: SCAN_IDLE, scanKey: { current: null } };
    const scan = scanUpload(refs, new FakeDir("upload"), {
      setRootName() {}, setRows: async () => { assembled = true; await gate; }, setDiscovery() {}, setBusy() {}, say() {},
    }, true);
    for (let i = 0; i < 40 && !assembled; i++) await Promise.resolve();
    expect(assembled).toBe(true); expect(completionAudio.starts).toHaveLength(0);
    release(); await scan; await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(1);
  });
  it("a superseded Upload scan never emits a stale completion cue", async () => {
    const refs = { seq: SCAN_IDLE, scanKey: { current: null } };
    const setters = { setRootName() {}, setRows() {}, setDiscovery() {}, setBusy() {}, say() {} };
    const older = scanUpload(refs, new FakeDir("older"), setters, true);
    const newer = scanUpload(refs, new FakeDir("newer"), setters, true);
    await Promise.all([older, newer]); await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(1);
  });
  it("stopped Batch preview is silent even when its last file read settles later", async () => {
    const { ctx } = batchCtx(); let api!: ReturnType<typeof useBatchPreview>; let release!: (file: File) => void;
    const pending = new Promise<File>((resolve) => { release = resolve; });
    function Preview() { api = useBatchPreview({ root: ctx.root.current, rows: ctx.state.current.rows, split: ctx.state.current.preset.split, loadFile: () => pending }); return null; }
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); await act(async () => root.render(<Preview />));
    let run!: Promise<void>;
    await act(async () => { run = api.previewSelected(ctx.state.current.rows); });
    await act(async () => { api.cancel(); release(new File(["x"], "a.png")); await run; });
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(0);
  });

});
