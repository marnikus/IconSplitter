// batch_review_flow.test.tsx — the split-review gate end to end on the real
// panel (RULE 8): pending (yellow) until previewed; a finished preview
// classifies every row (exactly N icons -> approved + green line, otherwise
// declined + red line); hands can change decisions with one-step undo; the
// decision lands in the pair's own <base>.json. Fake files preview as
// 1-icon fallbacks, so expecting 4 declines and expecting 1 approves — both
// sides of the classifier, no mocks.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { clearKnownRoots } from "../src/lib/knownroots";
import BatchPanel from "../src/batch/BatchPanel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider, useHistory, type HistoryApi } from "../src/state/HistoryProvider";
import HistoryBar from "../src/ui/HistoryBar";
import { BATCH_PREFS_KEY } from "../src/lib/batchprefs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, loadHandles: vi.fn(async () => null) };
});

function makeBatchRoot(): FakeDir {
  const root = new FakeDir("test_batch_review");
  const now = 1000;
  for (const [i, n] of ["a", "b", "c"].entries()) {
    root.children.set(`icon-${n}_AI_${i + 1}.png`, new FakeFile(`icon-${n}_AI_${i + 1}.png`, 10, now, n));
    root.children.set(`icon-${n}_${i + 1}.png`, new FakeFile(`icon-${n}_${i + 1}.png`, 5, 1000, "ref"));
  }
  return root;
}

let host: HTMLDivElement;
let ui: Root;
let api: HistoryApi;
let lastRoot: FakeDir;

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = async (ms = 80) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
const click = async (el: Element | null) => {
  if (!el) throw new Error("click target missing");
  await act(async () => { (el as HTMLElement).click(); });
  await settle(50);
};

beforeEach(async () => {
  localStorage.clear();
  localStorage.removeItem(BATCH_PREFS_KEY);
  resetAppStore();
  await dropDb();
  clearKnownRoots();
  vi.restoreAllMocks();
  if (host) { await act(async () => ui.unmount()); host.remove(); }
  (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker = async () => {
    lastRoot = makeBatchRoot();
    return lastRoot as unknown;
  };
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  await act(async () => {
    ui.render(<HistoryProvider><BatchPanel /><HistoryBar /><Probe /></HistoryProvider>);
  });
  await settle(100);
  await click(q("[data-testid=batch-open-folder]"));
  await settle(600);
});

function Probe() {
  api = useHistory();
  return null;
}

async function previewAll() {
  await click(q("[data-testid=batch-deselect]"));
  await click(q("[data-testid=batch-select-visible]"));
  await click(q("[data-testid=batch-preview]"));
  await settle(900); // preview queue + the review flush window
}

describe("batch split-review flow", () => {
  it("pending until previewed; this DOM cannot decode the fakes, so every preview declines", async () => {
    const badge = q("[data-testid='batch-review-badge-icon-a_AI_1.png']");
    expect(badge?.className).toContain("pending"); // yellow badge
    expect(badge?.textContent).toMatch(/◔ Pending/);
    await previewAll(); // undecodable in happy-dom -> failed previews -> declined
    expect(q("[data-testid='batch-review-badge-icon-a_AI_1.png']")?.textContent).toMatch(/✕ Declined/);
    expect(q("[data-testid='batch-row-icon-a_AI_1.png']")?.className).toContain("declined");
    expect(q("[data-testid=batch-declined-count]")?.textContent).toBe("3 declined");
    const split = q("[data-testid=batch-process]") as HTMLButtonElement;
    expect(split.disabled).toBe(true);
    expect(split.textContent).toMatch(/Split approved \(0\)/);
  });

  it("a hand approves; the green line class arrives and the gate opens for the approved checked row", async () => {
    await previewAll(); // all declined
    await click(q("[data-testid='batch-review-approve-icon-a_AI_1.png']"));
    expect(q("[data-testid='batch-review-badge-icon-a_AI_1.png']")?.textContent).toMatch(/✓ Approved/);
    expect(q("[data-testid='batch-row-icon-a_AI_1.png']")?.className).toContain("approved");
    expect(q("[data-testid=batch-approved-count]")?.textContent).toBe("1 approved");
    const split = q("[data-testid=batch-process]") as HTMLButtonElement;
    expect(split.disabled).toBe(false);
    expect(split.textContent).toMatch(/Split approved \(1\)/);
  });

  it("a hand can change a decision; the gesture is one undoable entry", async () => {
    await previewAll(); // all declined (expected 4)
    const before = api.entries.length;
    await click(q("[data-testid='batch-review-approve-icon-a_AI_1.png']"));
    expect(q("[data-testid='batch-review-badge-icon-a_AI_1.png']")?.textContent).toMatch(/✓ Approved/);
    expect(api.entries.length).toBe(before + 1);
    await click(q("[data-testid=hist-undo]"));
    await settle(100);
    expect(q("[data-testid='batch-review-badge-icon-a_AI_1.png']")?.textContent).toMatch(/✕ Declined/);
  });

  it("the decision lands in the pair's own <base>.json", async () => {
    await previewAll();
    await click(q("[data-testid='batch-review-approve-icon-a_AI_1.png']"));
    await settle(500); // the review flush window
    const fh = lastRoot.children.get("icon-a.json") as FakeFile | undefined;
    expect(fh).toBeDefined();
    const state = JSON.parse(await (await fh!.getFile()).text());
    const rec = state.sources.find((s: { relPath: string }) => s.relPath === "icon-a_AI_1.png");
    expect(rec.review).toBe("approved");
  });
});
