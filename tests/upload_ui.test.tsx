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
import { setTimeout as nodeSleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { AUTH_HEADER } from "../src/lib/upload/gemini";
import { MANDATORY_TAGS } from "../src/lib/upload/meta";
import { withIntrinsicSize } from "../src/lib/upload/raster";
import { JOURNAL_KEY } from "../src/upload/journal";
import { UPLOAD_JOBS_KEY, forgetRestoreNote } from "../src/upload/jobstore";
import { getLogState, resetLogStore } from "../src/log/logstore";
import { saveGeminiKey } from "../src/upload/keystore";
import UploadPanel from "../src/upload/UploadPanel";
import { resetAppStore } from "../src/state/appstore";
import { clearKnownRoots, rememberKnownRoot } from "../src/lib/knownroots";
import { HistoryProvider } from "../src/state/HistoryProvider";
import HistoryBar from "../src/ui/HistoryBar";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { minimalJpeg } from "./helpers/minijpeg";
import { clearGeminiKey } from "../src/upload/keystore";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { settle as quietSettle, waitUntil } from "./helpers/quiet";

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
const settle = () => quietSettle(0);

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
const waitFor = (fn: () => boolean, label: string, ms = 8000) => waitUntil(fn, label, ms);

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

/** Add a third approved row so the regeneration batch includes a selected empty row to exclude. */
function makeRegenerationRoot(): BinDir {
  const root = makeRoot();
  const dir = root.children.get(DIR) as BinDir;
  const meta = pairFile(DIR, "court_AI.png", {
    id: COURT, versions: [svgVersion(`${DIR}/court_AI.svg`, { version: 1, review: "approved" })],
  });
  dir.children.set("court_AI.svg.json", new BinFile("court_AI.svg.json", serializePairMeta(meta), 3300));
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

/**
 * Texts of the SVGs that differ per row, so a mix-up is visible in the bytes.
 * The per-file FILL is the identity a row preview keeps in both renderings:
 * with visual defaults off the box shows the approved text, and with any visual
 * setting on it shows the PREPARED export, whose path data is baked into
 * artboard px — the literal `d` no longer appears, the paint still does.
 */
const distinctSvg = (mark: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-icon="${mark}"><path d="${pathOf(mark)}" fill="${colorOf(mark)}"/></svg>`;

function colorOf(mark: string): string {
  if (mark === "FOG") return "#123456";
  return mark === "ARCH2" ? "#00ff00" : "#654321";
}

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

/** File.text is native I/O; unrelated fast-forwarded timers must not exhaust its wait. */
async function waitForFilePreview(id: string, drawing: string): Promise<void> {
  const stopAt = Date.now() + 8000;
  while (!previewHtml(id).includes(drawing) && Date.now() < stopAt) {
    await act(async () => { await nodeSleep(1); });
  }
  if (!previewHtml(id).includes(drawing)) throw new Error(`never reached: ${id} SVG preview`);
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
  clearKnownRoots();
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

describe("the Full path row — never a previous root with the new name appended (I-46/I-51/I-63)", () => {
  const SINGLE = "F:\\Stocks 2026\\icons testing\\single";
  const OLD = `${SINGLE}\\test_processing_2\\_split_output`;
  const LEGACY_KEY = "iconSplitter.rootpaths.v1"; // the old name-keyed store: never read
  const usePicker = (pick: () => Promise<unknown>) =>
    Object.defineProperty(window, "showDirectoryPicker", { value: pick, configurable: true });
  const readClipboard = (text: string) =>
    Object.defineProperty(navigator, "clipboard", { value: { readText: async () => text }, configurable: true });

  itSlow("picks a sibling tree while the clipboard holds a folder of the old root: the row says 'not captured'", async () => {
    // the reported mistake (2026-10-09): the clipboard still held the app's own
    // "copy folder path" of an export folder deep inside the previous root
    const root = makeRoot();
    Object.assign(root, { resolve: async () => null }); // the new pick is NOT below this root
    rememberKnownRoot(root, OLD);
    await mount(root);
    expect(text("[data-testid=upload-folder-path] code")).toBe(OLD);
    readClipboard(`${OLD}\\2026-10\\2026-10-08_18-46-23\\icon-bank-institution_AI_10\\split_03\\export`);
    usePicker(async () => new BinDir("test_process_3"));
    await click("[data-testid=upload-open-folder]");
    await waitFor(() => text("[data-testid=upload-folder-path] code") === "test_process_3", "the new root's row");
    expect(text("[data-testid=upload-folder-path]")).not.toContain("export\\test_process_3");
    expect(text("[data-testid=upload-folder-path]")).toContain("full path not captured");
  });

  itSlow("a stored guess in the old name-keyed store is never shown and never glued onto a child pick", async () => {
    // the second report (2026-10-09): an older build had stored the glued guess
    // for the root; the user then picked its `_split_output`. Since I-63 the
    // name-keyed store is not read at all — a guess cannot even survive.
    const root = makeRoot();
    const glued = `${OLD}\\2026-10\\2026-10-08_18-46-23\\icon-bank-institution_AI_10\\split_03\\export\\${root.name}`;
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ [root.name]: { path: glued, how: "completed" } }));
    Object.assign(root, { resolve: async () => ["_split_output"] });
    await mount(root);
    expect(text("[data-testid=upload-folder-path] code")).toBe(root.name);
    expect(text("[data-testid=upload-folder-path]")).toContain("full path not captured");
    readClipboard("");
    usePicker(async () => new BinDir("_split_output"));
    await click("[data-testid=upload-open-folder]");
    await waitFor(() => text("[data-testid=upload-folder-path] code") === "_split_output", "the child's row");
    expect(text("[data-testid=upload-folder-path]")).toContain("full path not captured");
    expect(text("[data-testid=upload-folder-path]")).not.toContain("export");
  });

  itSlow("Rescan captures the exact path Explorer copied, and the next child pick derives from it", async () => {
    const root = makeRoot();
    Object.assign(root, { resolve: async () => ["_split_output"] });
    await mount(root);
    readClipboard(`${SINGLE}\\${root.name}`);
    await click("[data-testid=upload-rescan]");
    await waitFor(() => text("[data-testid=upload-folder-path] code") === `${SINGLE}\\${root.name}`, "the exact path");
    readClipboard("");
    usePicker(async () => new BinDir("_split_output"));
    await click("[data-testid=upload-open-folder]");
    await waitFor(() => text("[data-testid=upload-folder-path] code") === `${SINGLE}\\${root.name}\\_split_output`, "the derived child path");
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

  it("disables the selected Shadow checkbox with no checks; defaults do not enable unselected icons", async () => {
    await mount(makeRoot());
    await click("[data-testid=upload-settings-open]");
    const toggle = q("[data-testid=upload-set-shadow-selected]") as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    expect(toggle.checked).toBe(false);
    expect(q("[data-testid=upload-shadow-controls]")?.closest("[data-testid=upload-dialog-backdrop]")).not.toBeNull();
    expect(q("[data-testid=upload-shadow-controls]")?.closest("[data-testid=upload-bulk]")).toBeNull();
    await type("[data-testid=upload-set-shadow-width]", "95");
    await act(async () => { q("[data-testid=upload-set-shadow-width]")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    const stored = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(stored.defaults).toMatchObject({ shadowEnabled: false, shadowWidthPct: 95 });
    expect(stored.overrides[FOG]).toBeUndefined();
    await click("[data-testid=upload-set-close]");
    expect(q(`[data-testid=upload-prev-${FOG}]`)?.shadowRoot?.querySelector("radialGradient")).toBeNull();
  });

  it("Shadow popup changes checked icons including hidden rows, never the active unchecked row or provider", async () => {
    await mount(makeRoot());
    await activate(ARCH);
    await check(FOG);
    await type("[data-testid=upload-search]", "arch_AI");
    expect(q(`[data-testid=upload-row-${FOG}]`)).toBeNull();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await click("[data-testid=upload-settings-open]");
    const selected = q("[data-testid=upload-set-shadow-selected]") as HTMLInputElement;
    expect(selected.closest("[data-testid=upload-dialog-backdrop]")).not.toBeNull();
    expect(selected.checked).toBe(false);
    await click("[data-testid=upload-set-shadow-selected]");
    expect(selected.checked).toBe(true);
    await click("[data-testid=upload-set-close]");
    const raw = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(raw.applied[FOG]).toMatchObject({ shadowEnabled: true });
    expect(raw.overrides[FOG]).toBeUndefined(); // a decoration is not a row override
    expect(raw.applied[ARCH]).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(q("[data-testid=upload-meta-backdrop]")).toBeNull();
    await type("[data-testid=upload-search]", "");
    await waitFor(() => Boolean(q(`[data-testid=upload-prev-${FOG}]`)?.shadowRoot?.querySelector("radialGradient")),
      "the shadow in the selected row's live export preview");
    expect(q(`[data-testid=upload-prev-${ARCH}]`)?.shadowRoot?.querySelector("radialGradient")).toBeNull();
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("shadow");
    await click("[data-testid=hist-undo]");
    expect(JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").applied[FOG]).toBeUndefined();
    await click("[data-testid=hist-redo]");
    expect(JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").applied[FOG]).toMatchObject({ shadowEnabled: true });
  });

  it("Shadow checkbox enables mixed checked rows then removes them, with selected width and gap", async () => {
    await mount(makeRoot());
    await check(FOG);
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-shadow-selected]");
    await click("[data-testid=upload-set-close]");
    await check(ARCH);
    await click("[data-testid=upload-settings-open]");
    const toggle = () => q("[data-testid=upload-set-shadow-selected]") as HTMLInputElement;
    expect(toggle().checked).toBe(false);
    expect(toggle().indeterminate).toBe(true);
    await click("[data-testid=upload-set-shadow-selected]");
    expect(toggle().checked).toBe(true);
    expect(toggle().indeterminate).toBe(false);
    await type("[data-testid=upload-shadow-width]", "125");
    await act(async () => { q("[data-testid=upload-shadow-width]")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await type("[data-testid=upload-shadow-gap]", "12");
    await act(async () => { q("[data-testid=upload-shadow-gap]")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    const applied = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").applied;
    for (const id of [FOG, ARCH]) expect(applied[id]).toMatchObject({ shadowEnabled: true, shadowWidthPct: 125, shadowGapPct: 12 });
    const historyLength = JSON.parse(localStorage.getItem("iconSplitter.history.v1") ?? "{}").entries.length;
    await type("[data-testid=upload-shadow-width]", "125");
    await act(async () => { q("[data-testid=upload-shadow-width]")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(JSON.parse(localStorage.getItem("iconSplitter.history.v1") ?? "{}").entries).toHaveLength(historyLength);
    await click("[data-testid=upload-set-close]");
    await click("[data-testid=hist-undo]");
    const undone = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").applied[FOG];
    expect(undone).toMatchObject({ shadowEnabled: true, shadowWidthPct: 125 });
    expect(undone.shadowGapPct).toBeUndefined(); // the gap edit was the step undone
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("shadow 125% · gap 5%");
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-shadow-selected]");
    // "off" removes the applied shadow (and its numbers) — never a `false` override pin
    for (const id of [FOG, ARCH]) {
      const row = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
      expect(row.applied[id]?.shadowEnabled).toBeUndefined();
      expect(row.overrides[id]?.shadowEnabled).toBeUndefined();
    }
    expect(q("[data-testid=upload-shadow-selected]")).toBeNull();
  });

  it("edits selected Shadow width without enabling a checked icon whose Shadow is off", async () => {
    await mount(makeRoot());
    await check(FOG);
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-shadow-selected]");
    await click("[data-testid=upload-set-close]");
    await check(ARCH);
    await click("[data-testid=upload-settings-open]");
    const toggle = q("[data-testid=upload-set-shadow-selected]") as HTMLInputElement;
    expect(toggle.indeterminate).toBe(true);
    await type("[data-testid=upload-shadow-width]", "130");
    await act(async () => { q("[data-testid=upload-shadow-width]")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    const applied = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").applied;
    expect(applied[FOG]).toMatchObject({ shadowEnabled: true, shadowWidthPct: 130 });
    expect(applied[ARCH]).toBeUndefined(); // an off icon is never enabled by a dimension
    expect(toggle.indeterminate).toBe(true);
    await click("[data-testid=upload-set-close]");
    await click("[data-testid=hist-undo]");
    expect(JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").applied[FOG]).toEqual({ shadowEnabled: true });
  });

  it("reset to inherited never unticks the Checked-icons Shadow, badge and size-guide boxes", async () => {
    await mount(makeRoot());
    await check(FOG);
    // the popup applies all three decorations to the checked selection
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-shadow-selected]");
    await click("[data-testid=upload-set-badge-selected]");
    await click("[data-testid=upload-set-sizeguide-selected]");
    // and the user changes a global default in the same popup
    await type("[data-testid=upload-set-shadow-width]", "130");
    await act(async () => { input("[data-testid=upload-set-shadow-width]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await click("[data-testid=upload-set-close]");
    // one LOCAL general pin is what the button resets
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    await type("[data-testid=upload-set-padding]", "17");
    await act(async () => { input("[data-testid=upload-set-padding]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await click("[data-testid=upload-set-close]");
    expect(text("[data-testid=upload-reset-settings]")).toContain("Reset to inherited (1)");
    await click("[data-testid=upload-reset-settings]");
    // the general pin went; every decoration and the global default stayed
    const saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    const decorations = { shadowEnabled: true, badgeEnabled: true, sizeGuideEnabled: true };
    expect(saved.overrides[FOG]).toBeUndefined(); // every parameter is inherited again
    expect(saved.applied[FOG]).toEqual(decorations); // …the decorations still apply
    expect(saved.defaults.shadowWidthPct).toBe(130);
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("inherits defaults");
    // … and the three boxes in the popup still read checked
    await click("[data-testid=upload-settings-open]");
    expect(input("[data-testid=upload-set-shadow-selected]").checked).toBe(true);
    expect(input("[data-testid=upload-set-badge-selected]").checked).toBe(true);
    expect(input("[data-testid=upload-set-sizeguide-selected]").checked).toBe(true);
    await click("[data-testid=upload-set-close]");
    // one undo brings the padding pin back and leaves the decorations alone
    await click("[data-testid=hist-undo]");
    const undone = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(undone.overrides[FOG]).toEqual({ paddingPct: 17 });
    expect(undone.applied[FOG]).toEqual(decorations);
  });

  it("migrates decorations an earlier build stored as overrides, then resets everything", async () => {
    // the migration case: decoration fields sit in `overrides` (pre-2026-10-21 payload)
    localStorage.setItem("iconSplitter.upload.settings.v1", JSON.stringify({
      v: 1,
      overrides: { [FOG]: { shadowEnabled: true, badgeEnabled: true, sizeGuideEnabled: true, paddingPct: 17 } },
    }));
    await mount(makeRoot());
    // … they load as applied decorations, so the row's dialog reads them inherited
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    expect(text("[data-testid=upload-set-marker-shadow]")).toBe("inherited");
    expect(text("[data-testid=upload-set-marker-badge]")).toBe("inherited");
    expect(text("[data-testid=upload-set-marker-sizeguide]")).toBe("inherited");
    expect(text("[data-testid=upload-set-marker-padding]")).toBe("overridden");
    await click("[data-testid=upload-set-close]");
    await check(FOG);
    await click("[data-testid=upload-reset-settings]");
    const saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.overrides[FOG]).toBeUndefined(); // the padding pin went too
    expect(saved.applied[FOG]).toEqual({ shadowEnabled: true, badgeEnabled: true, sizeGuideEnabled: true });
    await click("[data-testid=upload-settings-open]");
    expect(input("[data-testid=upload-set-shadow-selected]").checked).toBe(true);
    expect(input("[data-testid=upload-set-badge-selected]").checked).toBe(true);
    expect(input("[data-testid=upload-set-sizeguide-selected]").checked).toBe(true);
    await click("[data-testid=upload-set-close]");
  });

  it("explains vector-only EPS shadows before a shadowed selection is exported", async () => {
    await mount(makeRoot());
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-eps]");
    await click("[data-testid=upload-set-close]");
    await check(FOG);
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-shadow-selected]");
    expect(q("[data-testid=upload-shadow-eps-warning]")?.textContent).toMatch(/EPS.*vector.*never rasterize/);
    expect(q("[role=dialog] [data-testid=upload-shadow-eps-note]")?.textContent).toMatch(/EPS.*vector/);
    await click("[data-testid=upload-set-shadow-selected]");
    expect(q("[data-testid=upload-shadow-eps-warning]")).toBeNull();
    expect(q("[role=dialog] [data-testid=upload-shadow-eps-note]")).toBeNull();
  });

  it("offers one badge control set; editing defaults never opts an icon in", async () => {
    await mount(makeRoot());
    await click("[data-testid=upload-settings-open]");
    const selected = input("[data-testid=upload-set-badge-selected]");
    expect(selected.closest("[data-testid=upload-dialog-backdrop]")).not.toBeNull();
    expect(selected.disabled).toBe(true);
    expect(selected.checked).toBe(false);
    expect(q("[data-testid=upload-badge-width]")).toBeNull(); // no second, selected-only placement block
    expect(input("[data-testid=upload-set-badge-width]").closest("fieldset")).not.toBeNull();
    expect((input("[data-testid=upload-set-badge-width]").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(false);
    expect(text("[data-testid=upload-badge-defaults-note]")).toMatch(/never turn on/i);
    await click("[data-testid=upload-set-badge-section] .svg-label");
    expect(selected.checked).toBe(false); // headings are not part of a checkbox's hitbox
    expect(input("[data-testid=upload-set-badge-width]").value).toBe("40");
    expect((q("[data-testid=upload-set-badge-corner]") as HTMLSelectElement).value).toBe("bottom-right");
    expect(input("[data-testid=upload-set-badge-offset-x]").value).toBe("3");
    expect(input("[data-testid=upload-set-badge-offset-y]").value).toBe("3");
    expect(text("[data-testid=upload-badge-fit-note]")).toMatch(/shrink.*100%/i);
    await type("[data-testid=upload-set-badge-width]", "48");
    await act(async () => { input("[data-testid=upload-set-badge-width]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await selectOption("[data-testid=upload-set-badge-corner]", "top-left");
    await type("[data-testid=upload-set-badge-offset-x]", "9");
    await act(async () => { input("[data-testid=upload-set-badge-offset-x]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    const stored = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(stored.defaults).toMatchObject({ badgeEnabled: false, badgeWidthPct: 48, badgeCorner: "top-left", badgeOffsetXPct: 9 });
    expect(stored.overrides).toEqual({});
    expect((q("[data-testid=hist-undo]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("toggles badges only for checked icons including hidden checks, not the active unchecked row", async () => {
    await mount(makeRoot());
    await activate(ARCH);
    await check(FOG);
    await type("[data-testid=upload-search]", "arch_AI");
    expect(q(`[data-testid=upload-row-${FOG}]`)).toBeNull();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await click("[data-testid=upload-settings-open]");
    const selected = input("[data-testid=upload-set-badge-selected]");
    expect(selected.checked).toBe(false);
    await click("[data-testid=upload-set-badge-selected]");
    expect(selected.checked).toBe(true);
    const stored = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(stored.applied[FOG]).toMatchObject({ badgeEnabled: true });
    expect(stored.applied[ARCH]).toBeUndefined();
    expect(stored.overrides[FOG]).toBeUndefined(); // a decoration is not a row override
    expect(fetchSpy).not.toHaveBeenCalled();
    await click("[data-testid=upload-set-close]");
    await click("[data-testid=hist-undo]");
    expect(JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").applied[FOG]).toBeUndefined();
    await click("[data-testid=hist-redo]");
    expect(JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").applied[FOG]).toMatchObject({ badgeEnabled: true });
  });

  it("adds badges to a mixed check; the single defaults block never opts an icon in", async () => {
    await mount(makeRoot());
    await check(FOG);
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-badge-selected]");
    await click("[data-testid=upload-set-close]");
    await check(ARCH);
    await click("[data-testid=upload-settings-open]");
    const selected = () => input("[data-testid=upload-set-badge-selected]");
    expect(selected().indeterminate).toBe(true);
    await type("[data-testid=upload-set-badge-width]", "51");
    await act(async () => { input("[data-testid=upload-set-badge-width]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await selectOption("[data-testid=upload-set-badge-corner]", "top-right");
    await type("[data-testid=upload-set-badge-offset-x]", "7");
    await act(async () => { input("[data-testid=upload-set-badge-offset-x]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await type("[data-testid=upload-set-badge-offset-y]", "8");
    await act(async () => { input("[data-testid=upload-set-badge-offset-y]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    const stored = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(stored.defaults).toMatchObject({ badgeWidthPct: 51, badgeCorner: "top-right", badgeOffsetXPct: 7, badgeOffsetYPct: 8 });
    expect(stored.applied[FOG]).toEqual({ badgeEnabled: true }); // inherits the one defaults block
    expect(stored.applied[ARCH]).toBeUndefined();
    expect(stored.overrides).toEqual({}); // no popup gesture pins a row
    expect(selected().indeterminate).toBe(true);
    await click("[data-testid=upload-set-badge-selected]");
    expect(selected().checked).toBe(true);
    expect(selected().indeterminate).toBe(false);
    expect(JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").applied[ARCH]).toEqual({ badgeEnabled: true });
    await click("[data-testid=upload-set-badge-selected]");
    const removed = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").applied;
    for (const id of [FOG, ARCH]) expect(removed[id]).toBeUndefined(); // "off" removes the applied badge
  });

  it("edits the shared badge defaults without pinning checked icons or adding undo entries", async () => {
    await mount(makeRoot());
    await check(FOG);
    await check(ARCH);
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-badge-selected]");
    const before = JSON.parse(localStorage.getItem("iconSplitter.history.v1") ?? "{}").entries.length;
    await type("[data-testid=upload-set-badge-width]", "62");
    await act(async () => { input("[data-testid=upload-set-badge-width]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await selectOption("[data-testid=upload-set-badge-corner]", "bottom-left");
    await type("[data-testid=upload-set-badge-offset-x]", "11");
    await act(async () => { input("[data-testid=upload-set-badge-offset-x]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await type("[data-testid=upload-set-badge-offset-y]", "12");
    await act(async () => { input("[data-testid=upload-set-badge-offset-y]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    const stored = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(stored.defaults).toMatchObject({ badgeWidthPct: 62, badgeCorner: "bottom-left", badgeOffsetXPct: 11, badgeOffsetYPct: 12 });
    for (const id of [FOG, ARCH]) expect(stored.applied[id]).toEqual({ badgeEnabled: true });
    expect(JSON.parse(localStorage.getItem("iconSplitter.history.v1") ?? "{}").entries).toHaveLength(before);
  });

  it("the general reset clears every parameter of the row's dialog and keeps the applied decorations", async () => {
    await mount(makeRoot());
    // a row-dialog decoration with its geometry — ordinary local pins
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    expect(text("[data-testid=upload-set-marker-badge]")).toBe("inherited");
    await click("[data-testid=upload-set-badge]");
    expect(text("[data-testid=upload-set-marker-badge]")).toBe("overridden");
    await type("[data-testid=upload-set-badge-width]", "55");
    await act(async () => { input("[data-testid=upload-set-badge-width]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await selectOption("[data-testid=upload-set-badge-corner]", "top-left");
    await type("[data-testid=upload-set-badge-offset-x]", "6");
    await act(async () => { input("[data-testid=upload-set-badge-offset-x]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await type("[data-testid=upload-set-padding]", "17");
    await act(async () => { input("[data-testid=upload-set-padding]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await click("[data-testid=upload-set-close]");
    // … plus a shadow applied by the global popup (an applied decoration, not a pin)
    await check(FOG);
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-shadow-selected]");
    await click("[data-testid=upload-set-close]");
    expect(q("[data-testid=upload-apply-settings]")).toBeNull();
    // ONE reset: the dialog's own parameters all go, the applied shadow stays
    await click("[data-testid=upload-reset-settings]");
    let saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.overrides[FOG]).toBeUndefined();
    expect(saved.applied[FOG]).toEqual({ shadowEnabled: true });
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    for (const testid of ["badge", "badge-width", "badge-corner", "badge-offset-x", "padding"]) {
      expect(text(`[data-testid=upload-set-marker-${testid}]`), testid).toBe("inherited");
    }
    expect(text("[data-testid=upload-set-marker-shadow]")).toBe("inherited"); // applied, not pinned
    await click("[data-testid=upload-set-close]");
    await click("[data-testid=hist-undo]");
    saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.overrides[FOG]).toMatchObject({ badgeEnabled: true, badgeWidthPct: 55,
      badgeCorner: "top-left", badgeOffsetXPct: 6, paddingPct: 17 });
    // the row's own reset follows the same rule
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    await click("[data-testid=upload-set-reset]");
    saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.overrides[FOG]).toBeUndefined();
    expect(saved.applied[FOG]).toEqual({ shadowEnabled: true });
    await click("[data-testid=upload-set-close]");
    await click("[data-testid=hist-undo]");
    expect(JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").overrides[FOG])
      .toMatchObject({ badgeEnabled: true, paddingPct: 17 });
  });

  it("reads a decoration applied to the selection as inherited until this row changes it", async () => {
    await mount(makeRoot());
    await check(FOG);
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-shadow-selected]");
    await click("[data-testid=upload-set-badge-selected]");
    await click("[data-testid=upload-set-sizeguide-selected]");
    await click("[data-testid=upload-set-close]");
    // the icon really carries all three — the export path is unchanged …
    const decorated = text(`[data-testid=upload-settings-${FOG}]`);
    expect(decorated).toContain("shadow");
    expect(decorated).toContain("badge");
    expect(decorated).toContain("size guide");
    // … and none of them counts as a row pin
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("inherits defaults");
    const storedRow = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(storedRow.overrides[FOG]).toBeUndefined(); // a decoration is not a row pin
    expect(storedRow.applied[FOG]).toEqual({ shadowEnabled: true, badgeEnabled: true, sizeGuideEnabled: true });
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    expect(input("[data-testid=upload-set-shadow]").checked).toBe(true);
    expect(text("[data-testid=upload-set-marker-shadow]")).toBe("inherited");
    expect(text("[data-testid=upload-set-marker-badge]")).toBe("inherited");
    expect(text("[data-testid=upload-set-marker-sizeguide]")).toBe("inherited");
    // a change in THIS row's own dialog is what makes it overridden
    await click("[data-testid=upload-set-badge]");
    expect(input("[data-testid=upload-set-badge]").checked).toBe(false);
    expect(text("[data-testid=upload-set-marker-badge]")).toBe("overridden");
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("1 field overridden");
    // the local badge pin wins over the applied decoration; the other two stay applied
    const marked = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(marked.overrides[FOG]).toEqual({ badgeEnabled: false });
    expect(marked.applied[FOG]).toEqual({ shadowEnabled: true, badgeEnabled: true, sizeGuideEnabled: true });
    // undo restores the applied state — and its inherited word
    await click("[data-testid=upload-set-close]");
    await click("[data-testid=hist-undo]");
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("inherits defaults");
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    expect(text("[data-testid=upload-set-marker-badge]")).toBe("inherited");
    expect(input("[data-testid=upload-set-badge]").checked).toBe(true);
    await click("[data-testid=upload-set-close]");
  });

  it("offers one size-guide control set; its defaults never opt an icon in", async () => {
    await mount(makeRoot());
    await click("[data-testid=upload-settings-open]");
    const selected = input("[data-testid=upload-set-sizeguide-selected]");
    expect(selected.disabled).toBe(true);
    expect(selected.checked).toBe(false);
    expect(text("[data-testid=upload-sizeguide-defaults-note]")).toMatch(/never turn on/i);
    expect((q("[data-testid=upload-set-sizeguide-corner]") as HTMLSelectElement).value).toBe("bottom-left");
    expect(input("[data-testid=upload-set-sizeguide-small-width]").value).toBe("6");
    expect(input("[data-testid=upload-set-sizeguide-large-width]").value).toBe("12");
    expect(input("[data-testid=upload-set-sizeguide-small-stroke]").value).toBe("0");
    expect(input("[data-testid=upload-set-sizeguide-large-stroke]").value).toBe("0");
    expect(input("[data-testid=upload-set-sizeguide-gap]").value).toBe("2");
    expect(input("[data-testid=upload-set-sizeguide-offset-x]").getAttribute("aria-label")).toMatch(/left edge/i);
    expect(input("[data-testid=upload-set-sizeguide-offset-y]").getAttribute("aria-label")).toMatch(/bottom edge/i);
    expect(text("[data-testid=upload-sizeguide-fit-note]")).toMatch(/shrink.*100%/i);
    await selectOption("[data-testid=upload-set-sizeguide-corner]", "top-right");
    expect(input("[data-testid=upload-set-sizeguide-offset-x]").getAttribute("aria-label")).toMatch(/right edge/i);
    expect(input("[data-testid=upload-set-sizeguide-offset-y]").getAttribute("aria-label")).toMatch(/top edge/i);
    await type("[data-testid=upload-set-sizeguide-large-width]", "15");
    await act(async () => { input("[data-testid=upload-set-sizeguide-large-width]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await type("[data-testid=upload-set-sizeguide-gap]", "4");
    await act(async () => { input("[data-testid=upload-set-sizeguide-gap]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    const stored = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(stored.defaults).toMatchObject({ sizeGuideEnabled: false, sizeGuideCorner: "top-right", sizeGuideLargePct: 15, sizeGuideGapPct: 4 });
    expect(stored.overrides).toEqual({});
  });

  it("groups the size guide as placement, S, L and spacing, one block per logo", async () => {
    await mount(makeRoot());
    await click("[data-testid=upload-settings-open]");
    const block = (id: string) => q(`[data-testid=upload-sizeguide-${id}]`);
    for (const id of ["placement", "small", "large", "spacing"]) expect(block(id)?.classList.contains("up-guide-block")).toBe(true);
    // each logo's width AND its own stroke width live in that logo's block
    expect(block("small")?.contains(input("[data-testid=upload-set-sizeguide-small-width]"))).toBe(true);
    expect(block("small")?.contains(input("[data-testid=upload-set-sizeguide-small-stroke]"))).toBe(true);
    expect(block("small")?.contains(input("[data-testid=upload-set-sizeguide-large-width]"))).toBe(false);
    expect(block("large")?.contains(input("[data-testid=upload-set-sizeguide-large-stroke]"))).toBe(true);
    expect(block("placement")?.contains(q("[data-testid=upload-set-sizeguide-corner]"))).toBe(true);
    expect(block("spacing")?.contains(input("[data-testid=upload-set-sizeguide-gap]"))).toBe(true);
    // short visible labels inside a named block; the full sentence stays the accessible name
    expect(block("small")?.querySelector(".svg-label")?.textContent).toBe("S — small logo");
    expect(block("small")?.textContent).toContain("Stroke width px");
    expect(block("small")?.textContent).not.toContain("Stroke width %");
    expect(block("large")?.textContent).toContain("Stroke width px");
    expect(input("[data-testid=upload-set-sizeguide-small-width]").getAttribute("aria-label"))
      .toBe("S logo width as percent of artboard width");
    expect(input("[data-testid=upload-set-sizeguide-small-stroke]").getAttribute("aria-label"))
      .toBe("S logo stroke width in px");
    expect(input("[data-testid=upload-set-sizeguide-large-stroke]").getAttribute("aria-label"))
      .toBe("L logo stroke width in px");
    expect(input("[data-testid=upload-set-sizeguide-small-stroke]").getAttribute("max")).toBe("50");
    expect(input("[data-testid=upload-set-sizeguide-gap]").getAttribute("aria-label"))
      .toMatch(/clear distance between the S and L logos/i);
  });

  it("marks badge and size guide in the row summary only while they are on", async () => {
    await mount(makeRoot());
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    expect(text(`[data-testid=upload-settings-${FOG}]`)).not.toMatch(/badge|size guide/);
    await click("[data-testid=upload-set-badge]");
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("badge");
    await click("[data-testid=upload-set-sizeguide]");
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("size guide 6/12%");
    await click("[data-testid=upload-set-badge]");
    expect(text(`[data-testid=upload-settings-${FOG}]`)).not.toContain("· badge");
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("size guide");
  });

  it("keeps the shadow and badge checkboxes clickable without swallowing the whole row", async () => {
    await mount(makeRoot());
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    for (const id of ["upload-set-shadow", "upload-set-sizeguide", "upload-set-badge"]) {
      const box = input(`[data-testid=${id}]`);
      expect(box.closest("label")?.classList.contains("up-shadow-check"), id).toBe(true);
      expect(box.closest("label")?.className).not.toContain("up-set-field");
    }
    expect(input("[data-testid=upload-set-shadow]").getAttribute("aria-label")).toBe("Shadow on this icon");
  });

  it("toggles the size guide only for checked icons and names the Expand strokes interaction", async () => {
    await mount(makeRoot());
    await activate(ARCH);
    await check(FOG);
    await click("[data-testid=upload-settings-open]");
    const selected = input("[data-testid=upload-set-sizeguide-selected]");
    expect(selected.checked).toBe(false);
    await click("[data-testid=upload-set-sizeguide-selected]");
    expect(selected.checked).toBe(true);
    const stored = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(stored.applied[FOG]).toEqual({ sizeGuideEnabled: true });
    expect(stored.overrides[FOG]).toBeUndefined();
    expect(stored.applied[ARCH]).toBeUndefined();
    await click("[data-testid=upload-set-expand]");
    expect(text("[data-testid=upload-sizeguide-expand-note]")).toMatch(/outline only/i);
    await click("[data-testid=upload-set-close]");
    await click("[data-testid=hist-undo]"); // the Expand strokes toggle
    await click("[data-testid=hist-undo]"); // the size-guide opt-in
    expect(JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").applied[FOG]).toBeUndefined();
  });

  it("shows the size guide's per-icon pins and its own edge labels", async () => {
    await mount(makeRoot());
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    expect(text("[data-testid=upload-set-marker-sizeguide]")).toBe("inherited");
    await click("[data-testid=upload-set-sizeguide]");
    expect(text("[data-testid=upload-set-marker-sizeguide]")).toBe("overridden");
    await type("[data-testid=upload-set-sizeguide-small-stroke]", "2");
    await act(async () => { input("[data-testid=upload-set-sizeguide-small-stroke]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(text("[data-testid=upload-set-marker-sizeguide-small-stroke]")).toBe("overridden");
    const pinned = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(pinned.overrides[FOG]).toMatchObject({ sizeGuideEnabled: true, sizeGuideSmallStrokePx: 2 });
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

describe("settings — defaults, overrides, one undoable bulk reset", () => {
  it("edits the global defaults (persisted, NOT on the undo timeline)", async () => {
    await mount(makeRoot());
    await click("[data-testid=upload-settings-open]");
    expect(q("[data-testid=upload-dialog]") ?? q("[data-testid=upload-dialog-backdrop]")).not.toBeNull();
    expect(text("[data-testid=upload-dialog-scope]")).toContain("General settings are inherited");
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
    // padding, not the stroke width: that is ONE value, the bar's (2026-10-19)
    await type("[data-testid=upload-set-padding]", "12");
    expect(text("[data-testid=upload-set-marker-padding]")).toBe("overridden");
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("pad 12%");
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("1 field overridden");
    const saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.overrides[FOG]).toEqual({ paddingPct: 12 });
    // one gesture entry, and one undo reverses the pin
    await act(async () => { (q("[data-testid=hist-undo]") as HTMLButtonElement).click(); });
    await settle();
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("inherits defaults");
    await click("[data-testid=upload-set-close]");
  });

  it("resets the selection's overrides as ONE undoable entry, and only the checked rows", async () => {
    await mount(makeRoot());
    // two LOCAL edits, each in that row's own Settings dialog
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    await type("[data-testid=upload-set-padding]", "12");
    await click("[data-testid=upload-set-close]");
    await click(`[data-testid=upload-settings-btn-${ARCH}]`);
    await type("[data-testid=upload-set-padding]", "14");
    await click("[data-testid=upload-set-close]");
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("1 field overridden");
    const uploadEntries = () => (JSON.parse(localStorage.getItem("iconSplitter.history.v1") ?? "{}").entries ?? [])
      .filter((e: { type: string }) => e.type === "uploadSettings");
    const before = uploadEntries().length;
    // only FOG is checked: a global reset must never touch the unchecked row
    await check(FOG);
    await click("[data-testid=upload-reset-settings]");
    let saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.overrides[FOG]).toBeUndefined();
    expect(saved.overrides[ARCH]).toEqual({ paddingPct: 14 });
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("inherits defaults");
    // exactly one history entry for the whole batch
    expect(uploadEntries()).toHaveLength(before + 1);
    expect(uploadEntries().at(-1).ids).toEqual([FOG]);
    // one undo restores the pin, one redo clears it again
    await click("[data-testid=hist-undo]");
    saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.overrides[FOG]).toEqual({ paddingPct: 12 });
    await click("[data-testid=hist-redo]");
    saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.overrides[FOG]).toBeUndefined();
    // nothing pinned in the selection any more: the button counts zero and cannot fire
    expect((q("[data-testid=upload-reset-settings]") as HTMLButtonElement).disabled).toBe(true);
    expect(text("[data-testid=upload-reset-settings]")).toContain("(0)");
  });

  it("resets only the selected rows — the global defaults a user changed stay", async () => {
    await mount(makeRoot());
    await check(FOG);
    await check(ARCH);
    // the user changed two global numbers and then gave the selection a shadow
    await click("[data-testid=upload-settings-open]");
    await type("[data-testid=upload-set-shadow-width]", "130");
    await act(async () => { input("[data-testid=upload-set-shadow-width]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await type("[data-testid=upload-set-badge-width]", "32");
    await act(async () => { input("[data-testid=upload-set-badge-width]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await click("[data-testid=upload-set-shadow-selected]");
    await click("[data-testid=upload-set-close]");
    // a LOCAL pin in FOG's own dialog is what the reset clears
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    await type("[data-testid=upload-set-padding]", "17");
    await click("[data-testid=upload-set-close]");
    // FOG stays selected for the reset; ARCH is unchecked
    await check(ARCH);
    await click("[data-testid=upload-reset-settings]");
    const saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.defaults).toMatchObject({ shadowWidthPct: 130, badgeWidthPct: 32 }); // never reset
    expect(saved.overrides[FOG]).toBeUndefined(); // the padding pin is gone
    expect(saved.applied[FOG]).toEqual({ shadowEnabled: true }); // the applied shadow stays
    expect(saved.applied[ARCH]).toEqual({ shadowEnabled: true });
    expect(saved.overrides[ARCH]).toBeUndefined(); // no popup gesture pins a row
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("inherits defaults");
    // the untouched row still reads inherited, because nothing pinned it
    expect(text(`[data-testid=upload-settings-pinned-${ARCH}]`)).toContain("inherits defaults");
  });

  it("the reset also keeps a width the popup applied to the selection", async () => {
    await mount(makeRoot());
    await check(FOG);
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-shadow-selected]");
    await type("[data-testid=upload-shadow-width]", "120");
    await act(async () => { input("[data-testid=upload-shadow-width]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await click("[data-testid=upload-set-close]");
    // a local pin in FOG's own dialog gives the reset something to clear
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    await type("[data-testid=upload-set-padding]", "17");
    await click("[data-testid=upload-set-close]");
    const before = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(before.overrides[FOG]).toEqual({ paddingPct: 17 }); // the popup wrote no override
    expect(before.applied[FOG]).toEqual({ shadowEnabled: true, shadowWidthPct: 120 });
    await click("[data-testid=upload-reset-settings]");
    const saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.overrides[FOG]).toBeUndefined();
    expect(saved.applied[FOG]).toEqual({ shadowEnabled: true, shadowWidthPct: 120 });
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("shadow 120% · gap");
  });

  it("a bulk global action can never create a row override", async () => {
    await mount(makeRoot());
    await click("[data-testid=upload-select-visible]");
    await click("[data-testid=upload-settings-open]");
    // every visual default the global dialog owns, changed with the whole list checked
    await type("[data-testid=upload-set-padding]", "20");
    await selectOption("[data-testid=upload-set-artboard]", "512");
    await type("[data-testid=upload-set-badge-width]", "48");
    await act(async () => { input("[data-testid=upload-set-badge-width]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await type("[data-testid=upload-set-shadow-width]", "130");
    await act(async () => { input("[data-testid=upload-set-shadow-width]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await type("[data-testid=upload-set-sizeguide-gap]", "9");
    await act(async () => { input("[data-testid=upload-set-sizeguide-gap]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await click("[data-testid=upload-set-close]");
    // the defaults moved; no row received a single override
    const saved = JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}");
    expect(saved.defaults).toMatchObject({ paddingPct: 20, badgeWidthPct: 48, shadowWidthPct: 130, sizeGuideGapPct: 9 });
    expect(saved.overrides).toEqual({});
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("pad 20%"); // inherited, live
    expect(text(`[data-testid=upload-settings-pinned-${FOG}]`)).toContain("inherits defaults");
    // and no bulk control pins the global values into the selection any more
    expect(q("[data-testid=upload-apply-settings]")).toBeNull();
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
    // each field is checked when it is left, not per keystroke (2026-10-19)
    await type("[data-testid=upload-set-artboard-w]", "1024");
    await act(async () => { input("[data-testid=upload-set-artboard-w]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await type("[data-testid=upload-set-artboard-h]", "576");
    await act(async () => { input("[data-testid=upload-set-artboard-h]").dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
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

    // edit + accept (no record yet → no auto export); the Title Case and the
    // FINAL period the user typed are gone at the accept gate — every sentence
    // kept — and the field shows it at once (RULE 24)
    await type(`[data-testid=upload-meta-title-${FOG}]`, "Minimal Line Icon Of Growth. Speed and growth chart.");
    await typeArea(`[data-testid=upload-meta-description-${FOG}]`, "Clean line icon showing growth and rising trends. Second sentence here.");
    await click(`[data-testid=upload-meta-accept-${FOG}]`);
    expect(text(`[data-testid=upload-meta-state-${FOG}]`)).toContain("accepted");
    expect(text(`[data-testid=upload-meta-cell-${FOG}]`)).toContain("accepted");
    expect(input(`[data-testid=upload-meta-title-${FOG}]`).value).toBe("Minimal line icon of growth. Speed and growth chart");
    expect((q(`[data-testid=upload-meta-description-${FOG}]`) as HTMLTextAreaElement).value).toBe("Clean line icon showing growth and rising trends. Second sentence here");
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

  itSlow("bulk regeneration replaces metadata only for selected rows that already have it", async () => {
    const t = geminiTransport(GOOD_ANSWER);
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRegenerationRoot());
    await click("[data-testid=upload-key-state]");
    await type("[data-testid=upload-key-input]", fakeKey("AIza", "ui_test_key_1"));
    await click("[data-testid=upload-key-save]");

    await check(FOG);
    await check(ARCH);
    const regen = await waitForEl("[data-testid=upload-meta-regenerate-selected]") as HTMLButtonElement;
    expect(regen.textContent).toContain("Regenerate metadata (0)");
    expect(regen.disabled).toBe(true);
    await click("[data-testid=upload-meta-selected]");
    expect(text("#upload-meta-title")).toContain("Generate metadata for 2 icons");
    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => t.calls.length === 2
      && text(`[data-testid=upload-meta-cell-${FOG}]`).includes("generated")
      && text(`[data-testid=upload-meta-cell-${ARCH}]`).includes("generated"), "the initial metadata to land");

    await check(COURT); // selected, approved SVG, but no metadata yet
    expect(text("[data-testid=upload-meta-selected]")).toContain("Generate metadata (1)");
    expect(text("[data-testid=upload-meta-regenerate-selected]")).toContain("Regenerate metadata (2)");
    await click("[data-testid=upload-meta-regenerate-selected]");
    expect(text("#upload-meta-title")).toContain("Regenerate metadata for 2 icons");
    expect(text("[data-testid=upload-meta-confirm]")).toContain("Regenerate metadata");
    expect(text("[data-testid=upload-meta-backdrop]")).toContain("replaces the current text");
    await waitForEl("[data-testid=upload-preview-count]");
    expect(q(`[data-testid=upload-preview-${FOG}]`)).not.toBeNull();
    expect(q(`[data-testid=upload-preview-${ARCH}]`)).not.toBeNull();
    expect(q(`[data-testid=upload-preview-${COURT}]`)).toBeNull();

    await click("[data-testid=upload-meta-confirm]");
    await waitFor(() => t.calls.length >= 4 && q("[data-testid=upload-progress]") === null, "regeneration batch to finish");
    expect(t.calls).toHaveLength(4); // two initial requests plus only the two existing metadata rows
    expect(text(`[data-testid=upload-meta-cell-${FOG}]`)).toContain("generated");
    expect(text(`[data-testid=upload-meta-cell-${ARCH}]`)).toContain("generated");
    expect(text(`[data-testid=upload-meta-cell-${FOG}]`)).not.toContain("accepted");
    expect(text(`[data-testid=upload-meta-cell-${COURT}]`)).toContain("empty");
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

  itSlow("previews each row's own approved SVG, before and after a rescan", async () => {
    const root = makeDistinctRoot();
    // A file read can still be pending after scan. An unrelated app timer must
    // not spend the artwork wait's entire virtual-time budget before it lands.
    const fog = (root.children.get(DIR) as BinDir).children.get("fog_AI.svg") as BinFile;
    const getFile = fog.getFile.bind(fog);
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
    vi.spyOn(fog, "getFile").mockImplementation(async () => {
      const file = await getFile();
      const read = file.text.bind(file);
      Object.defineProperty(file, "text", { value: async () => { await readGate; return read(); } });
      return file;
    });
    vi.stubGlobal("fetch", geminiTransport(GOOD_ANSWER).fetch);
    await mount(root);
    const unrelated = setTimeout(() => undefined, 8000);
    void nodeSleep(40).then(releaseRead);
    try {
      await waitForFilePreview(FOG, "#123456");
    } finally {
      clearTimeout(unrelated);
    }
    expect(previewHtml(ARCH).includes("#654321")).toBe(true); // never the neighbour's drawing
    expect(previewHtml(ARCH).includes("#123456")).toBe(false);
    // the user replaces the approved SVG on disk and rescans: only that row changes
    const dir = root.children.get(DIR) as BinDir;
    dir.children.set("arch_AI.svg", new BinFile("arch_AI.svg", distinctSvg("ARCH2"), 3600));
    await click("[data-testid=upload-rescan]");
    await waitForFilePreview(ARCH, "#00ff00");
    expect(previewHtml(FOG).includes("#123456")).toBe(true); // untouched
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
    // the journal is read after the list renders: wait for the state, not a tick count
    await waitFor(() => text(`[data-testid=upload-meta-cell-${FOG}]`).includes("interrupted"), "the interrupted state");
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
