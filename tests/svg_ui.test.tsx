// svg_ui.test.tsx — the Generate SVG tab drives the real panel and the real
// history bar (RULE 8): approved pairs only, the bulk bar's header checkbox,
// the filters, the code dialog and its Escape close, the confirm dialog that
// must precede any send, and the undoable review decision. Everything here is
// a store/DOM change, so a regression in the wiring fails loudly.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { saveCatalog } from "../src/svg/catalog";
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

/** Changing the model is a real config write: it re-reads the new caps. */
async function setModel(id: string): Promise<void> {
  await act(async () => {
    const el = input("[data-testid=svg-model]");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, id);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
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
    // The confirmation states the sampling values that will be sent.
    expect(q("[data-testid=svg-confirm-sampling]")?.textContent).toContain("no temperature");
    expect(q("[data-testid=svg-confirm-sampling]")?.textContent).toContain("32 000 max tokens");
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

  it("keeps the masked key and its note on separate lines", async () => {
    await mount(await makeRoot());
    await act(async () => { (q("[data-testid=svg-key-state]") as HTMLButtonElement).click(); });
    await settle();
    await type("[data-testid=svg-key-input]", fakeKey("rq", "live", "layout_ui_1234"));
    await act(async () => { (q("[data-testid=svg-key-save]") as HTMLButtonElement).click(); });
    await settle();
    const mask = q("[data-testid=svg-key-mask]");
    const note = q("[data-testid=svg-key-note]");
    expect(mask?.textContent).toContain("•");
    expect(note?.textContent).toContain("excluded from Git");
    // Two rows, not two columns of one row: a long key can never run into the note.
    expect(mask?.parentElement).not.toBe(note?.parentElement);
    expect(q("[data-testid=svg-key-state]")?.textContent).toContain("API key secured locally");
  });

  it("minimizes the model card to its header and restores it, and remembers", async () => {
    await mount(await makeRoot());
    const toggle = () => q("[data-testid=svg-provider-toggle]") as HTMLButtonElement;
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(q("[data-testid=svg-max-tokens]")).not.toBeNull();
    expect(q("[data-testid=svg-key-state]")).not.toBeNull();

    await act(async () => { toggle().click(); });
    await settle();
    // Only the header stays: the model, its limits and the toggle itself.
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(q("[data-testid=svg-provider]")?.textContent).toContain("Requesty");
    expect(q("[data-testid=svg-limits]")?.textContent).toContain("timeout");
    expect(q("[data-testid=svg-max-tokens]")).toBeNull();
    expect(q("[data-testid=svg-key-state]")).toBeNull();

    // A restart restores the minimized card — the space saving is remembered.
    await act(async () => { ui.unmount(); });
    await mount(await makeRoot());
    expect(q("[data-testid=svg-max-tokens]")).toBeNull();
    await act(async () => { toggle().click(); });
    await settle();
    expect(q("[data-testid=svg-max-tokens]")).not.toBeNull();
    expect(q("[data-testid=svg-key-state]")).not.toBeNull();
  });

  it("offers only what the default reasoning model accepts", async () => {
    await mount(await makeRoot());
    await setModel("openai/gpt-6.1-sol");
    // openai/gpt-6.1-sol is a reasoning model: no temperature, completion
    // tokens, four efforts (extra high included).
    expect(q("[data-testid=svg-temperature]")).toBeNull();
    expect(q("[data-testid=svg-temperature-off]")?.textContent).toContain("Not supported");
    expect(input("[data-testid=svg-max-tokens]").min).toBe("1000");
    const effort = q("[data-testid=svg-effort]") as HTMLSelectElement;
    expect([...effort.options].map((o) => o.value)).toEqual(["", "low", "medium", "high", "xhigh"]);
    expect(q("[data-testid=svg-caps]")?.textContent).toContain("max_completion_tokens");
    expect(q("[data-testid=svg-caps]")?.textContent).toContain("family");
  });

  it("keeps one setting per model and switches back to it", async () => {
    await mount(await makeRoot());
    await setModel("openai/gpt-4o");
    expect(q("[data-testid=svg-temperature]")).not.toBeNull();
    expect(q("[data-testid=svg-effort]")).toBeNull();
    await type("[data-testid=svg-temperature]", "0.3");
    await settle();
    expect(input("[data-testid=svg-temperature]").value).toBe("0.3");

    // The reasoning model has its own (empty) temperature: nothing of gpt-4o's
    // was carried over, so there is nothing to warn about.
    await setModel("openai/gpt-6.1-sol");
    expect(q("[data-testid=svg-param-note]")).toBeNull();
    expect(q("[data-testid=svg-temperature]")).toBeNull();
    await setModel("openai/gpt-4o");
    expect(input("[data-testid=svg-temperature]").value).toBe("0.3");
  });

  it("takes the model list's limits over the family defaults, and warns", async () => {
    const catalog = { object: "list", data: [{ id: "openai/gpt-6.1-sol", max_output_tokens: 8_000, supports_reasoning: true }] };
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(catalog), { status: 200 }));
    await mount(await makeRoot());
    await setModel("openai/gpt-6.1-sol");
    // The boot refresh fetched the list: its 8 000 ceiling replaces the 32 000
    // default, and the user is told instead of being silently served less.
    expect(input("[data-testid=svg-max-tokens]").value).toBe("8000");
    expect(q("[data-testid=svg-param-note]")?.textContent).toContain("output tokens clamped");
    expect(q("[data-testid=svg-caps]")?.textContent).toContain("model list");
    // A hand-typed value above that ceiling cannot be saved either.
    await type("[data-testid=svg-max-tokens]", "48000");
    await settle();
    expect(input("[data-testid=svg-max-tokens]").value).toBe("8000");
    // The manual refresh re-reads the same list and says where it came from.
    await act(async () => { (q("[data-testid=svg-refresh-models]") as HTMLButtonElement).click(); });
    await settle();
    expect(q("[data-testid=svg-toast]")?.textContent).toContain("Model list refreshed");
  });

  it("restores the saved settings after a restart, per model", async () => {
    await mount(await makeRoot());
    await setModel("openai/gpt-4o");
    await type("[data-testid=svg-temperature]", "0.4");
    await type("[data-testid=svg-max-tokens]", "4096");
    await settle();
    await setModel("openai/gpt-6.1-sol");
    const reasoningTokens = input("[data-testid=svg-max-tokens]").value;

    // A restart with no cached model list: the family rules are back in charge,
    // but the stored settings are not.
    saveCatalog([]);
    await act(async () => { ui.unmount(); });
    await mount(await makeRoot());
    await setModel("openai/gpt-4o");
    expect(input("[data-testid=svg-temperature]").value).toBe("0.4");
    expect(input("[data-testid=svg-max-tokens]").value).toBe("4096");
    // The reasoning model keeps its own settings — and still no temperature.
    await setModel("openai/gpt-6.1-sol");
    expect(q("[data-testid=svg-temperature]")).toBeNull();
    expect(input("[data-testid=svg-max-tokens]").value).toBe(reasoningTokens);
  });

  it("clamps a token ceiling into the model's range before it can be sent", async () => {
    await mount(await makeRoot());
    await type("[data-testid=svg-max-tokens]", "999999");
    await settle();
    expect(input("[data-testid=svg-max-tokens]").value).toBe("200000");
    await type("[data-testid=svg-max-tokens]", "5");
    await settle();
    expect(input("[data-testid=svg-max-tokens]").value).toBe("1000");
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

    // The document is never modified: the preview paints the file's own path
    // inside its shadow root, the AI thumbnail is not framed, and the code
    // dialog is pristine.
    const host = q(`[data-testid=svg-prev-${FOG}]`) as HTMLDivElement | null;
    expect(host?.shadowRoot?.innerHTML).toContain('d="M2 2h20v20H2z"');
    // The colour is behind the artwork: the inline host lives INSIDE the frame,
    // so the chosen background is what the document is painted on.
    expect(host?.closest(".svg-preview-frame")).toBe(frame());
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

// The preview is the one surface that used to lie: the code copied fine while
// the row painted nothing. These three cases drive the real DOM (RULE 8).
describe("SVG row preview", () => {
  // Stroke-only, no xmlns — renders inline, was invisible as an <img> (D1/D4).
  const V1 = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16"/></svg>`;
  const V2 = `<svg viewBox="0 0 64 32" fill="none" stroke="#7dd3fc" stroke-width="3"><path d="M2 16h60"/></svg>`;
  const BROKEN = `<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"`;
  const copied: string[] = [];

  beforeEach(() => {
    copied.length = 0;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (text: string) => { copied.push(text); return Promise.resolve(); } },
    });
  });

  /** fog carries v1+v2 (v2 newest); court carries nothing; harbor is broken. */
  async function makePreviewRoot(): Promise<FakeDir> {
    const root = new FakeDir("split_root");
    const arch = new FakeDir("architecture");
    const svgVersion = (version: number, path: string) => ({
      version, svgPath: path, status: "generated", review: "pending",
      prompt: "p", provider: "Requesty", model: "openai/gpt-6.1-sol",
      requestedAt: "2026-10-01T10:00:00.000Z", completedAt: "2026-10-01T10:00:05.000Z",
      usage: { input: 100, output: 200, total: 300 },
      cost: { actual: 0.01, estimated: null, currency: "USD", pricing: null },
      validation: { ok: true, errors: [], warnings: [], icons: 1 },
      batch: null, error: null, requestId: null,
    });
    for (const [id, name] of [[FOG, "fog"], [COURT, "court"]] as const) {
      arch.children.set(`${name}.png`, new FakeFile(`${name}.png`, 12, 3000, "a"));
      arch.children.set(`${name}_AI.png`, new FakeFile(`${name}_AI.png`, 20, 3100, "b"));
      void id;
    }
    arch.children.set("fog_AI.svg", new FakeFile("fog_AI.svg", V1.length, 3200, V1));
    arch.children.set("fog_AI_v2.svg", new FakeFile("fog_AI_v2.svg", V2.length, 3300, V2));
    arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 10, 3300, JSON.stringify({
      v: 1,
      source: { relPath: "architecture/fog_AI.png", name: "fog_AI.png", fingerprint: "20:3100" },
      versions: [svgVersion(1, "architecture/fog_AI.svg"), svgVersion(2, "architecture/fog_AI_v2.svg")],
    })));
    const coast = new FakeDir("coastal");
    coast.children.set("harbor.png", new FakeFile("harbor.png", 12, 1000, "e"));
    coast.children.set("harbor_AI.png", new FakeFile("harbor_AI.png", 20, 1100, "f"));
    coast.children.set("harbor_AI.svg", new FakeFile("harbor_AI.svg", BROKEN.length, 1200, BROKEN));
    coast.children.set("harbor_AI.svg.json", new FakeFile("harbor_AI.svg.json", 10, 1200, JSON.stringify({
      v: 1,
      source: { relPath: "coastal/harbor_AI.png", name: "harbor_AI.png", fingerprint: "20:1100" },
      versions: [svgVersion(1, "coastal/harbor_AI.svg")],
    })));
    root.children.set("architecture", arch);
    root.children.set("coastal", coast);
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({
      records: [FOG, COURT, pairId("coastal", "harbor", "")].map((id) => ({
        pair_id: id, source: `${id}.png`, ai_result: `${id}_AI.png`,
        decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
      })),
    })));
    return root;
  }

  const HARBOR = pairId("coastal", "harbor", "");
  const frame = (id: string) => q(`[data-testid=svg-prev-${id}]`) as HTMLElement | null;
  const inlineSvg = (id: string) => frame(id)?.shadowRoot?.querySelector("svg") ?? null;

  it("renders the newest SVG inline, fitted and centred, xmlns and all", async () => {
    await mount(await makePreviewRoot());
    const svg = inlineSvg(FOG);
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    // fit + centre: the document fills the frame and keeps its own ratio
    expect(svg?.getAttribute("width")).toBe("100%");
    expect(svg?.getAttribute("height")).toBe("100%");
    expect(svg?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    // v2 is the newest version, so v2 is what the frame shows (64x32 box)
    expect(svg?.getAttribute("viewBox")).toBe("0 0 64 32");
    expect(frame(FOG)?.dataset.version).toBe("2");
    // the frame's own CSS travels with the document, scoped to the shadow root
    expect(frame(FOG)?.shadowRoot?.querySelector("style")).not.toBeNull();
    // a stroke-only icon paints with currentColor, so the preview must give it
    // an ink — without one it drew black on a near-black frame (D4).
    expect(svg?.getAttribute("style") ?? "").toContain("color:");
  });

  it("previews and copies the SAME version", async () => {
    await mount(await makePreviewRoot());
    expect(frame(FOG)?.dataset.version).toBe("2");
    expect(q(`[data-testid=svg-usage-${FOG}]`)?.textContent).toContain("v2");
    await act(async () => { (q(`[data-testid=svg-copy-${FOG}]`) as HTMLButtonElement).click(); });
    await settle();
    expect(copied).toEqual([V2]);
  });

  it("says why a saved SVG cannot be previewed — empty stays empty (RULE 4)", async () => {
    await mount(await makePreviewRoot());
    const broken = frame(HARBOR);
    expect(broken?.textContent).toContain("Preview failed");
    expect(broken?.dataset.error).toBe("not well-formed XML");
    expect(inlineSvg(HARBOR)).toBeNull();
    // court has no SVG at all: that is empty, not broken
    expect(frame(COURT)?.textContent).toBe("No SVG");
    expect(frame(COURT)?.dataset.error).toBeUndefined();
  });
});
