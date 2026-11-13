// bar_completion_sound.test.tsx — a finished progress bar is always audible
// (2026-11-02). The cue belongs to the shared bar, not to each caller, so a bar
// whose owner never called the sound service (the stock upload bar did not) still
// signals completion — while a running bar, a stopped run and a mute stay silent.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProcessProgressBar, { type ProcessProgressBarProps } from "../src/ui/ProcessProgressBar";
import { armCompletionSound, notifyCompletion, setCompletionSound } from "../src/ui/completionSound";
import StockUploadDialogs from "../src/stockupload/StockUploadDialogs";
import type { StockUploadApi } from "../src/stockupload/useStockUpload";
import { completionAudio, flushCompletionAudio, recordCompletionAudio } from "./helpers/completionAudio";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;

const props = (patch: Partial<ProcessProgressBarProps> = {}): ProcessProgressBarProps => ({
  prefix: "task", theme: "svg", title: "Working", detail: "fog.svg",
  done: 1, total: 2, remaining: 1, percent: 50, status: "running", runId: "run",
  onCancel: () => undefined, onReview: () => undefined, onDismiss: () => undefined, ...patch,
});

function render(node: React.ReactNode): Promise<void> {
  return act(async () => { ui.render(<>{node}</>); });
}

beforeEach(() => {
  localStorage.clear();
  setCompletionSound(true);
  recordCompletionAudio();
  armCompletionSound(); // the click that started the run
  host = document.createElement("div");
  document.body.append(host);
  ui = createRoot(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("the shared bar owns the completion cue", () => {
  it("is silent while it runs and sounds once when it completes", async () => {
    await render(<ProcessProgressBar {...props({ runId: "run-1" })} />);
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(0);
    await render(<ProcessProgressBar {...props({ runId: "run-1", status: "completed", done: 2, remaining: 0, percent: 100 })} />);
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(1);
  });

  it("does not sound twice when the feature already cued the same process", async () => {
    notifyCompletion("run-2");
    await flushCompletionAudio();
    await render(<ProcessProgressBar {...props({ runId: "run-2", status: "completed" })} />);
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(1);
  });

  it("keeps a stopped run silent and never cues an empty bar", async () => {
    await render(<ProcessProgressBar {...props({ runId: "run-3", status: "cancelled" })} />);
    await flushCompletionAudio();
    await render(<ProcessProgressBar {...props({ runId: "run-4", status: "completed", total: 0, done: 0 })} />);
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(0);
  });

  it("respects the mute even for a finished bar", async () => {
    setCompletionSound(false);
    await render(<ProcessProgressBar {...props({ runId: "run-5", status: "completed" })} />);
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(0);
  });
});

describe("the stock upload bar, which had no cue at all", () => {
  function api(progress: Record<string, unknown>): StockUploadApi {
    return {
      model: { dialog: null, uploading: false, progress },
      confirmUpload: vi.fn(), closeDialog: vi.fn(), cancelUpload: vi.fn(), dismissProgress: vi.fn(),
    } as unknown as StockUploadApi;
  }

  let mount: HTMLDivElement;

  beforeEach(() => {
    mount = document.createElement("div");
    mount.id = "stock-upload-progress-mount";
    document.body.append(mount);
  });

  afterEach(() => { mount.remove(); });

  it("sounds once when it finishes, keyed by the run id", async () => {
    await render(<StockUploadDialogs g={api({ runId: "upload-1", done: 4, total: 4, label: "Getty Images: 4", complete: true, failed: 0 })} />);
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(1);
    // The finished bar is re-rendered on every parent update: still one sound.
    await render(<StockUploadDialogs g={api({ runId: "upload-1", done: 4, total: 4, label: "Getty Images: 4", complete: true, failed: 0 })} />);
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(1);
  });

  it("stays silent while running and when the user stopped it", async () => {
    await render(<StockUploadDialogs g={api({ runId: "upload-2", done: 1, total: 4, label: "Uploading" })} />);
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(0);
    await render(<StockUploadDialogs g={api({ runId: "upload-3", done: 1, total: 4, label: "Stopped", complete: true, stopped: true })} />);
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(0);
  });
});
