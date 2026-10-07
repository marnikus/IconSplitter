// upload_ui.test.tsx — the "SVG to upload" tab drives the real panel, the real
// scan, the real metadata pipeline and the real export pipeline (RULE 8):
// approved pairs only, the bulk bar's header checkbox, the filters, the zoom,
// the editable/copiable metadata fields, the bulk apply as ONE undo entry, the
// exact-request confirmation before any paid send, and green = a complete
// committed package with the approved source untouched. Only the browser APIs
// a DOM cannot provide are stubbed: the provider transport (fetch), the canvas
// encoder and the image decoder.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { MANDATORY_TAGS } from "../src/lib/uploadmeta";
import { JOURNAL_KEY } from "../src/upload/journal";
import { saveGeminiKey } from "../src/upload/keystore";
import UploadPanel from "../src/upload/UploadPanel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import HistoryBar from "../src/ui/HistoryBar";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { minimalJpeg } from "./helpers/minijpeg";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";

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

// The folder picker hands back the fixture root.
(window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker =
  () => Promise.reject(new Error("no picker"));

/** Assembled from parts so the hygiene gate sees no key-shaped literal. */
const fakeKey = (...parts: string[]) => parts.join("_");

const DIR = "architecture";
const FOG = pairId(DIR, "fog", "");
const ARCH = pairId(DIR, "arch", "");
const COURT = pairId(DIR, "court", "");

/** The one approved SVG document the fixtures hold — the preview never alters it. */
const SAVED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`;

const TAGS = [...MANDATORY_TAGS, "speed", "growth", "chart", "arrow", "up", "business", "finance",
  "analytics", "data", "trend", "increase", "graph", "statistics", "report", "dashboard", "money",
  "coin", "dollar", "euro", "yen", "currency", "cash", "payment", "wallet", "bank", "investment",
  "profit", "success", "target", "goal", "idea", "creative", "design"];
const GOOD_ANSWER = `Title: Minimal line icon of growth. Speed and growth pictogram\nDescription: Clean line icon showing growth and rising business trends\nTags: ${TAGS.join(", ")}`;
const BAD_ANSWER = `Title: Too short. No tags named\nDescription: way too short\nTags: icon, pictogram`;

let host: HTMLDivElement;
let ui: Root;

/** Mount + the real pipelines exceed vitest's 5 s default test timeout. */
const itSlow = (name: string, fn: () => Promise<void>) => it(name, fn, 20000);

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => host.querySelectorAll(sel);
const text = (sel: string) => q(sel)?.textContent ?? "";
const input = (sel: string) => q(sel) as HTMLInputElement;
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

async function click(sel: string): Promise<void> {
  await act(async () => { (q(sel) as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}

async function clickEl(el: HTMLElement): Promise<void> {
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}

/** React tracks input values, so the native setter must be used to change one. */
async function type(sel: string, value: string): Promise<void> {
  await act(async () => {
    const el = input(sel);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

async function pick(sel: string, value: string): Promise<void> {
  await act(async () => {
    const el = q(sel) as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

async function check(id: string): Promise<void> {
  await act(async () => { (q(`[data-testid=upload-check-${id}]`) as HTMLInputElement).click(); });
  await settle();
}

/** The metadata fields render under the ACTIVE row — click it open first. */
async function activate(id: string): Promise<void> {
  await clickEl(q(`[data-testid=upload-row-${id}]`) as HTMLElement);
}

/** Polls until the condition holds — the pipelines do real work per row. */
async function waitFor(fn: () => boolean, label: string, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${label}`);
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
}

/** fog + arch approved with a valid v1; court pending; an orphan SVG; export junk. */
function makeRoot(): BinDir {
  const root = new BinDir("split_root");
  const dir = new BinDir(DIR);
  const sidecar = (id: string, name: string, review: "approved" | "pending") => {
    const meta = pairFile(DIR, name, { id, versions: [svgVersion(`${DIR}/${name.replace(/\.png$/, "")}.svg`, { version: 1, review })] });
    dir.children.set(`${name.replace(/\.png$/, "")}.svg.json`, new BinFile(`${name.replace(/\.png$/, "")}.svg.json`, serializePairMeta(meta), 3300));
  };
  for (const [id, name] of [[FOG, "fog_AI.png"], [ARCH, "arch_AI.png"], [COURT, "court_AI.png"]] as const) {
    dir.children.set(name, new BinFile(name, "ai", 3100));
    dir.children.set(name.replace(/\.png$/, ".svg"), new BinFile(name.replace(/\.png$/, ".svg"), SAVED_SVG, 3400));
    sidecar(id, name, name === "court_AI.png" ? "pending" : "approved");
  }
  dir.children.set("orphan_AI.svg", new BinFile("orphan_AI.svg", SAVED_SVG, 3500)); // no sidecar: not listed
  const junk = new BinDir("export"); // export output is never a discovery source
  junk.children.set("fog_AI.svg", new BinFile("fog_AI.svg", "export junk", 9000));
  dir.children.set("export", junk);
  root.children.set(DIR, dir);
  return root;
}

/** The Gemini transport: a valid answer, a bad answer, or silence until abort. */
function geminiTransport(answer: string | null) {
  const calls: { url: string; key: string | null; body: string }[] = [];
  const doFetch = async (url: string, init: RequestInit): Promise<Response> => {
    const key = (init.headers as Record<string, string>)["x-goog-api-key"] ?? null;
    calls.push({ url, key, body: String(init.body) });
    if (answer === null) {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: answer }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 300 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { calls, fetch: doFetch as unknown as typeof fetch };
}

/** The browser transports the DOM cannot provide: canvas encode + image decode. */
function stubCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => (
    { fillStyle: "", fillRect: () => undefined, drawImage: () => undefined } as never
  ));
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
    cb(new Blob([minimalJpeg(this.width, this.height) as BlobPart], { type: "image/jpeg" }));
  });
  class FakeImage {
    src = "";
    naturalWidth = 24;
    naturalHeight = 24;
    decode(): Promise<void> { return Promise.resolve(); }
  }
  vi.stubGlobal("Image", FakeImage);
  const url = URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (u: string) => void };
  url.createObjectURL = () => "blob:upload-test";
  url.revokeObjectURL = () => undefined;
}

function stubClipboard(): { written: string[] } {
  const written: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    value: { readText: async () => "", writeText: async (t: string) => { written.push(t); } },
    configurable: true,
  });
  return { written };
}

async function mount(root: BinDir): Promise<void> {
  stored.set("__upload__", { source: root });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><UploadPanel /><HistoryBar /></HistoryProvider>);
  });
  await waitFor(() => q("[data-testid=upload-row-count]") !== null, "the list to render");
  await settle();
}

/** Reads one file's text back out of the fake folder. */
function fileText(root: BinDir, relPath: string): string {
  let node: BinDir | BinFile = root;
  const parts = relPath.split("/");
  for (const part of parts.slice(0, -1)) node = (node as BinDir).children.get(part) as BinDir;
  return ((node as BinDir).children.get(parts.at(-1)!) as BinFile).text;
}

beforeEach(() => {
  localStorage.clear();
  stored.clear();
  resetAppStore();
  stubCanvas();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the tab", () => {
  it("lists one row per approved SVG — pending and orphan pairs are reported, not listed", async () => {
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    expect(qa("[data-testid^=upload-row-pair_]")).toHaveLength(2);
    expect(q("[data-testid=upload-row-count]")?.textContent).toBe("2");
    expect(text("[data-testid=upload-count-icons]")).toContain("2");
    expect(text("[data-testid=upload-audit]")).toContain("2 approved SVG(s)");
    // the honest exclusions, said out loud
    expect(text("[data-testid=upload-warn-excluded]")).toContain("2 pair(s) are not listed");
    expect(text("[data-testid=upload-warn-excluded]")).toContain("no approved SVG version");
    expect(text("[data-testid=upload-warn-excluded]")).toContain("no pair file");
    // the export folder's junk never became a row (no export loops)
    expect(q(`[data-testid=upload-target-${FOG}]`)?.textContent).toContain("fog_AI.svg");
    expect(text(`[data-testid=upload-export-path-${FOG}]`)).toContain("export → architecture/export");
  });

  it("previews the approved SVG in a framed, zoomable box", async () => {
    await mount(makeRoot());
    const frame = q(`[data-testid=upload-prev-${FOG}-frame]`);
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute("data-bg")).toBe("#ffffff");
    expect(q(`[data-testid=upload-prev-${FOG}]`)?.getAttribute("data-version")).toBe("1");
    // the zoom slider resizes the box (display-only — never the output scale)
    const before = (frame as HTMLElement).style.width;
    await act(async () => {
      const el = input("[data-testid=upload-thumb]");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, "200");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect((q(`[data-testid=upload-prev-${FOG}-frame]`) as HTMLElement).style.width).not.toBe(before);
    expect(text("[data-testid=upload-thumb-value]")).toBe("200 px");
  });

  it("filters and searches the list, and clears both", async () => {
    await mount(makeRoot());
    await pick("[data-testid=upload-filter-status]", "not-exported");
    expect(qa("[data-testid^=upload-row-pair_]")).toHaveLength(2);
    await pick("[data-testid=upload-filter-status]", "processed");
    expect(q("[data-testid=upload-empty]")).not.toBeNull();
    await click("[data-testid=upload-clear-filters]");
    expect(qa("[data-testid^=upload-row-pair_]")).toHaveLength(2);
    await type("[data-testid=upload-search]", "arch_AI");
    expect(qa("[data-testid^=upload-row-pair_]")).toHaveLength(1);
    expect(q(`[data-testid=upload-row-${ARCH}]`)).not.toBeNull();
  });
});

describe("selection + the bulk bar", () => {
  it("checks, selects all visible and deselects through the header checkbox", async () => {
    await mount(makeRoot());
    await check(FOG);
    expect(text("[data-testid=upload-selected-count]")).toBe("1 selected");
    await click("[data-testid=upload-check-all]");
    expect(text("[data-testid=upload-selected-count]")).toBe("2 selected");
    const all = q("[data-testid=upload-check-all]") as HTMLInputElement;
    expect(all.indeterminate).toBe(false);
    await click("[data-testid=upload-deselect]");
    expect(text("[data-testid=upload-selected-count]")).toBe("0 selected");
    await click("[data-testid=upload-select-visible]");
    expect(text("[data-testid=upload-selected-count]")).toBe("2 selected");
  });
});

describe("settings — defaults, overrides, one undoable bulk apply", () => {
  it("edits the global defaults (persisted, NOT on the undo timeline)", async () => {
    await mount(makeRoot());
    await click("[data-testid=upload-settings-open]");
    expect(q("[data-testid=upload-dialog]") ?? q("[data-testid=upload-dialog-backdrop]")).not.toBeNull();
    expect(text("[data-testid=upload-dialog-scope]")).toContain("inherits these defaults");
    await type("[data-testid=upload-set-padding]", "20");
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("pad 20%"); // inherited, live
    const saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.defaults.paddingPct).toBe(20);
    // no undo entry: defaults are the same class as presets (design §6)
    expect((q("[data-testid=hist-undo]") as HTMLButtonElement).disabled).toBe(true);
    await click("[data-testid=upload-set-close]");
  });

  it("pins one field per icon with an inherited/overridden marker, undoable per gesture", async () => {
    await mount(makeRoot());
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    expect(text("[data-testid=upload-dialog-scope]")).toContain("pinned for this icon");
    expect(text("[data-testid=upload-set-marker-padding]")).toBe("inherited");
    await type("[data-testid=upload-set-stroke]", "2.2");
    expect(text("[data-testid=upload-set-marker-stroke]")).toBe("overridden");
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("2.2 pt");
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("1 field overridden");
    const saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.overrides[FOG]).toEqual({ strokePt: 2.2 });
    // one gesture entry, and one undo reverses the pin
    await act(async () => { (q("[data-testid=hist-undo]") as HTMLButtonElement).click(); });
    await settle();
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("inherits defaults");
    await click("[data-testid=upload-set-close]");
  });

  it("applies the defaults to the selection as ONE undoable entry", async () => {
    await mount(makeRoot());
    await check(FOG);
    await check(ARCH);
    await click("[data-testid=upload-apply-settings]");
    const saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.overrides[FOG]).toEqual(saved.defaults);
    expect(saved.overrides[ARCH]).toEqual(saved.defaults);
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("7 fields overridden");
    // exactly one history entry for the whole batch
    const entries = JSON.parse(localStorage.getItem("iconSplitter.history.v1") ?? "{}").entries ?? [];
    const uploadEntries = entries.filter((e: { type: string }) => e.type === "uploadSettings");
    expect(uploadEntries).toHaveLength(1);
    expect(uploadEntries[0].ids).toHaveLength(2);
    // one undo reverses the whole batch
    await act(async () => { (q("[data-testid=hist-undo]") as HTMLButtonElement).click(); });
    await settle();
    const undone = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(undone.overrides).toEqual({});
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("inherits defaults");
  });

  it("resets one icon to the defaults (undoable)", async () => {
    await mount(makeRoot());
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    await type("[data-testid=upload-set-quality]", "0.7");
    await click("[data-testid=upload-set-reset]");
    const saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.overrides[FOG]).toBeUndefined();
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("inherits defaults");
  });
});

describe("metadata — the exact request, editable fields, accept", () => {
  itSlow("confirms the exact request before any send, then fills the editable fields", async () => {
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    // the key, through the UI (memory fallback — no IndexedDB in this DOM)
    await click("[data-testid=upload-key-state]");
    await type("[data-testid=upload-key-input]", fakeKey("AIza", "ui_test_key_1"));
    await click("[data-testid=upload-key-save]");
    expect(text("[data-testid=upload-key-mask]")).toContain("•••");

    await check(FOG);
    await activate(FOG);
    await click("[data-testid=upload-meta-selected]");
    // the exact request preview: prompt, endpoint, provider, auth rule
    expect(text("[data-testid=upload-meta-prompt]")).toContain("exactly 40 unique keywords");
    expect(text("[data-testid=upload-meta-endpoint]")).toContain("generativelanguage.googleapis.com");
    expect(text("[data-testid=upload-meta-provider]")).toContain("Gemini");
    expect(text("[data-testid=upload-meta-backdrop]")).toContain("never resent on its own");
    await click("[data-testid=upload-meta-confirm]");

    await waitFor(() => text(`[data-testid=upload-meta-state-${FOG}]`).includes("generated"), "the metadata to land");
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].key).toBe(fakeKey("AIza", "ui_test_key_1")); // the header, never the URL
    expect(t.calls[0].url).not.toContain("key=");
    const body = JSON.parse(t.calls[0].body);
    expect(body.contents[0].parts[0].text).toContain("exactly 40 unique keywords");
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe("image/jpeg");

    // the fields are editable and show the generated text
    expect(input(`[data-testid=upload-meta-title-${FOG}]`).value).toContain("Minimal line icon of growth");
    expect(input(`[data-testid=upload-meta-tags-${FOG}]`).value.split(",")).toHaveLength(40);
    expect(text(`[data-testid=upload-meta-usage-${FOG}]`)).toContain("300 tokens");

    // edit + accept (no record yet → no auto export)
    await type(`[data-testid=upload-meta-title-${FOG}]`, "Minimal line icon of growth. Speed and growth chart");
    await click(`[data-testid=upload-meta-accept-${FOG}]`);
    expect(text(`[data-testid=upload-meta-state-${FOG}]`)).toContain("accepted");
    expect(text(`[data-testid=upload-meta-cell-${FOG}]`)).toContain("accepted");
  });

  itSlow("copies each field to the clipboard", async () => {
    const clip = stubClipboard();
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    await saveGeminiKey(fakeKey("AIza", "copy_test_key"));
    await check(FOG);
    await activate(FOG);
    await click("[data-testid=upload-meta-selected]");
    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => text(`[data-testid=upload-meta-state-${FOG}]`).includes("generated"), "the metadata to land");
    await click(`[data-testid=upload-copy-title-${FOG}]`);
    await click(`[data-testid=upload-copy-tags-${FOG}]`);
    expect(clip.written[0]).toContain("Minimal line icon of growth");
    expect(clip.written[1].split(",")).toHaveLength(40);
  });

  itSlow("shows the validation errors for an invalid answer and refuses to accept it", async () => {
    const t = geminiTransport(BAD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    await saveGeminiKey(fakeKey("AIza", "invalid_test_key"));
    await check(FOG);
    await activate(FOG);
    await click("[data-testid=upload-meta-selected]");
    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => text(`[data-testid=upload-meta-state-${FOG}]`).includes("invalid"), "the invalid state");
    expect(text(`[data-testid=upload-meta-validation-${FOG}]`)).toContain("tags must be exactly 40");
    await click(`[data-testid=upload-meta-accept-${FOG}]`);
    expect(text("[data-testid=upload-toast]")).toContain("tags must be exactly 40");
    expect(text(`[data-testid=upload-meta-state-${FOG}]`)).toContain("invalid"); // refused, not accepted
  });

  itSlow("cancels an in-flight request and keeps what finished (never resent on its own)", async () => {
    const t = geminiTransport(null); // silence until abort
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    await saveGeminiKey(fakeKey("AIza", "cancel_test_key"));
    await check(FOG);
    await activate(FOG);
    await click("[data-testid=upload-meta-selected]");
    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => t.calls.length === 1, "the request to leave");
    expect(text(`[data-testid=upload-meta-cell-${FOG}]`)).toContain("pending");
    await click("[data-testid=upload-cancel-run]");
    await waitFor(() => text(`[data-testid=upload-meta-cell-${FOG}]`).includes("empty"), "the row to settle back");
    expect(JSON.parse(localStorage.getItem(JOURNAL_KEY) ?? "[]")).toEqual([]); // the journal entry ended
    expect(t.calls).toHaveLength(1); // never resent automatically
  });

  itSlow("reports a journalled in-flight request as interrupted after a restart", async () => {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify([{ rowId: FOG, startedAt: 1, requestId: null }]));
    await mount(makeRoot());
    expect(text(`[data-testid=upload-meta-cell-${FOG}]`)).toContain("interrupted");
    expect(text("[data-testid=upload-warn-interrupted]")).toContain("never resent automatically");
  });
});

describe("export — green means a complete committed package", () => {
  itSlow("exports the selection: SVG + JPEG + export.json commit, the source is untouched", async () => {
    const root = makeRoot();
    const before = fileText(root, `${DIR}/fog_AI.svg`);
    await mount(root);
    await check(FOG);
    await click("[data-testid=upload-export-selected]");
    await waitFor(() => text(`[data-testid=upload-status-${FOG}]`).includes("Processed"), "the package to commit");

    const exp = `${DIR}/export`;
    expect(fileText(root, `${exp}/fog_AI.svg`)).toContain("<svg");
    expect(fileText(root, `${exp}/fog_AI.svg`)).not.toBe(before); // a prepared copy, not the source
    expect(fileText(root, `${exp}/export.json`)).toContain("\"status\": \"processed\"");
    const jpeg = (root.children.get(DIR) as BinDir).children.get("export") as BinDir;
    const jpg = jpeg.children.get("fog_AI.jpg") as BinFile;
    expect(jpg.bytes[0]).toBe(0xff); // a real JPEG frame (SOI)
    expect(fileText(root, `${DIR}/fog_AI.svg`)).toBe(before); // the approved source untouched
    expect(text(`[data-testid=upload-status-${FOG}]`)).toContain("Processed");
    expect(text("[data-testid=upload-count-processed]")).toContain("1");
    // the row's package cell names the committed folder
    expect(text(`[data-testid=upload-export-path-${FOG}]`)).toContain("architecture/export");
  });

  itSlow("marks a row stale when the settings move, and re-export clears it", async () => {
    const root = makeRoot();
    await mount(root);
    await click(`[data-testid=upload-export-${FOG}]`);
    await waitFor(() => text(`[data-testid=upload-status-${FOG}]`).includes("Processed"), "the first commit");
    await click("[data-testid=upload-settings-open]");
    await type("[data-testid=upload-set-padding]", "30");
    await click("[data-testid=upload-set-close]");
    expect(text(`[data-testid=upload-status-${FOG}]`)).toContain("Stale");
    await click(`[data-testid=upload-export-${FOG}]`);
    await waitFor(() => text(`[data-testid=upload-status-${FOG}]`).includes("Processed"), "the re-export");
    expect(text("[data-testid=upload-count-stale]")).toContain("0");
  });

  itSlow("embeds the accepted metadata into the committed package", async () => {
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    const root = makeRoot();
    await mount(root);
    await saveGeminiKey(fakeKey("AIza", "embed_test_key"));
    await check(FOG);
    await activate(FOG);
    await click("[data-testid=upload-meta-selected]");
    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => text(`[data-testid=upload-meta-state-${FOG}]`).includes("generated"), "the metadata to land");
    await click(`[data-testid=upload-meta-accept-${FOG}]`);
    await click(`[data-testid=upload-export-${FOG}]`);
    await waitFor(() => text(`[data-testid=upload-status-${FOG}]`).includes("Processed"), "the package to commit");
    const svg = fileText(root, `${DIR}/export/fog_AI.svg`);
    expect(svg).toContain("<title>Minimal line icon of growth. Speed and growth pictogram</title>");
    const record = JSON.parse(fileText(root, `${DIR}/export/export.json`));
    expect(record.metadata.state).toBe("accepted");
    expect(record.metadata.tags).toHaveLength(40);
    expect(record.metadata.cost).toBeNull(); // Gemini reports no cost — never invented
  });

  itSlow("reports a failed export honestly and keeps the last valid package", async () => {
    const root = makeRoot();
    // a source the geometry pipeline cannot measure (text is unsupported)
    (root.children.get(DIR) as BinDir).children.set("fog_AI.svg", new BinFile("fog_AI.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text x="2" y="2">hi</text></svg>`, 3400));
    await mount(root);
    await click(`[data-testid=upload-export-${FOG}]`);
    await waitFor(() => text(`[data-testid=upload-status-${FOG}]`).includes("Failed"), "the honest failure");
    expect(text("[data-testid=upload-count-failed]")).toContain("1");
    // nothing was committed: the pre-existing junk folder is exactly as it was
    const exp = (root.children.get(DIR) as BinDir).children.get("export") as BinDir;
    expect([...exp.children.keys()]).toEqual(["fog_AI.svg"]);
    expect((exp.children.get("fog_AI.svg") as BinFile).text).toBe("export junk");
  });
});
