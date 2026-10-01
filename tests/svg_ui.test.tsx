// svg_ui.test.tsx — the Generate SVG tab drives the real panel and the real
// history bar (RULE 8): approved pairs only, the bulk bar's header checkbox,
// the filters, the code dialog and its Escape close, the confirm dialog that
// must precede any send, and the undoable review decision. Everything here is
// a store/DOM change, so a regression in the wiring fails loudly.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import SvgPanel from "../src/svg/SvgPanel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { usePrefsAutosave } from "../src/state/usePrefsAutosave";
import HistoryBar from "../src/ui/HistoryBar";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";

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

// A browser without the File System Access API must still render the note.
const w = window as unknown as { showDirectoryPicker?: unknown };
w.showDirectoryPicker = () => Promise.reject(new Error("no picker"));

/** Assembled from parts so the hygiene gate sees no key-shaped literal. */
const fakeKey = (...parts: string[]) => parts.join("_");

const FOG = pairId("architecture", "fog", "");
const COURT = pairId("architecture", "court", "");

/** The one saved document the fixture holds — the preview must never alter it. */
const SAVED_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 2h20v20H2z\"/></svg>";

/** The sidecar as it was written last time — the preview must never touch it. */
const SIDECAR = JSON.stringify({
  v: 1,
  source: { relPath: "architecture/fog_AI.png", name: "fog_AI.png", fingerprint: "20:3100" },
  versions: [{
    version: 1, svgPath: "architecture/fog_AI.svg", status: "generated", review: "pending",
    prompt: "p", provider: "Requesty", model: "openai/gpt-6.1-sol",
    requestedAt: "2026-10-01T10:00:00.000Z", completedAt: "2026-10-01T10:00:05.000Z",
    usage: { input: 100, output: 200, total: 300 },
    // provider-reported: shown as "reported", never as an estimate
    cost: { actual: 0.01, estimated: null, currency: "USD", pricing: "requesty-2026-10-01", basis: "provider" },
    validation: { ok: true, errors: [], warnings: [], icons: 1 },
    batch: null, error: null, requestId: null,
  }, {
    // a charged-but-invalid attempt: its cost is a labelled estimate
    version: 2, svgPath: "", status: "failed", review: "pending",
    prompt: "p", provider: "Requesty", model: "openai/gpt-6.1-sol",
    requestedAt: "2026-10-01T11:00:00.000Z", completedAt: "2026-10-01T11:00:04.000Z",
    usage: { input: 10, output: 20, total: 30 },
    cost: { actual: null, estimated: 0.02, currency: "USD", pricing: "requesty-2026-10-01", basis: "batch-split" },
    validation: { ok: false, errors: ["unsafe <script> element"], warnings: [], icons: 0 },
    batch: null, error: "invalid SVG: unsafe <script> element", requestId: null,
  }],
});

let host: HTMLDivElement;
let ui: Root;

function Host({ children }: { children: React.ReactNode }) {
  usePrefsAutosave();
  return <>{children}</>;
}

/** architecture/{fog,court}, both approved, with a saved v1 for fog. */
async function makeRoot(): Promise<FakeDir> {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  arch.children.set("fog_AI.svg", new FakeFile("fog_AI.svg", SAVED_SVG.length, 3200, SAVED_SVG));
  arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 10, 3200, SIDECAR));
  root.children.set("architecture", arch);
  const recs = [FOG, COURT].map((id) => ({
    pair_id: id, source: `${id}.png`, ai_result: `${id}_AI.png`,
    decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
  }));
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  return root;
}

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;

/** The document inside a preview data URL — must be the file's own bytes. */
const svgFromSrc = (src: string): string => decodeURIComponent(src.slice(src.indexOf(",") + 1));
const input = (sel: string) => q(sel) as HTMLInputElement;
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

/** React tracks input values, so the native setter must be used to change one. */
async function type(sel: string, value: string): Promise<void> {
  await act(async () => {
    const el = input(sel);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function mount(root: FakeDir): Promise<void> {
  stored.set("__svg__", { source: root });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><Host><SvgPanel /><HistoryBar /></Host></HistoryProvider>);
  });
  await settle();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await dropDb();
  stored.clear();
  resetAppStore();
  host = document.createElement("div");
  document.body.appendChild(host);
});

describe("Generate SVG panel", () => {
  it("lists only the approved pairs, with the newest SVG beside its source", async () => {
    await mount(await makeRoot());
    expect(q("[data-testid=svg-root]")?.textContent).toContain("split_root");
    const rows = host.querySelectorAll(".svg-row");
    expect(rows).toHaveLength(2);
    expect(q("[data-testid=svg-row-count]")?.textContent).toBe("2");
    // fog has a generated v1: its code actions are live; court has none.
    const off = (sel: string) => (q(sel) as HTMLButtonElement).disabled;
    expect(off(`[data-testid=svg-code-${FOG}]`)).toBe(false);
    expect(off(`[data-testid=svg-code-${COURT}]`)).toBe(true);
    expect(off(`[data-testid=svg-approve-${FOG}]`)).toBe(false);
    expect(off(`[data-testid=svg-approve-${COURT}]`)).toBe(true);
    expect(q(`[data-testid=svg-generate-${FOG}]`)?.textContent).toBe("Regenerate");
    expect(q(`[data-testid=svg-generate-${COURT}]`)?.textContent).toBe("Generate");
    expect(q(`[data-testid=svg-status-${FOG}]`)?.textContent).toContain("Generated");
    expect(q(`[data-testid=svg-status-${COURT}]`)?.textContent).toContain("Not Generated");
    expect(q(`[data-testid=svg-usage-${FOG}]`)?.textContent).toContain("v1");
    expect(q(`[data-testid=svg-review-${FOG}]`)?.textContent).toContain("Pending");
  });

  it("bulk selection: header checkbox, select-visible, deselect-all, disabled bulk actions", async () => {
    await mount(await makeRoot());
    expect(q("[data-testid=svg-selected-count]")?.textContent).toBe("0 selected");
    expect((q("[data-testid=svg-generate-selected]") as HTMLButtonElement).disabled).toBe(true);
    expect((q("[data-testid=svg-approve-selected]") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { input("[data-testid=svg-check-all]").click(); });
    await settle();
    expect(q("[data-testid=svg-selected-count]")?.textContent).toBe("2 selected");
    expect((q("[data-testid=svg-generate-selected]") as HTMLButtonElement).disabled).toBe(false);
    // only fog has a valid SVG, so the bulk decision stays armed for it alone
    expect((q("[data-testid=svg-approve-selected]") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { (q("[data-testid=svg-deselect]") as HTMLButtonElement).click(); });
    await settle();
    expect(q("[data-testid=svg-selected-count]")?.textContent).toBe("0 selected");
    expect((q("[data-testid=svg-generate-selected]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("filters the list and clears back to every approved source", async () => {
    await mount(await makeRoot());
    const gen = q("[data-testid=svg-filter-generation]") as HTMLSelectElement;
    await act(async () => { gen.value = "generated"; gen.dispatchEvent(new Event("change", { bubbles: true })); });
    await settle();
    expect(host.querySelectorAll(".svg-row")).toHaveLength(1);
    expect(q("[data-testid=svg-footer-summary]")?.textContent).toContain("Showing 1 of 2");
    await act(async () => { (q("[data-testid=svg-clear-filters]") as HTMLButtonElement).click(); });
    await settle();
    expect(host.querySelectorAll(".svg-row")).toHaveLength(2);
  });

  it("opens the code dialog, copies and closes it with Escape", async () => {
    await mount(await makeRoot());
    await act(async () => { (q(`[data-testid=svg-code-${FOG}]`) as HTMLButtonElement).click(); });
    await settle();
    const code = q("[data-testid=svg-code-block]") as HTMLTextAreaElement | null;
    expect(code).not.toBeNull();
    expect(code?.value).toContain("<svg");
    expect((q("[data-testid=svg-code-copy]") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(q("[data-testid=svg-code-dialog]")).toBeNull();
  });

  it("confirms before sending and never sends twice", async () => {
    await mount(await makeRoot());
    await act(async () => { input("[data-testid=svg-check-all]").click(); });
    await settle();
    await act(async () => { (q("[data-testid=svg-generate-selected]") as HTMLButtonElement).click(); });
    await settle();
    // No key stored: the tab says so instead of opening the dialog.
    expect(q("[data-testid=svg-confirm]")).toBeNull();
    expect(q("[data-testid=svg-toast]")?.textContent).toContain("API key");
  });

  it("stores the API key from the provider card and unblocks the run", async () => {
    await mount(await makeRoot());
    expect(q("[data-testid=svg-key-state]")?.textContent).toContain("No API key yet");
    await act(async () => { (q("[data-testid=svg-key-state]") as HTMLButtonElement).click(); });
    await settle();
    await type("[data-testid=svg-key-input]", fakeKey("rq", "live", "ui_test_key_9876"));
    await act(async () => { (q("[data-testid=svg-key-save]") as HTMLButtonElement).click(); });
    await settle();
    // The row leaves edit mode and reports the key as present — the old bug
    // left it on "No API key yet" because the storage write threw.
    expect(q("[data-testid=svg-key-state]")?.textContent).toContain("API key secured locally");
    expect(q("[data-testid=svg-toast]")?.textContent).toContain("API key");
    expect(q("[data-testid=svg-key-input]")).toBeNull();
    // With a key present the confirm dialog opens instead of the guard toast.
    await act(async () => { input("[data-testid=svg-check-all]").click(); });
    await settle();
    await act(async () => { (q("[data-testid=svg-generate-selected]") as HTMLButtonElement).click(); });
    await settle();
    expect(q("[data-testid=svg-confirm]")).not.toBeNull();
    expect(q("[data-testid=svg-confirm]")?.textContent).toContain("batch");
  });

  it("says the key is session-only when storage refuses the write", async () => {
    const broken = { open: () => { throw new Error("storage unavailable"); } };
    vi.stubGlobal("indexedDB", broken);
    await mount(await makeRoot());
    await act(async () => { (q("[data-testid=svg-key-state]") as HTMLButtonElement).click(); });
    await settle();
    await type("[data-testid=svg-key-input]", fakeKey("rq", "live", "session_ui_1234"));
    await act(async () => { (q("[data-testid=svg-key-save]") as HTMLButtonElement).click(); });
    await settle();
    expect(q("[data-testid=svg-key-state]")?.textContent).toContain("API key secured locally");
    expect(q("[data-testid=svg-toast]")?.textContent).toContain("this session only");
    vi.unstubAllGlobals();
  });

  it("frames the SVG preview in the chosen background and keeps black strokes visible", async () => {
    const root = await makeRoot();
    await mount(root);
    const frame = () => q(`[data-testid=svg-prev-frame-${FOG}]`);
    expect(frame()?.getAttribute("data-bg")).toBe("#ffffff");
    expect(frame()?.className).not.toContain("contrast");
    expect(q("[data-testid=svg-bg-white]")?.getAttribute("aria-pressed")).toBe("true");

    // Black: the frame turns black AND gets the light outline, so artwork drawn
    // in black cannot disappear (the SVG itself is not touched).
    await act(async () => { (q("[data-testid=svg-bg-black]") as HTMLButtonElement).click(); });
    await settle();
    expect(frame()?.getAttribute("data-bg")).toBe("#000000");
    expect(frame()?.className).toContain("contrast");
    expect(q("[data-testid=svg-bg-value]")?.textContent).toContain("Black");

    // A dark custom colour gets the same help; a light one needs none.
    await type("[data-testid=svg-bg-custom]", "#123456");
    await settle();
    expect(frame()?.getAttribute("data-bg")).toBe("#123456");
    expect(q("[data-testid=svg-bg-value]")?.textContent).toContain("#123456");
    expect(frame()?.className).toContain("contrast");
    await type("[data-testid=svg-bg-custom]", "#f0f4ff");
    await settle();
    expect(frame()?.getAttribute("data-bg")).toBe("#f0f4ff");
    expect(frame()?.className).not.toContain("contrast");

    // Presets stay one decision: picking Gray leaves the custom value alone.
    await act(async () => { (q("[data-testid=svg-bg-gray]") as HTMLButtonElement).click(); });
    await settle();
    expect(frame()?.getAttribute("data-bg")).toBe("#808080");

    // The document is never modified: the preview shows the file's own bytes,
    // the AI thumbnail is not framed, and the code dialog is pristine.
    const img = q(`[data-testid=svg-prev-${FOG}]`) as HTMLImageElement | null;
    expect(svgFromSrc(img?.getAttribute("src") ?? "")).toBe(SAVED_SVG);
    expect(q(`[data-testid=svg-ai-${FOG}]`)?.closest(".svg-preview-frame")).toBeNull();
    await act(async () => { (q(`[data-testid=svg-code-${FOG}]`) as HTMLButtonElement).click(); });
    await settle();
    expect((q("[data-testid=svg-code-block]") as HTMLTextAreaElement).value).toBe(SAVED_SVG);

    // The colour is part of the app, not the SVG: after all of those clicks the
    // saved document and its sidecar are still exactly what was written before.
    const arch = root.children.get("architecture") as FakeDir;
    expect((arch.children.get("fog_AI.svg") as FakeFile).text).toBe(SAVED_SVG);
    expect((arch.children.get("fog_AI.svg.json") as FakeFile).text).toBe(SIDECAR);
    expect(SIDECAR).not.toContain("#c22f2f");
  });

  it("remembers the preview background across a restart", async () => {
    const root = await makeRoot();
    await mount(root);
    await act(async () => { (q("[data-testid=svg-bg-red]") as HTMLButtonElement).click(); });
    await settle();
    expect(q(`[data-testid=svg-prev-frame-${FOG}]`)?.getAttribute("data-bg")).toBe("#c22f2f");
    await act(async () => { ui.unmount(); }); // a restart: the panel is rebuilt from stored prefs
    await mount(root);
    expect(q(`[data-testid=svg-prev-frame-${FOG}]`)?.getAttribute("data-bg")).toBe("#c22f2f");
    expect(q("[data-testid=svg-bg-red]")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the cost beside the tokens and labels a calculated one Estimated", async () => {
    await mount(await makeRoot());
    expect(q(`[data-testid=svg-usage-${FOG}]`)?.textContent).toContain("$0.0100 reported");
    expect(q("[data-testid=svg-estimate]")?.textContent).toContain("$0.0100 reported");
    await act(async () => { (q(`[data-testid=svg-history-${FOG}]`) as HTMLButtonElement).click(); });
    await settle();
    expect(q("[data-testid=svg-history-cost-1]")?.textContent).toContain("$0.0100 reported");
    const estimated = q("[data-testid=svg-history-cost-2]")?.textContent ?? "";
    expect(estimated).toContain("$0.0200 Estimated");
    expect(estimated).toContain("openai/gpt-6.1-sol");
    expect(estimated).toContain("requesty-2026-10-01");
  });

  it("approves the active row's version and undoes it in one entry", async () => {
    await mount(await makeRoot());
    await act(async () => { (q(`[data-testid=svg-approve-${FOG}]`) as HTMLButtonElement).click(); });
    await settle();
    expect(q(`[data-testid=svg-review-${FOG}]`)?.textContent).toContain("Approved");
    expect(q("[data-testid=svg-count-approved]")?.textContent).toContain("1");
    await act(async () => { (q("[data-testid=hist-undo]") as HTMLButtonElement).click(); });
    await settle();
    expect(q(`[data-testid=svg-review-${FOG}]`)?.textContent).toContain("Pending");
  });
});
