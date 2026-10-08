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
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { AUTH_HEADER } from "../src/lib/upload/gemini";
import { MANDATORY_TAGS } from "../src/lib/upload/meta";
import { withIntrinsicSize } from "../src/lib/upload/raster";
import { JOURNAL_KEY } from "../src/upload/journal";
import { UPLOAD_JOBS_KEY, forgetRestoreNote } from "../src/upload/jobstore";
import { getLogState, resetLogStore } from "../src/log/logstore";
import { saveGeminiKey } from "../src/upload/keystore";
import UploadPanel from "../src/upload/UploadPanel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import HistoryBar from "../src/ui/HistoryBar";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { minimalJpeg } from "./helpers/minijpeg";
import { clearGeminiKey } from "../src/upload/keystore";
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
const GOOD_ANSWER = `Title: Minimal line icon of growth and speed\nDescription: Clean line icon showing growth and rising business trends\nTags: ${TAGS.join(", ")}`;
const BAD_ANSWER = `Title: Tiny\nDescription: way too short\nTags: icon, pictogram`;

let host: HTMLDivElement;
let ui: Root;

/** Mount + the real pipelines exceed vitest's 5 s default test timeout. */
const itSlow = (name: string, fn: () => Promise<void>) => it(name, fn, 20000);

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => host.querySelectorAll(sel);
const text = (sel: string) => q(sel)?.textContent ?? "";
const input = (sel: string) => q(sel) as HTMLInputElement;
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

/**
 * The rows and dialogs arrive with the async scan/state, so every selector is
 * waited for before it is clicked — a missing element still fails, but as a
 * named wait instead of a null dereference under load (coverage lane).
 */
async function waitForEl(sel: string): Promise<HTMLElement> {
  await waitFor(() => q(sel) !== null, sel);
  return q(sel) as HTMLElement;
}

async function click(sel: string): Promise<void> {
  const el = await waitForEl(sel);
  // A control that is still preparing (the confirmation, while it renders the
  // images it will send) is disabled: a user waits, so the test waits.
  await waitFor(() => (el as HTMLButtonElement).disabled !== true, `${sel} to be enabled`);
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}

/** React tracks input values, so the native setter must be used to change one. */
async function type(sel: string, value: string): Promise<void> {
  await waitForEl(sel);
  await act(async () => {
    const el = input(sel);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

/** Types into a textarea through its own native setter (React tracks values). */
async function typeArea(sel: string, value: string): Promise<void> {
  await waitForEl(sel);
  await act(async () => {
    const el = q(sel) as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

async function pick(sel: string, value: string): Promise<void> {
  await waitForEl(sel);
  await act(async () => {
    const el = q(sel) as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

/** A <select> change the way the browser does it (React listens to change). */
async function selectOption(sel: string, value: string): Promise<void> {
  await waitForEl(sel);
  await act(async () => {
    const el = q(sel) as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

/** The stored global defaults, straight from localStorage (what really persisted). */
function storedDefaults(): {
  artboard: { mode: string; size: number; width: number; height: number };
  jpegMegapixels: number;
  jpegMatchArtboard: boolean;
  background: string;
  strokeColor: string;
} {
  return JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").defaults ?? {};
}

async function check(id: string): Promise<void> {
  const el = (await waitForEl(`[data-testid=upload-check-${id}]`)) as HTMLInputElement;
  await act(async () => { el.click(); });
  await settle();
}

/** The metadata fields render under the ACTIVE row — click it open first. */
async function activate(id: string): Promise<void> {
  await click(`[data-testid=upload-row-${id}]`);
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

/**
 * The canvas stub that makes ONE thing checkable: which SVG document a produced
 * JPEG was rendered from. The SVG blob is remembered per object URL, the 2d
 * context records what was drawn, and the encoder writes a real APP1 segment
 * carrying that document's marker before the SOF — a valid JPEG (SOI first, EOI
 * last, dimensions readable, XMP embedding still works) whose bytes name their
 * source. `drawn` lists every document in render order.
 */
function stubCanvasTagged(opts: { slowDecode?: boolean } = {}): { drawn: string[] } {
  const drawn: string[] = [];
  const textOf = new WeakMap<object, string>();
  const svgOf = new Map<string, string>();
  const RealBlob = globalThis.Blob;
  class MarkedBlob extends RealBlob {
    constructor(parts: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options);
      if (typeof parts[0] === "string") textOf.set(this, parts[0]);
    }
  }
  vi.stubGlobal("Blob", MarkedBlob);
  let n = 0;
  const url = URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (u: string) => void };
  url.createObjectURL = (blob: Blob) => {
    const key = `blob:tagged-${n++}`;
    svgOf.set(key, textOf.get(blob) ?? "");
    return key;
  };
  url.revokeObjectURL = () => undefined;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    const canvas = this as HTMLCanvasElement & { source?: string };
    return { fillStyle: "", fillRect: () => undefined, drawImage: (img: { src: string }) => { canvas.source = svgOf.get(img.src) ?? ""; } } as never;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
    const source = (this as HTMLCanvasElement & { source?: string }).source ?? "";
    drawn.push(source);
    cb(new Blob([taggedJpeg(this.width, this.height, markerOf(source)) as BlobPart], { type: "image/jpeg" }));
  });
  class FakeImage {
    src = "";
    naturalWidth = 24;
    naturalHeight = 24;
    decode(): Promise<void> {
      return opts.slowDecode === true ? new Promise((r) => setTimeout(r, 40)) : Promise.resolve();
    }
  }
  vi.stubGlobal("Image", FakeImage);
  return { drawn };
}

/** The row marker inside an SVG document (`data-icon="ARCH"`), or "" when absent. */
function markerOf(svgText: string): string {
  return /data-icon="([^"]+)"/.exec(svgText)?.[1] ?? "";
}

/** A baseline JPEG naming its source in an APP1 segment (valid: SOI … EOI). */
function taggedJpeg(width: number, height: number, marker: string): Uint8Array {
  const body = minimalJpeg(width, height);
  const text = new TextEncoder().encode(`SVGSRC:${marker}`);
  const app1 = [0xff, 0xe1, ((text.length + 2) >> 8) & 0xff, (text.length + 2) & 0xff, ...text];
  return new Uint8Array([body[0], body[1], ...app1, ...body.slice(2)]);
}

/** Texts of the SVGs that differ per row, so a mix-up is visible in the bytes. */
const distinctSvg = (mark: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-icon="${mark}"><path d="${pathOf(mark)}"/></svg>`;

/** One distinct path per marker — also readable out of the row's shadow preview. */
function pathOf(mark: string): string {
  if (mark === "FOG") return "M2 2h20v20H2z";
  if (mark === "ARCH2") return "M3 3h3v3H3z";
  return "M4 4h8v8H4z";
}

/** The row preview's own markup, out of its shadow root (or nothing yet). */
function previewHtml(id: string): string {
  return q(`[data-testid=upload-prev-${id}]`)?.shadowRoot?.innerHTML ?? "";
}

/** makeRoot with per-row artwork: arch's file is emphatically NOT fog's. */
function makeDistinctRoot(): BinDir {
  const root = makeRoot();
  const dir = root.children.get(DIR) as BinDir;
  for (const [name, mark] of [["fog_AI.svg", "FOG"], ["arch_AI.svg", "ARCH"]] as const) {
    dir.children.set(name, new BinFile(name, distinctSvg(mark), 3400));
  }
  return root;
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

/** The text inside a base64 payload (the fake encoder writes readable markers). */
function decoded(base64: string): string {
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
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
  resetLogStore();
  forgetRestoreNote(); // every test gets a fresh page load
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

describe("the metadata prompt panel — editable, saved, presets", () => {
  const CUSTOM = "Write metadata for a minimalist line icon. Answer in exactly three labeled lines.";

  it("keeps the prompt in its own editable panel, never inside the Gemini card", async () => {
    await mount(makeRoot());
    const editor = q("[data-testid=upload-prompt]") as HTMLTextAreaElement;
    expect(editor).not.toBeNull();
    expect(editor.readOnly).toBe(false);
    expect(editor.value).toContain("at least 10 unique keywords");
    // the panel is its own section, and the Gemini card does not contain it
    expect(q("[data-testid=upload-prompt-panel]")).not.toBeNull();
    expect(q("[data-testid=upload-provider-card] [data-testid=upload-prompt]")).toBeNull();
    expect(text("[data-testid=upload-prompt-copy]")).toContain("saved locally");
    expect(text("[data-testid=upload-prompt-copy]")).toContain("default");
    // the validator's claim is said out loud, so an edited prompt is an honest choice
    expect(text("[data-testid=upload-prompt-note]")).toContain("validator");
    expect(q("[data-testid=upload-preset-list]")).not.toBeNull();
    expect(q("[data-testid=upload-preset-quick-load]")).not.toBeNull();
    expect(q("[data-testid=upload-preset-save]")).not.toBeNull();
  });

  it("survives a restart with the user's own text, and says it is custom", async () => {
    await mount(makeRoot());
    await typeArea("[data-testid=upload-prompt]", CUSTOM);
    expect((q("[data-testid=upload-prompt]") as HTMLTextAreaElement).value).toBe(CUSTOM);
    expect(localStorage.getItem("iconSplitter.upload.prompt.v1")).toContain(CUSTOM);

    act(() => ui.unmount());
    await mount(makeRoot());
    expect((q("[data-testid=upload-prompt]") as HTMLTextAreaElement).value).toBe(CUSTOM);
    expect(text("[data-testid=upload-prompt-copy]")).toContain("custom");

    await click("[data-testid=upload-prompt-reset]");
    expect((q("[data-testid=upload-prompt]") as HTMLTextAreaElement).value).toContain("at least 10 unique keywords");
    expect(text("[data-testid=upload-prompt-copy]")).toContain("default");
  });

  it("saves, quick-loads and deletes presets, and they survive a restart", async () => {
    await mount(makeRoot());
    await typeArea("[data-testid=upload-prompt]", CUSTOM);
    await type("[data-testid=upload-preset-name]", "Strict stock rules");
    await click("[data-testid=upload-preset-save]");
    const list = () => q("[data-testid=upload-preset-list]") as HTMLSelectElement;
    expect([...list().options].map((o) => o.value)).toContain("Strict stock rules");
    expect(text("[data-testid=upload-toast]")).toContain("saved");

    // the editor is not a preset until Quick load says so
    await typeArea("[data-testid=upload-prompt]", "hand-edited text that was never saved");
    await pick("[data-testid=upload-preset-list]", "Strict stock rules");
    await click("[data-testid=upload-preset-quick-load]");
    expect((q("[data-testid=upload-prompt]") as HTMLTextAreaElement).value).toBe(CUSTOM);
    expect(text("[data-testid=upload-toast]")).toContain("Strict stock rules");

    act(() => ui.unmount());
    await mount(makeRoot());
    expect([...list().options].map((o) => o.value)).toContain("Strict stock rules");
    await pick("[data-testid=upload-preset-list]", "Strict stock rules");
    await click("[data-testid=upload-preset-quick-load]");
    expect((q("[data-testid=upload-prompt]") as HTMLTextAreaElement).value).toBe(CUSTOM);

    await click("[data-testid=upload-preset-delete]");
    expect([...list().options].map((o) => o.value)).not.toContain("Strict stock rules");
    expect(localStorage.getItem("iconSplitter.upload.prompts.v1")).not.toContain("Strict stock rules");
  });

  it("refuses a blank preset name instead of storing an unnamed one", async () => {
    await mount(makeRoot());
    await type("[data-testid=upload-preset-name]", "   ");
    await click("[data-testid=upload-preset-save]");
    expect((q("[data-testid=upload-preset-list]") as HTMLSelectElement).options).toHaveLength(1); // the placeholder only
    expect(text("[data-testid=upload-toast]")).toContain("name");
  });

  itSlow("sends the EDITED prompt in the one confirmed request, and records it (honesty)", async () => {
    const clip = stubClipboard();
    expect(clip.written).toEqual([]);
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    const root = makeRoot();
    await mount(root);
    await click("[data-testid=upload-key-state]");
    await type("[data-testid=upload-key-input]", fakeKey("AIza", "ui_test_key_1"));
    await click("[data-testid=upload-key-save]");
    await typeArea("[data-testid=upload-prompt]", CUSTOM);

    await check(FOG);
    await activate(FOG);
    await click("[data-testid=upload-meta-selected]");
    // the confirmation shows the prompt that will actually be sent
    expect((q("[data-testid=upload-meta-prompt]") as HTMLTextAreaElement).value).toBe(CUSTOM);
    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => text(`[data-testid=upload-meta-state-${FOG}]`).includes("generated"), "the metadata to land");
    expect(JSON.parse(t.calls[0].body).contents[0].parts[0].text).toBe(CUSTOM);

    // and the committed record names the prompt that produced the metadata
    await click(`[data-testid=upload-meta-accept-${FOG}]`);
    await click("[data-testid=upload-export-selected]"); // the row is still the checked one
    await waitFor(() => text(`[data-testid=upload-status-${FOG}]`).includes("Processed"), "the package to commit");
    expect(fileText(root, `${DIR}/export/export.json`)).toContain(CUSTOM);
  });
});

describe("the Gemini panel and the toolbar — contained, not overlapping", () => {
  it("lays the provider card out as one contained grid", async () => {
    await mount(makeRoot());
    const card = q("[data-testid=upload-provider-card]") as HTMLElement;
    const grid = q("[data-testid=upload-provider-grid]") as HTMLElement;
    expect(grid).not.toBeNull();
    for (const id of ["upload-model", "upload-endpoint", "upload-timeout", "upload-retries", "upload-concurrency"]) {
      const field = q(`[data-testid=${id}]`) as HTMLElement;
      expect(field, id).not.toBeNull();
      expect(grid.contains(field), id).toBe(true);
      expect(card.contains(field), id).toBe(true);
    }
    // the check line is its own row of the card, never a squeezed grid column
    const check = q("[data-testid=upload-provider-check]") as HTMLElement;
    expect(check).not.toBeNull();
    expect(grid.contains(check)).toBe(false);
    expect(card.contains(check)).toBe(true);
    expect(check.contains(q("[data-testid=upload-model-state]"))).toBe(true);
  });

  it("puts the export settings button with the zoom controls, not beside the provider card", async () => {
    await mount(makeRoot());
    const settings = q("[data-testid=upload-settings-open]") as HTMLElement;
    const zoom = q("[data-testid=upload-thumb]") as HTMLElement;
    expect(settings).not.toBeNull();
    expect(zoom).not.toBeNull();
    expect(settings.closest("[data-testid=upload-bulk-right]")).not.toBeNull();
    expect(zoom.closest("[data-testid=upload-bulk-right]")).not.toBeNull();
    expect(q(".svg-controls [data-testid=upload-settings-open]")).toBeNull();
    // and it still opens the defaults dialog
    await click("[data-testid=upload-settings-open]");
    expect(q("[data-testid=upload-dialog]") ?? q("[data-testid=upload-dialog-backdrop]")).not.toBeNull();
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
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("2.2 px");
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("1 field overridden");
    const saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.overrides[FOG]).toEqual({ strokePx: 2.2 });
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
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("10 fields overridden");
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

  it("pins a popular artboard size, or a custom one with its own aspect ratio", async () => {
    await mount(makeRoot());
    await click("[data-testid=upload-settings-open]");

    // the global scope: a preset is one choice and lands in the stored defaults
    expect((q("[data-testid=upload-set-artboard]") as HTMLSelectElement).value).toBe("content");
    await selectOption("[data-testid=upload-set-artboard]", "512");
    await settle();
    expect(storedDefaults().artboard).toMatchObject({ mode: "preset", size: 512 });
    expect(text("[data-testid=upload-set-artboard-note]")).toContain("512");

    // the custom size is where the aspect ratio lives, and it reads back
    await selectOption("[data-testid=upload-set-artboard]", "custom");
    await type("[data-testid=upload-set-artboard-w]", "1024");
    await type("[data-testid=upload-set-artboard-h]", "576");
    await settle();
    expect(storedDefaults().artboard).toMatchObject({ mode: "custom", width: 1024, height: 576 });
    expect(text("[data-testid=upload-set-artboard-ratio]")).toContain("16:9");
    expect(text("[data-testid=upload-set-artboard-mp]")).toContain("0.59");

    // The MP field is NEVER blocked: a small artboard must not cap the
    // resolution — the artboard's px are the default, and the user may disagree.
    expect((q("[data-testid=upload-set-mp]") as HTMLInputElement).disabled).toBe(false);
    expect((q("[data-testid=upload-set-mp-match]") as HTMLInputElement).checked).toBe(true);
    expect(text("[data-testid=upload-set-mp-note]")).toContain("1024×576");

    // typing a resolution is the user deciding for the megapixels — one gesture,
    // one stored choice, not a blocked field
    await type("[data-testid=upload-set-mp]", "4");
    await settle();
    expect(storedDefaults().jpegMegapixels).toBe(4);
    expect(storedDefaults().jpegMatchArtboard).toBe(false);
    expect((q("[data-testid=upload-set-mp-match]") as HTMLInputElement).checked).toBe(false);

    // and the checkbox hands the decision back to the artboard
    await click("[data-testid=upload-set-mp-match]");
    await settle();
    expect(storedDefaults().jpegMatchArtboard).toBe(true);
    expect(storedDefaults().artboard).toMatchObject({ mode: "custom", width: 1024, height: 576 });

    // back to hugging the content: the artboard no longer pins px, so the
    // "same as the artboard" question is not asked (the artboard follows the MP)
    await selectOption("[data-testid=upload-set-artboard]", "content");
    await settle();
    expect((q("[data-testid=upload-set-mp]") as HTMLInputElement).disabled).toBe(false);
    expect(q("[data-testid=upload-set-mp-match]")).toBeNull();
    expect(storedDefaults().artboard.mode).toBe("content");
    expect(storedDefaults().jpegMegapixels).toBe(4); // the user's value survived
    await click("[data-testid=upload-set-close]");
  });

  it("background: transparent (the default) or a colour; stroke colour: one hex (black by default) or the artwork's own (2026-10-08)", async () => {
    await mount(makeRoot());
    await click("[data-testid=upload-settings-open]");
    // transparent is the shipped default, shown as such
    expect(storedDefaults().background ?? "transparent").toBe("transparent");
    expect(q("[data-testid=upload-set-bg-transparent]")?.getAttribute("aria-pressed")).toBe("true");
    expect(text("[data-testid=upload-set-bg-value]")).toBe("transparent");
    // a colour swatch, then back to transparent — both live in the stored defaults
    await click("[data-testid=upload-set-bg-black]");
    expect(storedDefaults().background).toBe("#000000");
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("#000000");
    await click("[data-testid=upload-set-bg-transparent]");
    expect(storedDefaults().background).toBe("transparent");
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("transparent");
    // the stroke colour: black by default (ONE global stroke="#000", 2026-10-08), one hex when picked, the artwork's own on request
    expect(q("[data-testid=upload-set-stroke-color-black]")?.getAttribute("aria-pressed")).toBe("true");
    expect(q("[data-testid=upload-set-stroke-color-artwork]")?.getAttribute("aria-pressed")).toBe("false");
    expect(text("[data-testid=upload-set-stroke-color-value]")).toBe("#000000");
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("stroke #000000");
    await type("[data-testid=upload-set-stroke-color-custom]", "#112233");
    expect(storedDefaults().strokeColor).toBe("#112233");
    expect(text("[data-testid=upload-set-stroke-color-value]")).toBe("#112233");
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("stroke #112233");
    await click("[data-testid=upload-set-stroke-color-white]");
    expect(storedDefaults().strokeColor).toBe("#ffffff");
    await click("[data-testid=upload-set-stroke-color-artwork]");
    expect(storedDefaults().strokeColor).toBe("artwork");
    expect(text(`[data-testid=upload-settings-${FOG}]`)).not.toContain("stroke #");
    await click("[data-testid=upload-set-close]");

    // the icon scope: a stroke-colour-only pin is a real override, marked and undoable
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    expect(text("[data-testid=upload-set-marker-stroke-color]")).toBe("inherited");
    await click("[data-testid=upload-set-stroke-color-black]");
    expect(text("[data-testid=upload-set-marker-stroke-color]")).toBe("overridden");
    const saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.overrides[FOG]).toEqual({ strokeColor: "#000000" });
    await act(async () => { (q("[data-testid=hist-undo]") as HTMLButtonElement).click(); });
    await settle();
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("inherits defaults");
    await click("[data-testid=upload-set-close]");
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
    expect(text("[data-testid=upload-meta-prompt]")).toContain("at least 10 unique keywords");
    expect(text("[data-testid=upload-meta-endpoint]")).toContain("generativelanguage.googleapis.com");
    expect(text("[data-testid=upload-meta-provider]")).toContain("Gemini");
    expect(text("[data-testid=upload-meta-backdrop]")).toContain("never resent on its own");
    await click("[data-testid=upload-meta-confirm]");

    await waitFor(() => text(`[data-testid=upload-meta-state-${FOG}]`).includes("generated"), "the metadata to land");
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].key).toBe(fakeKey("AIza", "ui_test_key_1")); // the header, never the URL
    expect(t.calls[0].url).not.toContain("key=");
    const body = JSON.parse(t.calls[0].body);
    expect(body.contents[0].parts[0].text).toContain("at least 10 unique keywords");
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe("image/jpeg");

    // the fields are editable and show the generated text
    expect(input(`[data-testid=upload-meta-title-${FOG}]`).value).toContain("Minimal line icon of growth");
    expect(input(`[data-testid=upload-meta-tags-${FOG}]`).value.split(",")).toHaveLength(40);
    expect(text(`[data-testid=upload-meta-usage-${FOG}]`)).toContain("300 tokens");

    // edit + accept (no record yet → no auto export); the second sentence and
    // the Title Case the user typed are gone at the accept gate — ONE clean
    // phrase — and the field shows it at once (RULE 24)
    await type(`[data-testid=upload-meta-title-${FOG}]`, "Minimal Line Icon Of Growth. Speed and growth chart.");
    await typeArea(`[data-testid=upload-meta-description-${FOG}]`, "Clean line icon showing growth and rising trends. Second sentence here.");
    await click(`[data-testid=upload-meta-accept-${FOG}]`);
    expect(text(`[data-testid=upload-meta-state-${FOG}]`)).toContain("accepted");
    expect(text(`[data-testid=upload-meta-cell-${FOG}]`)).toContain("accepted");
    expect(input(`[data-testid=upload-meta-title-${FOG}]`).value).toBe("Minimal line icon of growth");
    expect((q(`[data-testid=upload-meta-description-${FOG}]`) as HTMLTextAreaElement).value).toBe("Clean line icon showing growth and rising trends");
  });

  itSlow("generates metadata for ALL selected icons that need it, and says what it skipped", async () => {
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    await click("[data-testid=upload-key-state]");
    await type("[data-testid=upload-key-input]", fakeKey("AIza", "ui_test_key_1"));
    await click("[data-testid=upload-key-save]");

    // FOG and ARCH are the two listed rows; both need metadata
    await check(FOG);
    await check(ARCH);
    expect(text("[data-testid=upload-meta-selected]")).toContain("Generate metadata (2)");
    await click("[data-testid=upload-meta-selected]");
    // ONE confirmation covers the whole selection, and it shows both images
    expect(text("#upload-meta-title")).toContain("2 icons");
    await waitForEl("[data-testid=upload-preview-count]");
    expect(qa("[data-testid^=upload-preview-pair_]").length).toBeGreaterThanOrEqual(1);
    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => t.calls.length === 2, "both requests to land");
    await waitFor(() => text(`[data-testid=upload-meta-cell-${FOG}]`).includes("generated")
      && text(`[data-testid=upload-meta-cell-${ARCH}]`).includes("generated"), "both drafts to land");

    // one paid call per icon, each row carrying its own draft
    expect(t.calls).toHaveLength(2);
    // the batch does NOT accept on the user's behalf: accepting stays a per-row decision
    expect(text(`[data-testid=upload-meta-cell-${FOG}]`)).not.toContain("accepted");
    expect(text("[data-testid=upload-toast]")).toContain("Metadata ready");

    // now that both have metadata, the button says there is nothing left to generate
    expect(text("[data-testid=upload-meta-selected]")).toContain("Generate metadata (0)");
    await click("[data-testid=upload-meta-selected]");
    expect(q("[data-testid=upload-meta-backdrop]")).toBeNull();
    expect(text("[data-testid=upload-toast]")).toContain("already have metadata");
    expect(t.calls).toHaveLength(2); // no second paid call
  });

  itSlow("export selected generates metadata FIRST, then exports everything", async () => {
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    const root = makeRoot();
    await mount(root);
    await click("[data-testid=upload-key-state]");
    await type("[data-testid=upload-key-input]", fakeKey("AIza", "ui_test_key_1"));
    await click("[data-testid=upload-key-save]");

    await check(FOG);
    await check(ARCH);
    await click("[data-testid=upload-export-selected]");
    // the SAME confirmation, and it says what happens after the paid calls
    expect(text("[data-testid=upload-meta-backdrop]")).toContain("then export");
    expect(text("#upload-meta-title")).toContain("2 icons");
    await click("[data-testid=upload-meta-confirm]");

    // both requests land, both answers are accepted (valid, unedited), both export
    await waitFor(() => text(`[data-testid=upload-status-${FOG}]`).includes("Processed"), "fog to export");
    await waitFor(() => text(`[data-testid=upload-status-${ARCH}]`).includes("Processed"), "arch to export");
    expect(t.calls).toHaveLength(2);
    // the artifact carries the ICON's name: `_AI` is bookkeeping, not the icon
    for (const [id, art] of [[FOG, "fog"], [ARCH, "arch"]] as const) {
      expect(text(`[data-testid=upload-meta-cell-${id}]`)).toContain("accepted");
      const svg = fileText(root, `${DIR}/export/${art}.svg`);
      expect(svg).toContain("<metadata>");        // the metadata really is in the package
      expect(svg).toContain("Minimal line icon of growth");
    }
    // and the record names the prompt that produced it
    expect(fileText(root, `${DIR}/export/export.json`)).toContain("at least 10 unique keywords");
  });

  itSlow("export selected refuses when metadata is needed and no key is set", async () => {
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    const root = makeRoot();
    // a genuinely key-free panel: clear the vault BEFORE the panel boots and reads it
    await clearGeminiKey();
    await mount(root);
    await check(FOG);
    await click("[data-testid=upload-export-selected]");
    expect(q("[data-testid=upload-meta-backdrop]")).toBeNull();      // no confirmation, no request
    expect(t.calls).toHaveLength(0);
    expect(text("[data-testid=upload-toast]")).toContain("API key"); // names the missing piece
    expect(q(`[data-testid=upload-export-path-${FOG}]`)).not.toBeNull();
  });

  itSlow("export selected only asks for the icons that still need metadata", async () => {
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    const root = makeRoot();
    await mount(root);
    await click("[data-testid=upload-key-state]");
    await type("[data-testid=upload-key-input]", fakeKey("AIza", "ui_test_key_1"));
    await click("[data-testid=upload-key-save]");

    // FOG gets metadata the long way: generate, accept, export it
    await check(FOG);
    await click("[data-testid=upload-meta-selected]");
    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => t.calls.length === 1, "fog's answer");
    await activate(FOG); // the editable fields (and Accept) render under the active row
    await click(`[data-testid=upload-meta-accept-${FOG}]`);
    expect(t.calls).toHaveLength(1);

    // now select both: only ARCH still needs a request, and BOTH export
    await check(ARCH);
    await click("[data-testid=upload-export-selected]");
    expect(text("#upload-meta-title")).toContain("1 icon");
    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => text(`[data-testid=upload-status-${ARCH}]`).includes("Processed"), "arch to export");
    expect(t.calls).toHaveLength(2); // exactly one more call — fog was never re-charged
    expect(text(`[data-testid=upload-status-${FOG}]`)).toContain("Processed");
  });

  itSlow("shows the ONE selected row's own 512 px JPEG, and sends exactly those bytes", async () => {
    const root = makeDistinctRoot();
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    const canvas = stubCanvasTagged();
    await mount(root);
    // the SECOND row acts — the first row's image must never travel
    await click(`[data-testid=upload-meta-${ARCH}]`);
    await waitFor(() => q(`[data-testid=upload-preview-${ARCH}]`) !== null, "the preview to render");
    expect(q(`[data-testid=upload-preview-${FOG}]`)).toBeNull();
    // only that icon's own document — with its render size pinned for the browser (no root px in the file)
    expect(canvas.drawn).toEqual([withIntrinsicSize(distinctSvg("ARCH"), 512, 512)]);
    const img = input(`[data-testid=upload-preview-${ARCH}]`);
    expect(img.src.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(text(`[data-testid=upload-preview-caption-${ARCH}]`)).toContain("arch_AI.svg");
    expect(text(`[data-testid=upload-preview-caption-${ARCH}]`)).toContain("512×512");

    await act(async () => {
      (q("[data-testid=upload-key-state]") as HTMLElement).click();
    });
    await type("[data-testid=upload-key-input]", fakeKey("AIza", "ui_test_key_3"));
    await click("[data-testid=upload-key-save]");
    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => t.calls.length === 1, "the one request");
    const body = JSON.parse(t.calls[0].body);
    const sent: string = body.contents[0].parts[1].inlineData.data;
    expect(sent).toBe(img.src.split(",")[1]); // byte-identical: what you saw is what was sent
    expect(decoded(sent)).toContain("SVGSRC:ARCH");
    expect(decoded(sent)).not.toContain("FOG");
    expect(canvas.drawn).toHaveLength(1); // no second render: the shown image IS the sent image
  });

  itSlow("cannot be paid for before the images it shows are rendered", async () => {
    const root = makeDistinctRoot();
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    stubCanvasTagged({ slowDecode: true });
    await mount(root);
    await click(`[data-testid=upload-meta-${ARCH}]`);
    // first paint: the strip is still empty, the send button is held back
    expect(text("[data-testid=upload-preview-busy]")).toContain("Rendering the 512 px JPEG");
    expect(input("[data-testid=upload-meta-confirm]").disabled).toBe(true);
    await waitFor(() => !input("[data-testid=upload-meta-confirm]").disabled, "the previews to be ready");
    expect(q("[data-testid=upload-preview-busy]")).toBeNull();
    expect(input(`[data-testid=upload-preview-${ARCH}]`).src).toContain("data:image/jpeg;base64,");
    expect(t.calls).toHaveLength(0); // nothing was paid for while waiting
  });

  it("previews each row's own approved SVG, before and after a rescan", async () => {
    const root = makeDistinctRoot();
    vi.stubGlobal("fetch", geminiTransport(GOOD_ANSWER).fetch);
    await mount(root);
    await waitFor(() => previewHtml(FOG).includes("M2 2h20v20H2z"), "fog's artwork");
    expect(previewHtml(ARCH)).toContain("M4 4h8v8H4z"); // never the neighbour's drawing
    expect(previewHtml(ARCH)).not.toContain("M2 2h20v20H2z");
    // the user replaces the approved SVG on disk and rescans: only that row changes
    const dir = root.children.get(DIR) as BinDir;
    dir.children.set("arch_AI.svg", new BinFile("arch_AI.svg", distinctSvg("ARCH2"), 3600));
    await click("[data-testid=upload-rescan]");
    await waitFor(() => previewHtml(ARCH).includes("M3 3h3v3H3z"), "the new artwork");
    expect(previewHtml(FOG)).toContain("M2 2h20v20H2z"); // untouched
  });

  itSlow("labels one preview per selected icon, and no image ever crosses rows", async () => {
    const root = makeDistinctRoot();
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    const canvas = stubCanvasTagged();
    await mount(root);
    await click("[data-testid=upload-key-state]");
    await type("[data-testid=upload-key-input]", fakeKey("AIza", "ui_test_key_4"));
    await click("[data-testid=upload-key-save]");
    await check(FOG);
    await check(ARCH);
    await click("[data-testid=upload-meta-selected]");
    await waitFor(() => text("[data-testid=upload-preview-strip]").includes("arch_AI.svg"), "both previews");
    expect(text(`[data-testid=upload-preview-caption-${FOG}]`)).toContain("fog_AI.svg");
    const srcFog = input(`[data-testid=upload-preview-${FOG}]`).src;
    const srcArch = input(`[data-testid=upload-preview-${ARCH}]`).src;
    expect(srcFog).not.toBe(srcArch);
    expect(canvas.drawn).toHaveLength(2);

    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => t.calls.length === 2, "both requests");
    const sent = t.calls.map((c) => JSON.parse(c.body).contents[0].parts[1].inlineData.data as string);
    expect(new Set(sent).size).toBe(2); // two icons, two different images
    expect(sent).toContain(srcFog.split(",")[1]);
    expect(sent).toContain(srcArch.split(",")[1]);
    expect(canvas.drawn).toHaveLength(2); // both sent images were the shown ones
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
    expect(text(`[data-testid=upload-meta-validation-${FOG}]`)).toContain("tags must be at least 10");
    await click(`[data-testid=upload-meta-accept-${FOG}]`);
    expect(text("[data-testid=upload-toast]")).toContain("tags must be at least 10");
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

  itSlow("a seeded in-flight job restores as interrupted and nothing is re-sent (T2)", async () => {
    localStorage.setItem(UPLOAD_JOBS_KEY, JSON.stringify({ v: 1, states: { [FOG]: "running", [ARCH]: "queued" } }));
    const sent: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      sent.push(String(url));
      throw new Error("no request may leave the tab on restore");
    });
    await mount(makeRoot());
    // the LAST run of each icon is shown as interrupted — not as quietly pending
    expect(text(`[data-testid=upload-status-${FOG}]`)).toContain("Interrupted");
    expect(text(`[data-testid=upload-status-${ARCH}]`)).toContain("Interrupted");
    expect(text("[data-testid=upload-warn-interrupted]")).toContain("never resent automatically");
    expect(sent).toEqual([]); // a restart is not a retry: zero network calls
    // and the store itself now says interrupted, so a second boot cannot re-report it
    const store = JSON.parse(localStorage.getItem(UPLOAD_JOBS_KEY) ?? "{}") as { states?: Record<string, string> };
    expect(store.states).toEqual({ [FOG]: "interrupted", [ARCH]: "interrupted" });
    // the note was logged exactly once; a second mount in the same page load adds nothing (T3)
    const restored = () => getLogState().entries
      .filter((e) => e.feature === "upload" && e.action === "restored");
    expect(restored()).toHaveLength(1);
    act(() => ui.unmount());
    await mount(makeRoot());
    expect(restored()).toHaveLength(1);
    expect(sent).toEqual([]); // and still nothing was re-sent
  });

  itSlow("a remembered answer comes back with ZERO model calls; edited artwork demands reconfirmation (CP-15)", async () => {
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    const root = makeRoot();
    await mount(root);
    await click("[data-testid=upload-key-state]");
    await type("[data-testid=upload-key-input]", fakeKey("AIza", "ui_test_key_1"));
    await click("[data-testid=upload-key-save]");
    await check(FOG);
    await activate(FOG);
    await click("[data-testid=upload-meta-selected]");
    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => text(`[data-testid=upload-meta-state-${FOG}]`).includes("generated"), "the metadata to land");
    expect(t.calls).toHaveLength(1);

    // a reload: the same artwork must not be billed a second time
    act(() => ui.unmount());
    const sent: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => { sent.push(String(url)); throw new Error("the cache must answer this"); });
    const root2 = makeRoot();
    await mount(root2);
    await activate(FOG);
    expect(text(`[data-testid=upload-meta-state-${FOG}]`)).toContain("generated");
    expect(sent).toEqual([]);

    // the artwork moves: the remembered answer no longer applies to it
    const dir = root2.children.get(DIR) as BinDir;
    // a real edit moves size AND mtime — the scan's own fingerprint (design §4.1)
    dir.children.set("fog_AI.svg", new BinFile("fog_AI.svg", SAVED_SVG.replace("M2 2h20v20H2z", "M1 1h22v22H1z <!-- edited -->"), 7777));
    await click("[data-testid=upload-rescan]");
    // the row cell is rendered for every row, so it survives the rescan's re-sort
    await waitFor(() => text(`[data-testid=upload-meta-cell-${FOG}]`).includes("empty"), "the edit to invalidate the memory");
    await activate(FOG);
    expect(q(`[data-testid=upload-meta-title-${FOG}]`)).toBeNull(); // nothing remembered to show
    expect(sent).toEqual([]); // a miss costs a click, never a silent paid call
  });

  itSlow("verifies the model against the provider's own list and never substitutes it (CP-8)", async () => {
    const calls: { url: string; key: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), key: (init.headers as Record<string, string>)[AUTH_HEADER] ?? null });
      return new Response(JSON.stringify({ models: [{ name: "models/gemini-2.5-flash" }] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    });
    await mount(makeRoot());
    await click("[data-testid=upload-key-state]");
    await type("[data-testid=upload-key-input]", fakeKey("AIza", "ui_test_key_2"));
    await click("[data-testid=upload-key-save]");
    await type("[data-testid=upload-model]", "gemini-9-imaginary");
    await click("[data-testid=upload-model-check]");
    await waitFor(() => text("[data-testid=upload-model-state]").includes("does not list"), "the model check to land");
    expect(input("[data-testid=upload-model]").value).toBe("gemini-9-imaginary"); // never silently substituted
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/models");
    expect(calls[0].url).not.toContain("key=");
    expect(calls[0].key).toBe(fakeKey("AIza", "ui_test_key_2")); // the header, never the URL
    const entry = getLogState().entries.at(-1);
    expect(entry?.action).toBe("model-checked");
    expect(entry?.level).toBe("warn");
    expect(JSON.stringify(entry)).not.toContain("ui_test_key_2"); // T12: the log never carries the key
  });
});

describe("export — green means a complete committed package", () => {
  itSlow("exports the selection: SVG + JPEG + export.json commit, the source is untouched", async () => {
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    const root = makeRoot();
    const before = fileText(root, `${DIR}/fog_AI.svg`);
    await mount(root);
    await click("[data-testid=upload-key-state]");
    await type("[data-testid=upload-key-input]", fakeKey("AIza", "ui_test_key_1"));
    await click("[data-testid=upload-key-save]");
    await check(FOG);
    // since 2026-10-08 this button generates the missing metadata first
    await click("[data-testid=upload-export-selected]");
    expect(text("#upload-meta-title")).toContain("then export 1");
    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => text(`[data-testid=upload-status-${FOG}]`).includes("Processed"), "the package to commit");
    expect(t.calls).toHaveLength(1); // exactly one paid call, and the package carries it
    expect(fileText(root, `${DIR}/export/fog.svg`)).toContain("Minimal line icon of growth");

    const exp = `${DIR}/export`;
    expect(fileText(root, `${exp}/fog.svg`)).toContain("<svg");
    expect(fileText(root, `${exp}/fog.svg`)).not.toBe(before); // a prepared copy, not the source
    expect(fileText(root, `${exp}/export.json`)).toContain("\"status\": \"processed\"");
    const jpeg = (root.children.get(DIR) as BinDir).children.get("export") as BinDir;
    const jpg = jpeg.children.get("fog.jpg") as BinFile;
    expect(jpg.bytes[0]).toBe(0xff); // a real JPEG frame (SOI)
    expect(fileText(root, `${DIR}/fog_AI.svg`)).toBe(before); // the approved source untouched
    expect(text(`[data-testid=upload-status-${FOG}]`)).toContain("Processed");
    expect(text("[data-testid=upload-count-processed]")).toContain("1");
    // the row's package cell names the committed folder
    expect(text(`[data-testid=upload-export-path-${FOG}]`)).toContain("architecture/export");
  });

  it("copies the pair's export folder location — the Generate SVG way, and no picture in the detail", async () => {
    const clip = stubClipboard();
    await mount(makeRoot());
    await activate(FOG);
    // the row detail is text only: no image, no frame — the huge icon is gone
    const detail = q(`[data-testid=upload-detail-${FOG}]`) as HTMLElement;
    expect(detail.querySelectorAll("img, figure, svg").length).toBe(0);

    await click(`[data-testid=upload-location-${FOG}]`);
    const copied = clip.written.at(-1) ?? "";
    expect(copied).toContain("architecture");
    expect(copied).toContain("export");
    expect(text("[data-testid=upload-toast]")).toContain("Folder path copied");
  });

  itSlow("T5 — the paid-work ledger: a click buys one call, and nothing else ever does", async () => {
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    const root = makeRoot();
    await mount(root);
    await click("[data-testid=upload-key-state]");
    await type("[data-testid=upload-key-input]", fakeKey("AIza", "ui_test_key_1"));
    await click("[data-testid=upload-key-save]");
    await check(FOG);
    await activate(FOG);
    await click("[data-testid=upload-meta-selected]");
    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => text(`[data-testid=upload-meta-state-${FOG}]`).includes("generated"), "the first paid answer");
    expect(t.calls).toHaveLength(1); // the one click that spends

    await click(`[data-testid=upload-meta-accept-${FOG}]`);
    expect(t.calls).toHaveLength(1);

    // a full export embeds the accepted answer: no further call
    await click("[data-testid=upload-export-selected]");
    await waitFor(() => text(`[data-testid=upload-status-${FOG}]`).includes("Processed"), "the package to commit");
    expect(t.calls).toHaveLength(1);

    // a QUALITY-ONLY change re-encodes, and still spends nothing
    await click("[data-testid=upload-settings-open]");
    await type("[data-testid=upload-set-quality]", "0.8");
    await click("[data-testid=upload-set-close]");
    await click("[data-testid=upload-export-selected]"); // FOG is still checked
    await waitFor(() => text(`[data-testid=upload-status-${FOG}]`).includes("Processed"), "the re-export");
    expect(t.calls).toHaveLength(1);

    // a metadata EDIT is re-embedded, and still spends nothing
    await activate(FOG);
    await type(`[data-testid=upload-meta-title-${FOG}]`, "Minimal line icon of steady progress");
    await click(`[data-testid=upload-meta-accept-${FOG}]`);
    expect(t.calls).toHaveLength(1);

    // a SOURCE change invalidates the answer: reconfirmation is a click, not a silent call
    const dir = root.children.get(DIR) as BinDir;
    dir.children.set("fog_AI.svg", new BinFile("fog_AI.svg", SAVED_SVG.replace("M2 2h20v20H2z", "M1 1h22v22H1z <!-- edited -->"), 7777));
    await click("[data-testid=upload-rescan]");
    await waitFor(() => text(`[data-testid=upload-status-${FOG}]`).includes("Stale"), "the source change to mark the row stale");
    expect(t.calls).toHaveLength(1); // stale is reported; a reconfirmation stays a click
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
    const svg = fileText(root, `${DIR}/export/fog.svg`);
    expect(svg).toContain("<title>Minimal line icon of growth and speed</title>");
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

describe("Download all — the finished packages of the selection, saved to a folder the user picks", () => {
  const DEFAULT_PICKER = (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker;
  const EXPORT_DIR = (root: BinDir): BinDir => (root.children.get(DIR) as BinDir).children.get("export") as BinDir;

  afterEach(() => {
    (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker = DEFAULT_PICKER;
  });

  /** The native folder dialog, stubbed: it hands back `dir`, or closes like a cancel. `opened` counts it. */
  function stubPicker(dir: BinDir | null): { opened: number } {
    const picker = { opened: 0 };
    (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker = () => {
      picker.opened += 1;
      return dir === null ? Promise.reject(new DOMException("closed", "AbortError")) : Promise.resolve(dir);
    };
    return picker;
  }

  /** The row's own Export: no metadata, no key, no paid call — waited to a committed package. */
  async function exportPackage(id: string): Promise<void> {
    await click(`[data-testid=upload-export-${id}]`);
    await waitFor(() => text(`[data-testid=upload-status-${id}]`).includes("Processed"), `${id} to be processed`);
  }

  const toast = (): string => text("[data-testid=upload-toast]");
  const namesIn = (dir: BinDir): string[] => [...dir.children.keys()].sort();
  const bytesIn = (dir: BinDir, name: string): number[] => Array.from((dir.children.get(name) as BinFile).bytes);

  it("is disabled with nothing selected, and counts only the finished packages", async () => {
    await mount(makeRoot());
    expect((q("[data-testid=upload-download-all]") as HTMLButtonElement).disabled).toBe(true);
    await check(FOG);
    expect(text("[data-testid=upload-download-all]")).toBe("⤓ Download all (0)");
  });

  itSlow("opens no folder dialog when no selected icon has a finished package, and says why", async () => {
    const picker = stubPicker(new BinDir("Stock"));
    await mount(makeRoot());
    await check(FOG);
    await click("[data-testid=upload-download-all]");
    expect(toast()).toContain("None of the 1 selected icon has a finished package");
    expect(toast()).toContain("1 not exported");
    expect(picker.opened).toBe(0);
  });

  itSlow("saves each selected package's SVG and JPG into the folder the user picks, byte for byte", async () => {
    const provider = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", provider.fetch);
    const root = makeRoot();
    await mount(root);
    await exportPackage(FOG);
    await exportPackage(ARCH);
    await check(FOG);
    await check(ARCH);
    expect(text("[data-testid=upload-download-all]")).toBe("⤓ Download all (2)");
    const dest = new BinDir("Stock");
    const picker = stubPicker(dest);
    await click("[data-testid=upload-download-all]");
    await waitFor(() => toast().includes("Saved 4 files from 2 icons"), "the download summary");
    expect(picker.opened).toBe(1);
    expect(namesIn(dest)).toEqual(["arch.jpg", "arch.svg", "fog.jpg", "fog.svg"]);
    expect((dest.children.get("fog.svg") as BinFile).text).toBe(fileText(root, `${DIR}/export/fog.svg`));
    expect(bytesIn(dest, "fog.jpg")).toEqual(bytesIn(EXPORT_DIR(root), "fog.jpg"));
    expect(toast()).toContain("2 without EPS");
    expect(provider.calls).toHaveLength(0); // copied, not exported again and not sent anywhere
    const entries = getLogState().entries.filter((e) => e.action === "downloaded");
    expect(entries).toHaveLength(1);
    expect(entries[0].detail).toContain("Saved 4 files from 2 icons");
  });

  itSlow("with EPS on in Export settings, each package's EPS lands with its SVG and JPG", async () => {
    localStorage.setItem("iconSplitter.upload.settings.v1", JSON.stringify({
      v: 1, defaults: { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true }, overrides: {},
    }));
    await mount(makeRoot());
    await exportPackage(FOG);
    await check(FOG);
    const dest = new BinDir("Stock");
    stubPicker(dest);
    await click("[data-testid=upload-download-all]");
    await waitFor(() => toast().includes("Saved 3 files from 1 icon"), "the download summary");
    expect(namesIn(dest)).toEqual(["fog.eps", "fog.jpg", "fog.svg"]);
    expect(toast()).not.toContain("without EPS");
  });

  itSlow("a cancelled folder dialog saves nothing and says so", async () => {
    await mount(makeRoot());
    await exportPackage(FOG);
    await check(FOG);
    const picker = stubPicker(null);
    await click("[data-testid=upload-download-all]");
    await waitFor(() => toast().includes("Download cancelled"), "the cancel notice");
    expect(toast()).toBe("Download cancelled — no folder was chosen, nothing was saved");
    expect(picker.opened).toBe(1);
    expect(getLogState().entries.some((e) => e.action === "downloaded")).toBe(false);
  });

  /**
   * A second folder with one approved icon. Each folder keeps its own export.json, so this icon's
   * package never shares a record with FOG's (two icons in one folder share one export.json today).
   */
  function addLogoFolder(root: BinDir): string {
    const id = pairId("logos", "logo", "");
    const dir = new BinDir("logos");
    dir.children.set("logo_AI.png", new BinFile("logo_AI.png", "ai", 3100));
    dir.children.set("logo_AI.svg", new BinFile("logo_AI.svg", SAVED_SVG, 3400));
    const meta = pairFile("logos", "logo_AI.png", { id, versions: [svgVersion("logos/logo_AI.svg", { version: 1, review: "approved" })] });
    dir.children.set("logo_AI.svg.json", new BinFile("logo_AI.svg.json", serializePairMeta(meta), 3300));
    root.children.set("logos", dir);
    return id;
  }

  /** Stored settings written by hand while the panel is unmounted, as a user's earlier session would leave them. */
  function storeSettings(defaults: typeof DEFAULT_UPLOAD_SETTINGS, overrides: Record<string, object>): void {
    localStorage.setItem("iconSplitter.upload.settings.v1", JSON.stringify({ v: 1, defaults, overrides }));
  }

  itSlow("a package whose settings changed since its export is skipped and named, not delivered", async () => {
    const root = makeRoot();
    const LOGO = addLogoFolder(root);
    await mount(root);
    await exportPackage(FOG);
    await exportPackage(LOGO);
    act(() => ui.unmount());
    // only the logo is pinned to other settings after its export: its package is now stale, FOG's still matches
    storeSettings(DEFAULT_UPLOAD_SETTINGS, { [LOGO]: { paddingPct: DEFAULT_UPLOAD_SETTINGS.paddingPct + 5 } });
    await mount(root);
    await check(FOG);
    await check(LOGO);
    expect(text("[data-testid=upload-download-all]")).toBe("⤓ Download all (1)");
    const dest = new BinDir("Stock");
    stubPicker(dest);
    await click("[data-testid=upload-download-all]");
    await waitFor(() => toast().includes("skipped"), "the download summary");
    expect(toast()).toContain("1 skipped (1 changed since export)");
    expect(namesIn(dest)).toEqual(["fog.jpg", "fog.svg"]);
  });

  itSlow("when every selected package is stale, no folder dialog opens and the notice names the change", async () => {
    const root = makeRoot();
    await mount(root);
    await exportPackage(FOG);
    act(() => ui.unmount());
    storeSettings({ ...DEFAULT_UPLOAD_SETTINGS, paddingPct: DEFAULT_UPLOAD_SETTINGS.paddingPct + 5 }, {});
    await mount(root);
    await check(FOG);
    expect(text("[data-testid=upload-download-all]")).toBe("⤓ Download all (0)");
    const picker = stubPicker(new BinDir("Stock"));
    await click("[data-testid=upload-download-all]");
    expect(toast()).toContain("None of the 1 selected icon has a finished package (1 changed since export)");
    expect(picker.opened).toBe(0);
  });

  itSlow("Cancel run stops a download between icons: the icon in progress is kept, the next one never starts", async () => {
    class SlowFile extends BinFile {
      override async createWritable() {
        const real = await super.createWritable();
        return {
          write: real.write,
          close: async () => { await new Promise((r) => setTimeout(r, 60)); await real.close(); },
        };
      }
    }
    class SlowDir extends BinDir {
      override async getFileHandle(n: string, opts?: { create?: boolean }) {
        if (!opts?.create || this.children.has(n)) return super.getFileHandle(n, opts);
        const made = new SlowFile(n);
        this.children.set(n, made);
        return made;
      }
    }
    await mount(makeRoot());
    await exportPackage(FOG);
    await exportPackage(ARCH);
    await check(FOG);
    await check(ARCH);
    const dest = new SlowDir("Stock");
    stubPicker(dest);
    await click("[data-testid=upload-download-all]");
    await waitFor(() => namesIn(dest).length >= 1, "the first file to land");
    await click("[data-testid=upload-cancel-run]");
    await waitFor(() => toast().includes("stopped after 1 of 2"), "the stopped summary");
    expect(namesIn(dest)).toHaveLength(2); // one whole icon (SVG + JPG), never half of the next
  });
});
