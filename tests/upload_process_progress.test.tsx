import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyProcessUpdate, dismissProcess, type UploadProgressState } from "../src/upload/processprogress";
import { type ProcessProgress } from "../src/lib/processprogress";
import UploadProgressHeaders from "../src/upload/UploadProgressHeaders";
import type { UploadApi } from "../src/upload/useUpload";
import { getAppState, resetAppStore } from "../src/state/appstore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const empty = (): UploadProgressState => ({ progress: null, processes: { metadata: null, export: null, download: null } });
const run = (runId: string, over: Partial<ProcessProgress> = {}): ProcessProgress => ({ runId, done: 0, total: 4, status: "running", ...over });
afterEach(() => { document.body.innerHTML = ""; resetAppStore(); });

describe("independent process snapshots", () => {
  it("download owns a separate slot and toolbar counts while metadata/export stay independent", () => {
    let state = applyProcessUpdate(empty(), { kind: "metadata", progress: run("m"), start: true });
    state = applyProcessUpdate(state, { kind: "export", progress: run("e"), start: true });
    state = applyProcessUpdate(state, { kind: "download", progress: run("d", { total: 459, done: 15 }), start: true });
    expect(state.progress).toEqual(run("d", { total: 459, done: 15 }));
    state = applyProcessUpdate(state, { kind: "metadata", progress: run("m", { status: "completed", done: 4 }), start: false });
    expect(state.processes.download?.done).toBe(15);
    expect(dismissProcess(state, "download", "old")).toBe(state);
    state = applyProcessUpdate(state, { kind: "download", progress: run("d", { total: 459, done: 15, status: "cancelled" }), start: false });
    expect(state.progress).toEqual(run("e"));
    expect(state.processes.metadata?.status).toBe("completed");
    expect(applyProcessUpdate(state, { kind: "download", progress: run("d", { done: 459 }), start: false })).toBe(state);
    expect(dismissProcess(state, "download", "d").processes.download).toBeNull();
  });

  it("one channel's completion cannot clear another active batch", () => {
    let state = applyProcessUpdate(empty(), { kind: "metadata", progress: run("m"), start: true });
    state = applyProcessUpdate(state, { kind: "export", progress: run("e"), start: true });
    state = applyProcessUpdate(state, { kind: "metadata", progress: run("m", { done: 4, status: "completed" }), start: false });
    expect(state.progress).toEqual(run("e"));
    expect(state.processes.metadata?.status).toBe("completed");
    state = applyProcessUpdate(state, { kind: "export", progress: run("e", { done: 2, status: "cancelled" }), start: false });
    expect(state.progress).toBeNull();
    expect(state.processes.export?.done).toBe(2);
  });

  it("rejects stale or post-terminal updates and stale/running dismissals", () => {
    const initial = empty();
    expect(applyProcessUpdate(initial, { kind: "metadata", progress: run("absent"), start: false })).toBe(initial);
    let state = applyProcessUpdate(initial, { kind: "export", progress: run("new"), start: true });
    expect(applyProcessUpdate(state, { kind: "export", progress: run("old"), start: false })).toBe(state);
    expect(dismissProcess(state, "metadata", "absent")).toBe(state);
    expect(dismissProcess(state, "export", "old")).toBe(state);
    expect(dismissProcess(state, "export", "new")).toBe(state);
    state = applyProcessUpdate(state, { kind: "export", progress: run("new", { status: "failed" }), start: false });
    expect(applyProcessUpdate(state, { kind: "export", progress: run("new"), start: false })).toBe(state);
    expect(dismissProcess(state, "export", "new")).toEqual(empty());
  });
});

describe("Upload shared header adapter", () => {
  it("portals both runs outside hidden panel, directs cancellation and keeps cancelled percentage", () => {
    const mount = document.createElement("div"); mount.id = "upload-progress-mount"; document.body.appendChild(mount);
    const host = document.createElement("div"); host.hidden = true; document.body.appendChild(host);
    const root = createRoot(host);
    const cancelMetadata = vi.fn(); const cancelExport = vi.fn(); const dispatch = vi.fn();
    const g = { processes: { metadata: run("m"), export: run("e"), download: null }, rows: [
      { running: "metadata", source: { svgName: "fog.svg" } },
      { running: "export", source: { svgName: "arch.svg" } },
    ], cancelMetadata, cancelExport, dispatch } as unknown as UploadApi;
    act(() => root.render(<UploadProgressHeaders g={g} />));
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
    expect(mount.querySelectorAll('[role="progressbar"]')).toHaveLength(2);
    expect(mount.querySelector('[data-testid="upload-export-progress-file"]')?.textContent).toBe("arch.svg");
    act(() => { (mount.querySelector('[data-testid="upload-metadata-progress-cancel"]') as HTMLElement).click(); });
    act(() => { (mount.querySelector('[data-testid="upload-export-progress-cancel"]') as HTMLElement).click(); });
    expect(cancelMetadata).toHaveBeenCalledOnce(); expect(cancelExport).toHaveBeenCalledOnce();
    g.processes = { metadata: run("m", { status: "cancelled", done: 1 }), export: run("e", { status: "failed", done: 2 }), download: null };
    act(() => root.render(<UploadProgressHeaders g={g} />));
    expect(mount.querySelector('[data-testid="upload-metadata-progress-title"]')?.textContent).toContain("cancelled");
    expect(mount.querySelector('[data-testid="upload-metadata-progress-track"]')?.getAttribute("aria-valuenow")).toBe("25");
    expect(mount.querySelector('[data-testid="upload-export-progress-title"]')?.textContent).toContain("errors");
    act(() => { (mount.querySelector('[data-testid="upload-export-progress-review"]') as HTMLElement).click(); });
    expect(getAppState().tab).toBe("upload");
    act(() => { (mount.querySelector('[data-testid="upload-metadata-progress-dismiss"]') as HTMLElement).click(); });
    expect(dispatch).toHaveBeenCalledWith({ type: "process-dismiss", kind: "metadata", runId: "m" });
    act(() => root.unmount());
  });
});
