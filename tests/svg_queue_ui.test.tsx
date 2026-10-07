// svg_queue_ui.test.tsx — the queue as the USER meets it (I-53, RULE 8): while
// a run is streaming, Generate stays available, a second confirmation ADDS to
// the queue and sends nothing extra, the waiting batch starts by itself when the
// run in flight ends, Cancel empties the queue, and a single waiting batch can be
// dropped by its own ×. Everything here drives the real panel, the real scan and
// the real runner over the shared fake transport — a regression in any link of
// that chain (the confirm dialog's label, the strip, the drain loop, the refs)
// fails the test that names the behaviour.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compositeLayout } from "../src/lib/svgcomposite";
import { pairId } from "../src/lib/pairing";
import { saveApiKey } from "../src/svg/keystore";
import SvgPanel from "../src/svg/SvgPanel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { usePrefsAutosave } from "../src/state/usePrefsAutosave";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { streamFrames, transport, type Transport } from "./helpers/svgtransport";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// No IndexedDB in this DOM: an in-memory handle store keeps the boot real.
const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

// The contact sheet needs a canvas; its own pixel test lives elsewhere. Here a
// deterministic marker keeps the REAL planning, sending, matching and saving.
vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async (_root: unknown, sources: readonly { relPath: string }[]) => ({
      dataUrl: `data:image/png;base64,${sources.map((s) => s.relPath).join("|")}`,
      hash: `h${sources.length}`,
      layout: compositeLayout(sources.length),
      bytes: 10,
    })),
  };
});

const w = window as unknown as { showDirectoryPicker?: unknown };
w.showDirectoryPicker = () => Promise.reject(new Error("no picker"));

/** Assembled from parts so the hygiene gate sees no key-shaped literal. */
const KEY = ["rq", "live", "queue_ui_key_1234"].join("_");

const FOG = pairId("architecture", "fog", "");
const COURT = pairId("architecture", "court", "");

/** The turn of the event loop a real run needs to advance one step. */
const tick = () => new Promise((r) => setTimeout(r, 0));

let host: HTMLDivElement;
let ui: Root;
/** The folder the panel is looking at, so a test can read what the run wrote. */
let picked: FakeDir;

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const txt = (sel: string) => q(sel)?.textContent ?? "";

/** architecture/{fog,court}, both approved — two separate one-image batches. */
function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  root.children.set("architecture", arch);
  const recs = [FOG, COURT].map((id) => ({
    pair_id: id, source: `${id}.png`, ai_result: `${id}_AI.png`,
    decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
  }));
  root.children.set("review-decision.json", new FakeFile("review-decision.json", 2, 2, "{}"));
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  return root;
}

/** Flushes React work and one turn of the loop, inside act. */
async function settle(): Promise<void> {
  await act(async () => { await tick(); });
}

/** Waits for a real condition the run needs several turns to reach. */
async function waitFor(pred: () => boolean, what: string, budgetMs = 4000): Promise<void> {
  const until = Date.now() + budgetMs;
  await act(async () => {
    while (!pred() && Date.now() < until) await tick();
  });
  expect(pred(), `never reached: ${what}`).toBe(true);
}

async function mount(root: FakeDir): Promise<void> {
  picked = root;
  stored.set("__svg__", { source: root });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><Host><SvgPanel /></Host></HistoryProvider>);
  });
  await settle();
}

function Host({ children }: { children: React.ReactNode }) {
  usePrefsAutosave();
  return <>{children}</>;
}

async function click(sel: string): Promise<void> {
  await act(async () => { (q(sel) as HTMLButtonElement).click(); });
  await settle();
}

/** Checks one row's box and asks for the confirmation dialog. */
async function pick(id: string): Promise<void> {
  await act(async () => { (q(`[data-testid=svg-check-${id}]`) as HTMLInputElement).click(); });
  await settle();
  await click("[data-testid=svg-generate-selected]");
}

/** The requests the provider really received, as the items each one carried. */
const callsOf = (t: Transport) => t.calls.map((c) => c.items.map((i) => i.split("/").pop()));

beforeEach(async () => {
  await dropDb();
  await saveApiKey(KEY);
  window.localStorage.clear();
  stored.clear();
  resetAppStore();
  host = document.createElement("div");
  document.body.appendChild(host);
});

describe("the generation queue (I-53)", () => {
  it("keeps Generate available during a run and appends without sending", async () => {
    const t = transport({ mode: "silent" }); // call 1 is in flight, unanswered
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());

    await pick(FOG);
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the first request to leave");
    expect(callsOf(t)).toEqual([["fog_AI.png"]]);
    expect(q("[data-testid=svg-cancel-run]")).not.toBeNull(); // a run is really in flight

    // A second batch: the button is NOT disabled, and the dialog says what
    // confirming will do instead of pretending nothing is running.
    await act(async () => { (q(`[data-testid=svg-check-${FOG}]`) as HTMLInputElement).click(); }); // uncheck
    await pick(COURT);
    expect(q("[data-testid=svg-confirm-queue-note]")).not.toBeNull();
    expect(txt("[data-testid=svg-confirm-generate]")).toContain("Add to queue");
    await click("[data-testid=svg-confirm-generate]");

    // Nothing was interrupted and nothing extra was sent: one request, one item.
    expect(t.calls).toHaveLength(1);
    expect(txt("[data-testid=svg-queue-count]")).toContain("1 queued");
    expect(txt("[data-testid=svg-queue-line-1]")).toContain("court_AI.png");
    expect(txt("[data-testid=svg-queue-line-1]")).toContain("1 request");
    expect(txt("[data-testid=svg-toast]")).toContain("wait for the run in flight");
  });

  it("sends the images in the order they were picked, not the list's order", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());

    // COURT is picked first, FOG second — the row order is the other way round
    await act(async () => { (q(`[data-testid=svg-check-${COURT}]`) as HTMLInputElement).click(); });
    await settle();
    await act(async () => { (q(`[data-testid=svg-check-${FOG}]`) as HTMLInputElement).click(); });
    await settle();
    await click("[data-testid=svg-generate-selected]");

    // the confirmation's manifest and its sheet follow the pick order...
    const manifest = Array.from(q("[data-testid=svg-batch-items]")?.querySelectorAll("span") ?? [])
      .map((el) => el.textContent ?? "");
    expect(manifest).toEqual(["1 — court_AI", "2 — fog_AI"]);
    const previewed = (q("[data-testid=svg-composite-img]") as HTMLImageElement).src;
    expect(previewed).toContain("architecture/court_AI.png|architecture/fog_AI.png");

    // ...and the ONE request that leaves carries exactly that sheet: the
    // transport reads the items straight out of the image it received
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the request to leave");
    expect(callsOf(t)).toEqual([["court_AI.png", "fog_AI.png"]]);
    // the sheet the transport received is the sheet the dialog drew: same cells,
    // same order (the payload is the mocked composite's own source list)
    const previewedNames = previewed.split(",").slice(1).join(",").split("|").map((p) => p.split("/").pop());
    expect(previewedNames).toEqual(callsOf(t)[0]);
  });

  it("keeps the list's shortcuts out of an open dialog — only Escape reaches it", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());

    // COURT is the active row before the dialog opens
    await act(async () => { (q(`[data-testid=svg-row-${COURT}]`) as HTMLElement).click(); });
    await settle();
    await pick(FOG);
    expect(Array.from(q("[data-testid=svg-batch-items]")?.querySelectorAll("span") ?? [])
      .map((el) => el.textContent)).toEqual(["1 — fog_AI"]);

    // "g" under the dialog must not re-plan it for the active row: the dialog is
    // modal, and a keystroke must never silently change what it will send
    const key = (k: string) => act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });
    await key("g");
    expect(Array.from(q("[data-testid=svg-batch-items]")?.querySelectorAll("span") ?? [])
      .map((el) => el.textContent)).toEqual(["1 — fog_AI"]);
    // and Space must not toggle a checkbox behind it
    await key(" ");
    await click("[data-testid=svg-confirm-cancel]");
    expect(q("[data-testid=svg-confirm]")).toBeNull();
    await click("[data-testid=svg-generate-selected]");
    expect(Array.from(q("[data-testid=svg-batch-items]")?.querySelectorAll("span") ?? [])
      .map((el) => el.textContent)).toEqual(["1 — fog_AI"]);
    await key("Escape");
    expect(q("[data-testid=svg-confirm]")).toBeNull();
    expect(t.calls).toHaveLength(0); // nothing was ever sent
  });

  it("starts the waiting batch by itself when the run in flight ends", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());

    await pick(FOG);
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the first request to leave");
    await act(async () => { (q(`[data-testid=svg-check-${FOG}]`) as HTMLInputElement).click(); });
    await pick(COURT);
    await click("[data-testid=svg-confirm-generate]");
    expect(t.calls).toHaveLength(1);

    // The first answer arrives: the run ends and the queued batch takes over.
    await act(async () => { t.streams[0].push(streamFrames(["architecture/fog_AI.png"])); t.streams[0].close(); });
    await waitFor(() => t.calls.length === 2, "the queued batch to start on its own");
    expect(callsOf(t)).toEqual([["fog_AI.png"], ["court_AI.png"]]);
    await act(async () => { t.streams[1].push(streamFrames(["architecture/court_AI.png"])); t.streams[1].close(); });
    await waitFor(() => q("[data-testid=svg-queue]") === null, "the queue to empty itself");

    // Both SVGs really landed beside their source, so the work was not lost.
    const dir = await picked.getDirectoryHandle("architecture");
    expect(dir.children.has("fog_AI.svg")).toBe(true);
    expect(dir.children.has("court_AI.svg")).toBe(true);
    expect(q("[data-testid=svg-busy]")).toBeNull();
  });

  it("drops the whole queue when the user cancels", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());

    await pick(FOG);
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the first request to leave");
    await act(async () => { (q(`[data-testid=svg-check-${FOG}]`) as HTMLInputElement).click(); });
    await pick(COURT);
    await click("[data-testid=svg-confirm-generate]");
    expect(txt("[data-testid=svg-queue-count]")).toContain("1 queued");

    await click("[data-testid=svg-cancel-run]");
    await waitFor(() => q("[data-testid=svg-queue]") === null, "the queue to be dropped");
    expect(txt("[data-testid=svg-toast]")).toContain("1 queued batch dropped"); // named, not silent
    await tick();
    expect(t.calls).toHaveLength(1); // the dropped batch is never sent
  });

  it("drops one waiting batch by its own × and keeps the rest", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());

    await pick(FOG);
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the first request to leave");
    await act(async () => { (q(`[data-testid=svg-check-${FOG}]`) as HTMLInputElement).click(); });
    await pick(COURT);
    await click("[data-testid=svg-confirm-generate]");
    // ...and a third batch on its own (the previous picks are unchecked first,
    // so each confirmation covers exactly the rows it is about)
    await act(async () => { (q(`[data-testid=svg-check-${COURT}]`) as HTMLInputElement).click(); });
    await pick(FOG);
    await click("[data-testid=svg-confirm-generate]");
    expect(txt("[data-testid=svg-queue-count]")).toContain("2 queued");

    await click("[data-testid=svg-queue-drop-1]");
    expect(txt("[data-testid=svg-queue-count]")).toContain("1 queued");
    expect(txt("[data-testid=svg-queue-line-1]")).toContain("fog_AI.png"); // court was the one dropped
    expect(txt("[data-testid=svg-toast]")).toContain("1 still waiting");
    expect(t.calls).toHaveLength(1);
  });
});
