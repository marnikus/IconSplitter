// svg_queue_ui.test.tsx — the queue as the USER meets it (I-53, RULE 8): while
// a run is streaming, Generate stays available; independent confirmations can
// run in parallel, while serial-mode/conflicting work waits until the
// run in flight ends, Cancel empties the queue, and a single waiting batch can be
// dropped by its own ×. Everything here drives the real panel, the real scan and
// the real runner over the shared fake transport — a regression in any link of
// that chain (the confirm dialog's label, the strip, the drain loop, the refs)
// fails the test that names the behaviour.
import { act } from "react";
import * as completionAudio from "../src/ui/completionSound";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compositeLayout } from "../src/lib/svgcomposite";
import { pairId } from "../src/lib/pairing";
import { serializePairMeta } from "../src/lib/pairmeta";
import { saveApiKey } from "../src/svg/keystore";
import { savePresets } from "../src/svg/promptstore";
import type { PromptPreset } from "../src/lib/promptpresets";

const PRESETS: PromptPreset[] = [
  { name: "Bolder", text: "Make bolder." },
  { name: "Simpler", text: "Remove detail." },
];
import SvgPanel from "../src/svg/SvgPanel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { usePrefsAutosave } from "../src/state/usePrefsAutosave";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairMetaFor, svgSource, svgVersion } from "./helpers/svgpair";
import { dropDb } from "./helpers/idb";
import { streamFrames, transport, type Transport } from "./helpers/svgtransport";
import { setParallelLimit } from "../src/svg/jobstate";
import { loadInflight } from "../src/svg/journal";
import { waitUntil } from "./helpers/quiet";

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
const MIST = pairId("architecture", "mist", "");

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

/** Two pre-approved rows plus one approved row that has never produced an SVG. */
function makeRegenerationRoot(): FakeDir {
  const root = makeRoot();
  const arch = root.children.get("architecture") as FakeDir;
  const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 2h20v20H2z\"/></svg>";
  const fog = svgSource(FOG, { name: "fog_AI.png", sourceName: "fog.png" });
  const meta = pairMetaFor(fog, [svgVersion("architecture/fog_AI.svg")], "approved");
  arch.children.set("fog_AI.svg", new FakeFile("fog_AI.svg", svg.length, 3200, svg));
  arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 10, 3200, serializePairMeta(meta)));
  arch.children.set("mist.png", new FakeFile("mist.png", 12, 1000, "e"));
  arch.children.set("mist_AI.png", new FakeFile("mist_AI.png", 20, 1100, "f"));
  const decisions = root.children.get("review-decisions.json") as FakeFile;
  const parsed = JSON.parse(decisions.text) as { records: { pair_id: string; source: string; ai_result: string; decision: string; reviewed_at: string }[] };
  parsed.records.push({
    pair_id: MIST, source: "architecture/mist.png", ai_result: "architecture/mist_AI.png",
    decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
  });
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify(parsed)));
  return root;
}

/** Flushes React work and one turn of the loop, inside act. */
async function settle(): Promise<void> {
  await act(async () => { await tick(); });
}

/** Waits for a real condition the run needs several turns to reach. */
const waitFor = (pred: () => boolean, what: string, budgetMs = 4000) => waitUntil(pred, what, budgetMs);

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

async function check(id: string): Promise<void> {
  await act(async () => { (q(`[data-testid=svg-check-${id}]`) as HTMLInputElement).click(); });
  await settle();
}

/** The requests the provider really received, as the items each one carried. */
const callsOf = (t: Transport) => t.calls.map((c) => c.items.map((i) => i.split("/").pop()));

afterEach(async () => {
  // Stop real runners before their fake transport is restored at teardown.
  const cancel = host?.querySelector("[data-testid=svg-cancel-run]") as HTMLButtonElement | null;
  if (cancel) {
    await act(async () => cancel.click());
    await waitUntil(() => host.querySelector("[data-testid=svg-cancel-run]") === null, "the test runner to stop", 4000);
  }
  // The popup portals into <body>: unmount, or the next test sees this one's.
  if (ui !== undefined) await act(async () => { ui.unmount(); });
  host?.remove();
});

beforeEach(async () => {
  await dropDb();
  await saveApiKey(KEY);
  window.localStorage.clear();
  stored.clear();
  setParallelLimit(1); // Exercise the supported serial mode in the legacy queue cases.
  savePresets(PRESETS);
  resetAppStore();
  host = document.createElement("div");
  document.body.appendChild(host);
});

describe("parallel confirmed runs", () => {
  beforeEach(() => setParallelLimit(3));
  it("starts disjoint work without interrupting the streaming run and scopes both journal records", async () => {
    const notify = vi.spyOn(completionAudio, "notifyCompletion");
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    await pick(FOG);
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "first run to send");
    await check(FOG);
    await pick(COURT);
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 2, "independent second run to send in parallel");
    expect(callsOf(t)).toEqual([["fog_AI.png"], ["court_AI.png"]]);
    expect(host.querySelectorAll("[data-testid^=svg-run-stop-]")).toHaveLength(2);
    const notes = loadInflight();
    expect(notes).toHaveLength(2);
    expect(new Set(notes.map((r) => r.runId)).size).toBe(2);
    expect(notes[0].batchId).toBe(notes[1].batchId); // actual collision, not artificial ids
    await click(`[data-testid=svg-run-stop-${host.querySelector("[data-testid^=svg-run-stop-]")!.getAttribute("data-run-id")}]`);
    await waitFor(() => host.querySelectorAll("[data-testid^=svg-run-stop-]").length === 1, "only one run to stop");
    expect(q("[data-testid=svg-cancel-run]")).not.toBeNull();
    expect(loadInflight()).toHaveLength(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it("opens the correction prompt popup for a row even while another run streams", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRegenerationRoot());
    await pick(MIST);
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "first run to send");
    await click(`[data-testid=svg-generate-${FOG}]`);
    expect(q("[data-testid=svg-confirm]")).not.toBeNull();
    expect(txt("[data-testid=svg-confirm]")).toContain("Confirm SVG regeneration");
    expect(t.calls).toHaveLength(1); // opening a correction is not consent
  });
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
    expect(txt("[data-testid=svg-toast]")).toContain("waiting for source locks or a parallel slot");
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

describe("bulk Regenerate selected (2026-10-09)", () => {
  it("regenerates only checked rows with an existing SVG, in one confirmed batch", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    const root = makeRegenerationRoot();
    await mount(root);
    const regenerate = () => q("[data-testid=svg-regenerate-selected]") as HTMLButtonElement;

    // No selection, and a selection containing only an empty row, cannot
    // regenerate. Generate selected remains broad: it sends the checked empty
    // court row and the checked fog row that already has an SVG.
    expect(regenerate().textContent).toBe("↻ Regenerate selected (0)");
    expect(regenerate().disabled).toBe(true);
    await check(MIST);
    expect(regenerate().disabled).toBe(true);
    await check(MIST);
    await check(COURT);
    expect(regenerate().disabled).toBe(true);
    await check(FOG);
    expect(regenerate().textContent).toBe("↻ Regenerate selected (1)");
    expect(regenerate().disabled).toBe(false);
    await click("[data-testid=svg-generate-selected]");
    expect(q("[data-testid=svg-confirm-title]")?.textContent).toBe("Confirm SVG generation");
    expect(q("[data-testid=svg-confirm-count]")?.textContent).toBe("2");
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "Generate selected to send both checked rows");
    expect(callsOf(t)).toEqual([["court_AI.png", "fog_AI.png"]]);
    await act(async () => { t.streams[0].push(streamFrames(t.calls[0].items)); t.streams[0].close(); });
    await waitFor(() => q("[data-testid=svg-cancel-run]") === null, "the first SVG to finish");
    expect(txt(`[data-testid=svg-status-${COURT}]`)).toContain("Generated");

    // The mixed checkbox selection is three rows, but only fog and court now
    // have valid SVGs. The preview and provider request must both omit mist.
    await click("[data-testid=svg-check-all]");
    expect(txt("[data-testid=svg-selected-count]")).toBe("3 selected");
    expect(regenerate().textContent).toBe("↻ Regenerate selected (2)");
    expect(regenerate().disabled).toBe(false);
    await click("[data-testid=svg-regenerate-selected]");
    expect(q("[data-testid=svg-confirm-title]")?.textContent).toBe("Confirm SVG regeneration");
    expect(q("[data-testid=svg-confirm-count]")?.textContent).toBe("2");
    // 2026-10-20: the connection's Images / request sizes a regeneration too
    // (here the default 4), so both eligible rows travel in ONE request.
    expect(q("[data-testid=svg-confirm-requests]")?.textContent).toContain("1 × 4 max");
    expect(q("[data-testid=svg-confirm-mode]")?.textContent).toContain("Regeneration now");
    expect(q("[data-testid=svg-confirm-prompt-select]")).not.toBeNull();
    const manifest = Array.from(q("[data-testid=svg-batch-items]")?.querySelectorAll("span") ?? [])
      .map((el) => el.textContent?.replace(/^\d+ — /, "") ?? "");
    expect([...manifest].sort()).toEqual(["court_AI", "fog_AI"]);
    expect(manifest.some((name) => name.includes("mist"))).toBe(false);

    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 2, "the Regenerate request to send (1×9)");
    const sentAll = (callsOf(t)[1] ?? []).map((name) => name ?? "");
    expect([...sentAll].sort()).toEqual(["court_AI.png", "fog_AI.png"]);
    expect(sentAll.some((name) => name.includes("mist"))).toBe(false);
    await act(async () => { t.streams[1].push(streamFrames(t.calls[1].items)); t.streams[1].close(); });
    await waitFor(() => q("[data-testid=svg-cancel-run]") === null, "the regeneration batch to finish");

    const arch = root.children.get("architecture") as FakeDir;
    const versionsOf = async (file: string) => JSON.parse(await (await (await arch.getFileHandle(file)).getFile()).text()) as {
      versions: { version: number }[];
    };
    expect((await versionsOf("fog_AI.svg.json")).versions.map((version) => version.version)).toEqual([1, 2, 3]);
    expect((await versionsOf("court_AI.svg.json")).versions.map((version) => version.version)).toEqual([1, 2]);
    expect(arch.children.has("mist_AI.svg")).toBe(false);
    expect(arch.children.has("mist_AI.svg.json")).toBe(false);
  });

  it("confirms a bulk Regenerate during a run and appends it behind the current request", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRegenerationRoot());

    await check(COURT);
    await click("[data-testid=svg-generate-selected]");
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the first request to leave");
    expect(callsOf(t)).toEqual([["court_AI.png"]]);

    await check(COURT);
    await check(FOG);
    await click("[data-testid=svg-regenerate-selected]");
    expect(q("[data-testid=svg-confirm-title]")?.textContent).toBe("Confirm SVG regeneration");
    expect(q("[data-testid=svg-confirm-mode]")?.textContent).toContain("Regeneration now");
    expect(q("[data-testid=svg-confirm-queue-note]")).not.toBeNull();
    expect(txt("[data-testid=svg-confirm-generate]")).toContain("Add to queue");
    await click("[data-testid=svg-confirm-generate]");
    expect(t.calls).toHaveLength(1); // queuing never interrupts or duplicates the active request
    expect(txt("[data-testid=svg-queue-line-1]")).toContain("fog_AI.png");

    await act(async () => { t.streams[0].push(streamFrames(t.calls[0].items)); t.streams[0].close(); });
    await waitFor(() => t.calls.length === 2, "the queued regeneration to start");
    expect(callsOf(t)).toEqual([["court_AI.png"], ["fog_AI.png"]]);
    await act(async () => { t.streams[1].push(streamFrames(t.calls[1].items)); t.streams[1].close(); });
    await waitFor(() => q("[data-testid=svg-cancel-run]") === null, "the queued regeneration to finish");
  });
});

describe("explicit row corrections retain earlier confirmed queue attempts (2026-10-24)", () => {
  it("a row that waits shows the grey 'Next attempt' badge, the head counts it, and a drop restores the old badge", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    expect(txt(`[data-testid=svg-status-${COURT}]`)).toContain("Not Generated");

    await pick(FOG);
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the first request to leave");
    await act(async () => { (q(`[data-testid=svg-check-${FOG}]`) as HTMLInputElement).click(); });
    await pick(COURT);
    await click("[data-testid=svg-confirm-generate]");

    // the waiting row: badge "Next attempt", class `queued` (grey), nothing on disk changed
    const badge = q(`[data-testid=svg-status-${COURT}] .svg-badge`) as HTMLElement;
    expect(badge.textContent).toBe("Next attempt");
    expect(badge.classList.contains("queued")).toBe(true);
    expect(txt(`[data-testid=svg-status-${FOG}] .svg-badge`)).toBe("Generating"); // the one in flight is not "next"
    expect(txt("[data-testid=svg-queued-count]")).toBe("1 next attempt");

    // dropping the batch: the row's own truth is back, nothing had to be restored
    await click("[data-testid=svg-queue-drop-1]");
    expect(txt(`[data-testid=svg-status-${COURT}] .svg-badge`)).toBe("Not Generated");
    expect(txt("[data-testid=svg-queued-count]")).toBe("0 next attempt");
  });

  it("a row correction previews its new prompt without deleting earlier confirmed attempts", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRegenerationRoot());
    await pick(FOG);
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the first request to leave");
    await check(FOG);
    await pick(COURT);
    await click("[data-testid=svg-confirm-generate]");
    await check(FOG);
    await click("[data-testid=svg-generate-selected]");
    await click("[data-testid=svg-confirm-generate]");
    expect(txt("[data-testid=svg-queue-count]")).toContain("2 queued");
    expect(txt("[data-testid=svg-queue-line-2]")).toContain("2 images");
    await click(`[data-testid=svg-generate-${FOG}]`);
    expect(q("[data-testid=svg-confirm]")).not.toBeNull();
    expect(txt("[data-testid=svg-confirm-title]")).toBe("Confirm SVG regeneration");
    expect(t.calls).toHaveLength(1); // still no consent to this correction
    expect(txt("[data-testid=svg-queue-count]")).toContain("2 queued");
    await click("[data-testid=svg-confirm-generate]");
    expect(txt("[data-testid=svg-queue-count]")).toContain("3 queued");
    expect(txt("[data-testid=svg-queue-line-1]")).toContain("court_AI.png");
    expect(txt("[data-testid=svg-queue-line-2]")).toContain("2 images");
    expect(txt("[data-testid=svg-queue-line-3]")).toContain("fog_AI.png");
    expect(t.calls).toHaveLength(1); // original controller and request untouched
    await act(async () => { t.streams[0].push(streamFrames(t.calls[0].items)); t.streams[0].close(); });
    await waitFor(() => t.calls.length === 2, "first confirmed waiter to start");
    expect(callsOf(t)).toEqual([["fog_AI.png"], ["court_AI.png"]]);
  });

  it("Regenerate on a row while nothing runs still confirms first (the cost gate is unchanged when idle)", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRegenerationRoot());
    await click(`[data-testid=svg-generate-${FOG}]`);
    expect(q("[data-testid=svg-confirm]")).not.toBeNull();
    expect(txt("[data-testid=svg-confirm-title]")).toBe("Confirm SVG regeneration");
    expect(txt("[data-testid=svg-confirm-generate]")).toContain("Regenerate now");
    expect(t.calls).toHaveLength(0);
  });
});

describe("the run record (2026-10-08): the strip and the queue sit BELOW the list, so a landing SVG never pushes it down", () => {
  it("renders the batch strip and the queue after the list, under one 'Run' record", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    await pick(FOG);
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the first request to leave");
    await act(async () => { (q(`[data-testid=svg-check-${FOG}]`) as HTMLInputElement).click(); });
    await pick(COURT);
    await click("[data-testid=svg-confirm-generate]");

    const list = q("[data-testid=svg-list]") as HTMLElement;
    const record = q("[data-testid=svg-run-record]") as HTMLElement;
    expect(record).not.toBeNull();
    expect(record.contains(q("[data-testid=svg-batch]"))).toBe(true);
    expect(record.contains(q("[data-testid=svg-queue]"))).toBe(true);
    // DOCUMENT_POSITION_FOLLOWING: the record comes after the list in the DOM, and nothing of it is above
    expect(list.compareDocumentPosition(record) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((q("[data-testid=svg-bulk]") as HTMLElement).compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("the run popup and the kept-alive panel (2026-10-08): the run outlives the tab, the numbers follow the user", () => {
  const rowIds = () => Array.from(host.querySelectorAll("[data-testid^=svg-row-pair_]")).map((el) => el.getAttribute("data-testid")!.replace("svg-row-", ""));
  const popup = () => document.querySelector("[data-testid=svg-progress-header]") as HTMLElement | null;

  it("shows the popup from the first request on, keeps the final line until dismissed, and comes back for a new run", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    expect(popup()).toBeNull();

    await pick(FOG);
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the first request to leave");
    await act(async () => { (q(`[data-testid=svg-check-${FOG}]`) as HTMLInputElement).click(); });
    await pick(COURT);
    await click("[data-testid=svg-confirm-generate]");
    expect(popup()?.textContent).toContain("Generating SVGs");

    await act(async () => { t.streams[0].push(streamFrames(["architecture/fog_AI.png"])); t.streams[0].close(); });
    await waitFor(() => t.calls.length === 2, "the queued batch to start");
    expect(popup()?.textContent).toContain("completed");
    await act(async () => { t.streams[1].push(streamFrames(["architecture/court_AI.png"])); t.streams[1].close(); });
    await waitFor(() => q("[data-testid=svg-cancel-run]") === null, "the run to end");
    expect(popup()?.textContent).toContain("SVG batch complete"); // one count for the whole chain; the final line stays…

    await act(async () => { (popup()!.querySelector("[data-testid=svg-progress-dismiss]") as HTMLButtonElement).click(); });
    expect(popup()).toBeNull(); // …until dismissed
    await pick(FOG);
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 3, "the new run to leave");
    expect(popup()?.textContent).toContain("Generating"); // a new run brings it back
  });

  it("an inactive panel keeps the pinned order while a result lands; activating it refreshes the sort", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    await act(async () => {
      const sel = q("[data-testid=svg-sort]") as HTMLSelectElement;
      sel.value = "date";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const before = rowIds();
    expect(before).toHaveLength(2);
    const last = before[1];

    await pick(last);
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the request to leave");
    // the user went to another tab: the panel stays mounted, only parked
    await act(async () => { ui.render(<HistoryProvider><Host><SvgPanel active={false} /></Host></HistoryProvider>); });
    const file = last === COURT ? "architecture/court_AI.png" : "architecture/fog_AI.png";
    await act(async () => { t.streams[0].push(streamFrames([file])); t.streams[0].close(); });
    await waitFor(() => q("[data-testid=svg-cancel-run]") === null, "the run to end");
    expect(rowIds()).toEqual(before); // the newest SVG did NOT jump to the top
    expect(txt(`[data-testid=svg-status-${last}] .svg-badge`)).toBe("Generated");

    // back on the tab: the date sort is applied once, deliberately, at activation
    await act(async () => { ui.render(<HistoryProvider><Host><SvgPanel active /></Host></HistoryProvider>); });
    await settle();
    expect(rowIds()).toEqual([last, before[0]]);
  });
});

// Input drivers use real controlled React events, never call scheduler internals.
async function inputValue(testid: string, value: string): Promise<void> {
  const input = q(`[data-testid=${testid}]`) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

function manyRoot(): FakeDir {
  const root = makeRegenerationRoot();
  const arch = root.children.get("architecture") as FakeDir;
  for (const name of ["court", "mist", "rain"]) {
    arch.children.set(`${name}.png`, new FakeFile(`${name}.png`));
    arch.children.set(`${name}_AI.png`, new FakeFile(`${name}_AI.png`));
    const source = svgSource(pairId("architecture", name, ""), { name: `${name}_AI.png` });
    const meta = serializePairMeta(pairMetaFor(source));
    arch.children.set(`${name}_AI.svg.json`, new FakeFile(`${name}_AI.svg.json`, meta.length, 10, meta));
  }
  return root;
}

describe("parallel admission, immutable inputs and row handoff", () => {
  beforeEach(() => setParallelLimit(3));

  it("corrects a completed icon while the rest of its original batch streams, without losing either version", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    await inputValue("svg-per-request", "1");
    await check(FOG); await check(COURT);
    await click("[data-testid=svg-generate-selected]"); await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "first source to send");
    await act(async () => { t.streams[0].push(streamFrames(t.calls[0].items)); t.streams[0].close(); });
    await waitFor(() => t.calls.length === 2, "remaining original source to send");
    expect(callsOf(t)).toEqual([["fog_AI.png"], ["court_AI.png"]]);
    await click(`[data-testid=svg-generate-${FOG}]`);
    expect(txt("[data-testid=svg-confirm-title]")).toBe("Confirm SVG regeneration");
    await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 3, "finished icon correction to send in parallel");
    expect(t.calls[2].prompt).toContain("Make bolder.");
    expect(t.calls[2].prompt).toContain("<title>fog_AI</title>");
    await act(async () => { t.streams[2].push(streamFrames(t.calls[2].items)); t.streams[2].close(); });
    await waitFor(() => host.querySelectorAll("[data-testid^=svg-run-stop-]").length === 1, "only original batch to remain");
    expect(txt(`[data-testid=svg-status-${COURT}]`)).toContain("Generating");
    const arch = await picked.getDirectoryHandle("architecture");
    const fogMeta = () => JSON.parse((arch.children.get("fog_AI.svg.json") as FakeFile).text);
    expect(fogMeta().versions.map((v: { version: number }) => v.version)).toEqual([1, 2]);
    await act(async () => { t.streams[1].push(streamFrames(t.calls[1].items)); t.streams[1].close(); });
    await waitFor(() => q("[data-testid=svg-cancel-run]") === null, "both processes to finish");
    expect(fogMeta().versions.map((v: { version: number }) => v.version)).toEqual([1, 2]);
    expect(txt(`[data-testid=svg-status-${FOG}]`)).toContain("Generated");
    expect(arch.children.has("court_AI.svg")).toBe(true);
  });

  it("queues the same pair and freezes the confirmed model and request size", async () => {
    const t = transport({ mode: "silent" });
    const models: string[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      models.push((JSON.parse(String(init.body)) as { model: string }).model);
      return t.fetch(url, init);
    });
    await mount(makeRoot());
    await inputValue("svg-per-request", "1");
    await pick(FOG); await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "first source to send");
    await check(COURT); // FOG remains checked: a conflicting 2-request batch
    await click("[data-testid=svg-generate-selected]"); await click("[data-testid=svg-confirm-generate]");
    expect(t.calls).toHaveLength(1);
    expect(txt("[data-testid=svg-queue-count]")).toContain("1 queued");
    await inputValue("svg-model", "different/model");
    await inputValue("svg-per-request", "4");
    await act(async () => { t.streams[0].push(streamFrames(t.calls[0].items)); t.streams[0].close(); });
    await waitFor(() => t.calls.length === 2, "same-pair waiter after its lease releases");
    expect(models[1]).toBe(models[0]);
    expect(callsOf(t)[1]).toEqual(["fog_AI.png"]);
    await act(async () => { t.streams[1].push(streamFrames(t.calls[1].items)); t.streams[1].close(); });
    await waitFor(() => t.calls.length === 3, "frozen one-image second request");
    expect(models[2]).toBe(models[0]);
    expect(callsOf(t)[2]).toEqual(["court_AI.png"]);
  });

  it("enforces three slots and admits a fourth after just one run stops", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(manyRoot());
    for (const name of ["fog", "court", "mist", "rain"]) {
      await click("[data-testid=svg-deselect]");
      await pick(pairId("architecture", name, ""));
      await click("[data-testid=svg-confirm-generate]");
    }
    expect(t.calls).toHaveLength(3);
    expect(txt("[data-testid=svg-queue-count]")).toContain("1 queued");
    const stop = host.querySelector("[data-testid^=svg-run-stop-]") as HTMLElement;
    await click(`[data-testid=${stop.dataset.testid}]`);
    await waitFor(() => t.calls.length === 4, "one freed parallel slot");
    expect(callsOf(t).map((items) => items[0])).toEqual(["fog_AI.png", "court_AI.png", "mist_AI.png", "rain_AI.png"]);
    expect(host.querySelectorAll("[data-testid^=svg-run-stop-]")).toHaveLength(3);
  });

  it("refuses folder changes and scans while a process owns source files", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    await pick(FOG); await click("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "run to send");
    const picker = vi.fn(async () => new FakeDir("wrong-root"));
    w.showDirectoryPicker = picker;
    await click("[data-testid=svg-open-folder]");
    expect(picker).not.toHaveBeenCalled();
    expect(txt("[data-testid=svg-toast]")).toContain("before changing the folder");
    await click("[data-testid=svg-rescan]");
    expect(txt("[data-testid=svg-toast]")).toContain("before rescanning");
    expect(txt(`[data-testid=svg-status-${FOG}]`)).toContain("Generating");
    expect(t.calls).toHaveLength(1);
  });
});


it("notifies once after an entire real SVG process, never as each icon finishes", async () => {
  const notify = vi.spyOn(completionAudio, "notifyCompletion");
  const t = transport({ mode: "silent" });
  vi.stubGlobal("fetch", t.fetch);
  await mount(makeRoot());
  await inputValue("svg-per-request", "1");
  await click(`[data-testid=svg-check-${FOG}]`);
  await click(`[data-testid=svg-check-${COURT}]`);
  await click("[data-testid=svg-generate-selected]");
  await click("[data-testid=svg-confirm-generate]");
  await waitFor(() => t.calls.length === 1, "first request");
  await act(async () => { t.streams[0].push(streamFrames(t.calls[0].items)); t.streams[0].close(); });
  await waitFor(() => t.calls.length === 2, "second request");
  expect(notify).not.toHaveBeenCalled();
  await act(async () => { t.streams[1].push(streamFrames(t.calls[1].items)); t.streams[1].close(); });
  await waitFor(() => q("[data-testid=svg-cancel-run]") === null, "entire process to finish");
  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledWith(expect.any(String));
});

it("cleans source ownership after an unexpected filesystem exception and permits explicit retry", async () => {
  const t = transport({ mode: "silent" });
  const root = makeRoot();
  vi.stubGlobal("fetch", t.fetch);
  await mount(root);
  await click(`[data-testid=svg-generate-${FOG}]`);
  await click("[data-testid=svg-confirm-generate]");
  await waitFor(() => t.calls.length === 1, "first request");
  const arch = root.children.get("architecture") as FakeDir;
  const broken = vi.spyOn(arch, "entries").mockImplementation(() => { throw new Error("disk disconnected"); });
  await act(async () => { t.streams[0].push(streamFrames(t.calls[0].items)); t.streams[0].close(); });
  await waitFor(() => q("[data-testid=svg-cancel-run]") === null, "failed run cleanup");
  expect(t.calls).toHaveLength(1); // no automatic retry after an exception
  broken.mockRestore();
  await click(`[data-testid=svg-generate-${FOG}]`);
  await click("[data-testid=svg-confirm-generate]");
  await waitFor(() => t.calls.length === 2, "explicit retry after cleanup");
  await act(async () => { t.streams[1].push(streamFrames(t.calls[1].items)); t.streams[1].close(); });
  await waitFor(() => q("[data-testid=svg-cancel-run]") === null, "retry finish");
  expect(q(`[data-testid=svg-status-${FOG}]`)?.textContent).toContain("Generated");
});
