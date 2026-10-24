// svg_imgreg_ui.test.tsx — AI source image regeneration (user request
// 2026-10-16): the guarded row/bulk action, the confirm dialog with the SAME
// prompt + preset list as SVG generation, the batch run that writes versioned
// images into "AI source regeneration versions", and the version chips that
// switch the MAIN image (persisted in the pair file, I-54).
// 2026-10-19 fix (archive/2026-10-19-image-regen-fix): the row keeps its 8
// grid cells (RC1), the dialog is a real overlay (RC2), the run is visible and
// stoppable (RC3), nothing fails silently (RC4), a pair without a file gets one
// (RC5), and an SVG generation afterwards keeps the image history and reads the
// new main (RC6/RC8). The REAL runner executes against a stubbed fetch (RULE 8).
import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as fakeIndexedDb from "fake-indexeddb";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { newPairMeta, serializePairMeta } from "../src/lib/pairmeta";
import { compositeLayout } from "../src/lib/svgcomposite";
import { clearApiKey, saveApiKey } from "../src/svg/keystore";
import { IMAGE_EDIT_PREF_KEY } from "../src/svg/imgprefs";
import { getLogState } from "../src/log/logstore";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import SvgPanel from "../src/svg/SvgPanel";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { streamFrames, transport, type Transport } from "./helpers/svgtransport";
import { settle as quietSettle, waitUntil } from "./helpers/quiet";

vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
vi.stubGlobal("IDBKeyRange", fakeIndexedDb.IDBKeyRange);

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

// The contact sheet needs a canvas; a marker keeps the REAL run. It records the
// file each source's image is read from — the main image, not the original (RC8).
const sheets: string[][] = [];
vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async (_root: unknown, sources: readonly { relPath: string }[], imageOf?: (s: { relPath: string }) => string) => {
      sheets.push(sources.map((s) => (imageOf ? imageOf(s) : s.relPath)));
      return { dataUrl: `data:image/png;base64,${sources.map((s) => s.relPath).join("|")}`, hash: `h${sources.length}`, layout: compositeLayout(sources.length), bytes: 10 };
    }),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FOG = pairId("architecture", "fog", "");
const REGEN = "architecture/AI source regeneration versions";
const w = window as unknown as { showDirectoryPicker?: () => Promise<unknown> };

// ── the fake provider ──────────────────────────────────────────────────────
/** What each image EDIT request carried (prompt + the reference file); how it answers is up to the test. */
const imageCalls: { prompt: string; fileName: string; ref: string }[] = [];
let imageAnswer: () => Promise<Response> = async () => okImage();
let svgT: Transport = transport();

function okImage(): Response {
  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: btoa("PNGDATA") }] }), { status: 200 });
}

/** Image edits → the per-test answer; chat → the shared SVG transport; else 404. */
async function routedFetch(url: string, init?: RequestInit): Promise<Response> {
  if (url.endsWith("/images/edits")) {
    const form = init?.body as FormData;
    const file = form.get("image[]") as File;
    imageCalls.push({ prompt: String(form.get("prompt") ?? ""), fileName: file.name, ref: await file.text() });
    return imageAnswer();
  }
  if (url.endsWith("/chat/completions")) return svgT.fetch(url, init);
  return new Response("{}", { status: 404 });
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/** A folder whose subfolders cannot be created — a permission the browser withdrew. */
class NoNewFolders extends FakeDir {
  async getDirectoryHandle(n: string, opts?: { create?: boolean }): Promise<FakeDir> {
    if (opts?.create === true && !this.children.has(n)) throw new DOMException("The request is not allowed by the user agent", "NotAllowedError");
    return super.getDirectoryHandle(n, opts);
  }
}

/** One approved pair, architecture/fog; `pairFile: null` = never generated, a string = that file's text. */
function makeRoot(o: { pairFile?: string | null; arch?: FakeDir } = {}): FakeDir {
  const root = new FakeDir("split_root");
  const arch = o.arch ?? new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  root.children.set("architecture", arch);
  const recs = [{ pair_id: FOG, source: `${FOG}.png`, ai_result: `${FOG}_AI.png`, decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }];
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  const pairMeta = newPairMeta({ id: FOG, base: "fog", suffix: "", dirPath: "architecture",
    ai: { relPath: "architecture/fog_AI.png", name: "fog_AI.png", fingerprint: "20:3100" },
    source: { relPath: "architecture/fog.png", name: "fog.png", fingerprint: "12:3000" } });
  const text = o.pairFile === undefined ? serializePairMeta(pairMeta) : o.pairFile;
  if (text !== null) arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 10, 3200, text));
  return root;
}

let host: HTMLDivElement;
let ui: Root | undefined;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const txt = (sel: string) => q(sel)?.textContent ?? "";
const settle = (ms = 60) => quietSettle(ms);
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await settle(30); };
const choose = async (sel: string, text: string) => {
  const el = q(sel) as HTMLSelectElement;
  const opt = Array.from(el.options).find((o) => o.text.includes(text))!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, opt.value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
};
const typeInto = async (sel: string, text: string) => {
  const el = q(sel) as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
};
/** The pair file as it is on disk right now (null = no file). */
const metaNow = () => {
  const root = stored.get("__svg__") as { source: FakeDir } | undefined;
  const arch = root!.source.children.get("architecture") as FakeDir;
  const file = arch.children.get("fog_AI.svg.json") as FakeFile | undefined;
  return file ? JSON.parse(file.text) : null;
};
const meta = async () => metaNow();
const regenNames = () => {
  const root = stored.get("__svg__") as { source: FakeDir };
  const dir = (root.source.children.get("architecture") as FakeDir).children.get("AI source regeneration versions") as FakeDir | undefined;
  return dir ? [...dir.children.keys()] : [];
};
const waitFor = (pred: () => boolean, what: string, budgetMs = 4000) => waitUntil(pred, what, budgetMs);

// ── CSS contracts (jsdom does no layout, so the rules themselves are pinned) ─
const css = () => readFileSync(join(process.cwd(), "src/index.css"), "utf8");
/** Top-level tracks of a grid-template-columns value — a minmax(…) is ONE track. */
function trackCount(value: string): number {
  let depth = 0, count = 0, inToken = false;
  for (const ch of value.trim()) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    const gap = depth === 0 && /\s/.test(ch);
    if (!gap && !inToken) count += 1;
    inToken = !gap;
  }
  return count;
}
/** Every track list `.svg-row` declares (the wide and the narrow layout). */
const rowTrackCounts = () => [...css().matchAll(/\.svg-row\s*\{[^}]*?grid-template-columns:\s*([^;]+);/g)].map((m) => trackCount(m[1]));
/** The declarations of one exact selector's rule. */
function ruleBody(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(css())?.[1] ?? "";
}

beforeEach(async () => {
  await dropDb();
  await clearApiKey();
  await saveApiKey("rq_test_key");
  window.localStorage.clear();
  stored.clear();
  imageCalls.length = 0;
  sheets.length = 0;
  imageAnswer = async () => okImage();
  svgT = transport();
  vi.stubGlobal("fetch", routedFetch);
  resetAppStore();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  if (ui !== undefined) { const r = ui; await act(async () => r.unmount()); }
  ui = undefined;
  host.remove();
  vi.unstubAllGlobals();
  vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
  vi.stubGlobal("IDBKeyRange", fakeIndexedDb.IDBKeyRange);
});

/** Mount and pick the fixture root (the text connection stays active). */
async function mount(root: FakeDir = makeRoot()): Promise<void> {
  w.showDirectoryPicker = () => Promise.resolve(root);
  await act(async () => {
    const r = createRoot(host);
    ui = r;
    r.render(<HistoryProvider><SvgPanel /></HistoryProvider>);
  });
  await settle();
  await click(q("[data-testid=svg-open-folder]")!);
  await settle(150);
  await settle(300);
}

/** Mount, pick the fixture root, switch to the Sunburst image connection. */
async function mountWithImages(root: FakeDir = makeRoot()): Promise<void> {
  await mount(root);
  await choose("[data-testid=svg-connection-select]", "Sunburst");
}

/** Opens the row's dialog and confirms it. */
async function regenerateRow(): Promise<void> {
  await click(q(`[data-testid=svg-row-image-regen-${FOG}]`)!);
  await click(q("[data-testid=svg-img-generate]")!);
}

describe("image regeneration — the guard", () => {
  it("the bulk action refuses honestly while a TEXT connection is active", async () => {
    await mount();
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    expect(q("[data-testid=svg-img-confirm]")).toBeNull();
    expect(txt("[data-testid=svg-toast]")).toMatch(/image connection/i);
  });

  it("an unreadable pair file is refused before anything is sent — it is never overwritten (D6)", async () => {
    await mountWithImages(makeRoot({ pairFile: "{not json" }));
    await click(q(`[data-testid=svg-row-image-regen-${FOG}]`)!);
    expect(q("[data-testid=svg-img-confirm]")).toBeNull();
    expect(txt("[data-testid=svg-toast]")).toMatch(/unreadable/i);
    expect(imageCalls).toHaveLength(0);
  });
});

describe("image regeneration — the row layout (RC1)", () => {
  it("the row keeps exactly the cells its CSS grid declares (both layouts), the decision actions last", async () => {
    await mount();
    const row = q(`[data-testid=svg-row-${FOG}]`)!;
    const counts = rowTrackCounts();
    expect(counts.length).toBeGreaterThan(0);
    for (const n of counts) expect(row.children.length).toBe(n);
    expect(row.lastElementChild?.classList.contains("svg-decision-actions")).toBe(true);
    // nothing to show yet (no version, nothing in flight, no failure) = no strip
    expect(q(`[data-testid=svg-ai-bar-${FOG}]`)).toBeNull();
  });

  it("the strip wraps inside the pair and never widens the preview column", () => {
    const rule = ruleBody(".svg-ai-bar");
    expect(rule).toMatch(/flex-wrap:\s*wrap/);
    expect(rule).toMatch(/contain:\s*inline-size/);
  });
});

describe("image regeneration — the dialog is a real overlay (RC2)", () => {
  it("the SVG confirm's shell: fixed backdrop, modal section, head, capability note, wait limit", async () => {
    await mountWithImages();
    await click(q(`[data-testid=svg-row-image-regen-${FOG}]`)!);
    const dialog = q("[data-testid=svg-img-confirm]")!;
    expect(dialog.classList.contains("svg-backdrop")).toBe(true);
    const modal = dialog.querySelector("section.svg-modal")!;
    expect(modal.getAttribute("role")).toBe("dialog");
    expect(modal.getAttribute("aria-modal")).toBe("true");
    expect(modal.querySelector(".svg-modal-head h2")?.textContent).toMatch(/Regenerate AI source image/);
    expect(modal.querySelector(".svg-modal-body .svg-modal-actions [data-testid=svg-img-generate]")).not.toBeNull();
    expect(txt("[data-testid=svg-img-caps]")).toMatch(/Image edit/);
    expect(txt("[data-testid=svg-img-wait]")).toMatch(/300 s/);
    expect(ruleBody(".svg-backdrop")).toMatch(/position:\s*fixed/);
  });

  it("Generate stays disabled while the prompt is empty — nothing blank is ever sent", async () => {
    await mountWithImages();
    await click(q(`[data-testid=svg-row-image-regen-${FOG}]`)!);
    await typeInto("[data-testid=svg-img-prompt]", "   ");
    expect((q("[data-testid=svg-img-generate]") as HTMLButtonElement).disabled).toBe(true);
    await typeInto("[data-testid=svg-img-prompt]", "a flat fog icon");
    expect((q("[data-testid=svg-img-generate]") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("image regeneration — the confirmed batch", () => {
  it("the dialog shows the image provider, the prompt and the shared presets; Generate writes version 1 and makes it main", async () => {
    await mountWithImages();
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    const dialog = q("[data-testid=svg-img-confirm]");
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toMatch(/Sunburst/);
    expect(q("[data-testid=svg-img-prompt]")).not.toBeNull();
    expect(q("[data-testid=svg-img-prompt-select]")).not.toBeNull();
    await click(q("[data-testid=svg-img-generate]")!);
    await settle(200);
    const m = await meta();
    expect(m.imageVersions).toHaveLength(1);
    expect(m.imageVersions[0].file).toBe(`${REGEN}/fog_AI_v1.png`);
    expect(m.imagePreferred).toBe(1);
    expect(regenNames()).toEqual(["fog_AI_v1.png"]);
    expect(imageCalls).toHaveLength(1);
    expect(imageCalls[0].prompt.length).toBeGreaterThan(0);
    // the row's version bar shows the new main — in the strip INSIDE the pair cell
    expect(q(`[data-testid=svg-ai-chip-${FOG}-1]`)?.getAttribute("data-active")).toBe("true");
    const bar = q(`[data-testid=svg-ai-bar-${FOG}]`)!;
    expect(bar.closest(".svg-pair-with-bar")).not.toBeNull();
    expect(bar.contains(q(`[data-testid=svg-ai-chip-${FOG}-1]`))).toBe(true);
  });

  it("a second run appends v2; clicking v1's chip makes it main again", async () => {
    await mountWithImages();
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    await click(q("[data-testid=svg-img-generate]")!);
    await settle(150);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    await click(q("[data-testid=svg-img-generate]")!);
    await settle(150);
    expect((await meta()).imagePreferred).toBe(2);
    await click(q(`[data-testid=svg-ai-chip-${FOG}-1]`)!);
    await settle(150);
    expect((await meta()).imagePreferred).toBe(1);
  });

  it("sends the prompt AND the source's current main image as the reference; a later run references the new main", async () => {
    await mountWithImages();
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    expect(q("[data-testid=svg-img-confirm]")!.textContent).toMatch(/reference/i);
    expect(q("[data-testid=svg-img-confirm]")!.textContent).not.toMatch(/text-to-image only/i);
    await click(q("[data-testid=svg-img-generate]")!);
    await settle(200);
    expect(imageCalls[0].fileName).toBe("fog_AI.png");
    expect(imageCalls[0].ref).toBe("b"); // the ORIGINAL AI source (fixture bytes) on the first run
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    await click(q("[data-testid=svg-img-generate]")!);
    await settle(200);
    expect(imageCalls[1].fileName).toBe("fog_AI_v1.png");
    expect(imageCalls[1].ref).toBe("PNGDATA"); // v1 is main now, so v1 is the reference
  });

  it("an unreadable current image fails honestly — nothing is sent, never text-only; the reason is shown", async () => {
    await mountWithImages();
    const root = stored.get("__svg__") as { source: FakeDir };
    ((root.source.children.get("architecture") as FakeDir).children).delete("fog_AI.png");
    await click(q(`[data-testid=svg-row-image-regen-${FOG}]`)!);
    await click(q("[data-testid=svg-img-generate]")!);
    await settle(200);
    expect(imageCalls).toHaveLength(0);
    expect(txt("[data-testid=svg-toast]")).toMatch(/current AI image could not be read, so nothing was sent/);
    expect(txt(`[data-testid=svg-ai-error-${FOG}]`)).toMatch(/could not be read/);
  });

  it("the dialog is a real modal: backdrop + dialog section holding the prompt and Generate", async () => {
    await mountWithImages();
    await click(q(`[data-testid=svg-row-image-regen-${FOG}]`)!);
    const backdrop = q("[data-testid=svg-img-confirm]")!;
    expect(backdrop.className).toContain("svg-backdrop");
    const modal = backdrop.querySelector("section.svg-modal[role=dialog]");
    expect(modal).not.toBeNull();
    expect(modal!.contains(q("[data-testid=svg-img-prompt]"))).toBe(true);
    expect(modal!.contains(q("[data-testid=svg-img-generate]"))).toBe(true);
  });

  it("the row stays one grid cell per header column; the image action lives INSIDE the decision cell", async () => {
    await mountWithImages();
    const row = q(`[data-testid=svg-row-${FOG}]`)!;
    const columns = q(".svg-columns")!;
    expect(row.children.length).toBe(columns.children.length);
    const button = q(`[data-testid=svg-row-image-regen-${FOG}]`)!;
    expect(button.parentElement?.classList.contains("svg-decision-actions")).toBe(true);
    expect(button.parentElement?.parentElement).toBe(row);
  });

  it("the image button looks like the SVG Regenerate button, split from the vector buttons by a separator", async () => {
    await mountWithImages();
    const svgBtn = q(`[data-testid=svg-generate-${FOG}]`)!;
    const imgBtn = q(`[data-testid=svg-row-image-regen-${FOG}]`)!;
    for (const cls of ["svg-btn", "tiny", "primary"]) {
      expect(imgBtn.classList.contains(cls)).toBe(svgBtn.classList.contains(cls));
    }
    const sep = q(`[data-testid=svg-row-${FOG}] .svg-decision-sep`)!;
    expect(sep).not.toBeNull();
    const order = [...imgBtn.parentElement!.children];
    expect(order.indexOf(svgBtn)).toBeLessThan(order.indexOf(sep));
    expect(order.indexOf(sep)).toBeLessThan(order.indexOf(imgBtn));
  });

  it("the row action opens the same dialog for just that row", async () => {
    await mountWithImages();
    await click(q(`[data-testid=svg-row-image-regen-${FOG}]`)!);
    expect(q("[data-testid=svg-img-confirm]")).not.toBeNull();
    expect(txt("[data-testid=svg-img-count]")).toBe("1");
    await click(q("[data-testid=svg-img-cancel]")!);
    expect(q("[data-testid=svg-img-confirm]")).toBeNull();
  });
});

describe("image regeneration — a visible, stoppable run (RC3, RULE 5/7)", () => {
  it("while the image is on its way: busy pill, the row's in-flight marker, Stop; then the new main lands", async () => {
    const answer = deferred<Response>();
    imageAnswer = () => answer.promise;
    await mountWithImages();
    await regenerateRow();
    expect(q("[data-testid=svg-img-confirm]")).toBeNull();
    expect(txt("[data-testid=svg-busy]")).toBe("Regenerating AI sources · 0/1");
    expect(q(`[data-testid=svg-ai-running-${FOG}]`)).not.toBeNull();
    const rowButton = q(`[data-testid=svg-row-image-regen-${FOG}]`) as HTMLButtonElement;
    expect(rowButton.disabled).toBe(true);
    expect(rowButton.textContent).toMatch(/Regenerating/);
    expect((q("[data-testid=svg-bulk-image-regen]") as HTMLButtonElement).disabled).toBe(true);
    await click(q("[data-testid=svg-img-stop]")!);
    expect(txt("[data-testid=svg-toast]")).toMatch(/already sent will finish/i);

    await act(async () => { answer.resolve(okImage()); });
    await settle(200);
    expect(q(`[data-testid=svg-ai-running-${FOG}]`)).toBeNull();
    expect(q("[data-testid=svg-busy]")).toBeNull();
    expect(q("[data-testid=svg-img-stop]")).toBeNull();
    expect(q(`[data-testid=svg-ai-chip-${FOG}-1]`)?.getAttribute("data-active")).toBe("true");
    expect(txt("[data-testid=svg-toast]")).toBe("Regenerated 1 AI source — it is now the main image");
  });
});

describe("image regeneration — nothing fails silently (RC4)", () => {
  it("an HTTP failure: the provider's reason in the toast and on the row; recorded, main unchanged", async () => {
    const body = { error: { origin: "router", message: "Unknown parameter: 'response_format'" } };
    imageAnswer = async () => new Response(JSON.stringify(body), { status: 400 });
    await mountWithImages();
    await regenerateRow();
    await settle(200);
    const toast = q("[data-testid=svg-toast]")!;
    expect(toast.classList.contains("error")).toBe(true);
    expect(toast.textContent).toBe("No AI source was regenerated — the image request failed (HTTP 400 Unknown parameter: 'response_format')");
    expect(txt(`[data-testid=svg-ai-error-${FOG}]`)).toMatch(/HTTP 400 Unknown parameter/);
    const m = metaNow();
    expect(m.imageVersions.map((v: { status: string }) => v.status)).toEqual(["failed"]);
    expect(m.imagePreferred).toBeNull();
    expect(q("[data-testid=svg-busy]")).toBeNull();
    expect(q(`[data-testid=svg-ai-running-${FOG}]`)).toBeNull();
  });

  it("a disk failure after the image arrived is reported with its reason — never an unhandled rejection", async () => {
    await mountWithImages(makeRoot({ arch: new NoNewFolders("architecture") }));
    await regenerateRow();
    await settle(200);
    const toast = q("[data-testid=svg-toast]")!;
    expect(toast.classList.contains("error")).toBe(true);
    expect(toast.textContent).toMatch(/could not be saved.*not allowed/i);
    expect(txt(`[data-testid=svg-ai-error-${FOG}]`)).toMatch(/could not be saved/i);
    expect(q("[data-testid=svg-busy]")).toBeNull();
    expect(q(`[data-testid=svg-ai-running-${FOG}]`)).toBeNull();
  });
});

function manyPairs(names: string[]): FakeDir {
  const root = makeRoot();
  const arch = root.children.get("architecture") as FakeDir;
  const decisions = JSON.parse((root.children.get("review-decisions.json") as FakeFile).text) as { records: unknown[] };
  for (const name of names) {
    const id = pairId("architecture", name, "");
    arch.children.set(`${name}.png`, new FakeFile(`${name}.png`, 12, 3000, "c"));
    arch.children.set(`${name}_AI.png`, new FakeFile(`${name}_AI.png`, 20, 3100, "d"));
    arch.children.set(`${name}_AI.svg.json`, new FakeFile(`${name}_AI.svg.json`, 10, 3200, serializePairMeta(newPairMeta({
      id, base: name, suffix: "", dirPath: "architecture",
      ai: { relPath: `architecture/${name}_AI.png`, name: `${name}_AI.png`, fingerprint: "20:3100" },
      source: { relPath: `architecture/${name}.png`, name: `${name}.png`, fingerprint: "12:3000" },
    }))));
    decisions.records.push({ pair_id: id, source: `${id}.png`, ai_result: `${id}_AI.png`, decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" });
  }
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify(decisions)));
  return root;
}

function editCanvas(outputSide = 1024): void {
  const pngHeader = String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10);
  imageAnswer = async () => new Response(JSON.stringify({ data: [{ b64_json: btoa(pngHeader) }] }), { status: 200 });
  vi.stubGlobal("createImageBitmap", async (file: File) => ({ width: file.name === "edited-image" ? outputSide : 100,
    height: file.name === "edited-image" ? outputSide : 100, close: () => undefined }));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:prepared") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({ fillStyle: "", fillRect: () => undefined, drawImage: () => undefined }) as never);
  let encoded = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(new Blob([++encoded === 1 ? "SHEET" : `CROP-${encoded}`], { type: "image/png" })));
}

describe("composite AI-source regeneration", () => {
  it("sends one previewed sheet for two pairs, reviews returned crops, and saves separate preferred versions", async () => {
    const root = manyPairs(["mist"]);
    const arch = root.children.get("architecture") as FakeDir;
    editCanvas();
    await mountWithImages(root);
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    await waitFor(() => q("[data-testid=svg-img-composite] img") !== null, "the confirmed sheet preview");
    expect(txt("[data-testid=svg-img-manifest]")).toMatch(/fog_AI\.png.*mist_AI\.png/s);
    await click(q("[data-testid=svg-img-generate]")!);
    await waitFor(() => q("[data-testid=svg-img-review]") !== null, "returned cells to review");
    expect(metaNow().imageVersions).toHaveLength(0);
    expect(imageCalls).toHaveLength(1);
    expect(imageCalls[0].ref).toBe("SHEET");
    expect(imageCalls[0].prompt).toMatch(/same cell positions/i);
    await click(q("[data-testid=svg-img-apply]")!);
    await waitFor(() => metaNow().imagePreferred === 1, "first pair new main");
    const second = JSON.parse((arch.children.get("mist_AI.svg.json") as FakeFile).text);
    expect(second.imageVersions).toHaveLength(1);
    expect(second.imagePreferred).toBe(1);
    expect(metaNow().imageVersions[0].file).toMatch(/AI source regeneration versions\/fog_AI_v1\.png/);
  });

  it("splits a resized 3×3 response back into nine different pair histories", async () => {
    const names = Array.from({ length: 8 }, (_, i) => `icon${i + 2}`);
    const root = manyPairs(names);
    const arch = root.children.get("architecture") as FakeDir;
    editCanvas(1536);
    await mountWithImages(root);
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    const input = q("[data-testid=svg-img-per-request]") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "9");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(() => txt("[data-testid=svg-img-manifest]").includes("icon9_AI.png"), "nine slots ready");
    await click(q("[data-testid=svg-img-generate]")!);
    await waitFor(() => q("[data-testid=svg-img-review]") !== null, "nine returned cells");
    expect(q("[data-testid=svg-img-review]")!.querySelectorAll(".svg-img-result-cells img")).toHaveLength(9);
    await click(q("[data-testid=svg-img-apply]")!);
    await waitFor(() => metaNow().imagePreferred === 1, "first of nine saved");
    const files = arch.children.get("AI source regeneration versions") as FakeDir;
    const images = ["fog", ...names].map((name) => {
      const metaFile = arch.children.get(`${name}_AI.svg.json`) as FakeFile;
      expect(JSON.parse(metaFile.text).imagePreferred).toBe(1);
      return (files.children.get(`${name}_AI_v1.png`) as FakeFile).text;
    });
    expect(new Set(images).size).toBe(9);
    expect(imageCalls).toHaveLength(1);
    expect(imageCalls[0].prompt).toMatch(/3×3/);
  }, 15000);

  it("Discard writes no versions; a changed source is skipped when applying another result", async () => {
    const root = manyPairs(["mist"]);
    const arch = root.children.get("architecture") as FakeDir;
    editCanvas();
    await mountWithImages(root);
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    await waitFor(() => q("[data-testid=svg-img-composite]") !== null, "two-icon preview");
    await click(q("[data-testid=svg-img-generate]")!);
    await waitFor(() => q("[data-testid=svg-img-review]") !== null, "review before discard");
    await click(q("[data-testid=svg-img-discard]")!);
    await waitFor(() => q("[data-testid=svg-img-review]") === null, "discarded result closed");
    expect(metaNow().imageVersions).toEqual([]);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    await waitFor(() => q("[data-testid=svg-img-composite]") !== null, "new preview");
    await click(q("[data-testid=svg-img-generate]")!);
    await waitFor(() => q("[data-testid=svg-img-review]") !== null, "new review");
    arch.children.set("mist_AI.png", new FakeFile("mist_AI.png", 9, 4, "changed"));
    await click(q("[data-testid=svg-img-apply]")!);
    await waitFor(() => metaNow().imagePreferred === 1, "unchanged pair saved");
    const second = JSON.parse((arch.children.get("mist_AI.svg.json") as FakeFile).text);
    expect(second.imagePreferred).toBeNull();
    expect(second.imageVersions).toEqual([]);
  }, 15000);

  it("does not send a broken group but still processes other previewed groups", async () => {
    editCanvas();
    const root = manyPairs(["icon2", "icon3", "icon4", "icon5"]);
    await mountWithImages(root);
    localStorage.setItem(IMAGE_EDIT_PREF_KEY, JSON.stringify({ v: 1, count: 2 }));
    (root.children.get("architecture") as FakeDir).children.delete("fog_AI.png");
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    await waitFor(() => q("[data-testid=svg-img-skipped]") !== null, "one group skipped during preparation");
    expect(txt("[data-testid=svg-img-skipped]")).toMatch(/2 not sent.*fog_AI\.png/i);
    await click(q("[data-testid=svg-img-generate]")!);
    await waitFor(() => q("[data-testid=svg-img-review]") !== null, "valid group review");
    await click(q("[data-testid=svg-img-discard]")!);
    await waitFor(() => imageCalls.length === 2 && q("[data-testid=svg-busy]") === null, "other valid group completed");
    expect(metaNow().imageVersions).toEqual([]);
    const arch = root.children.get("architecture") as FakeDir;
    expect(JSON.parse((arch.children.get("icon5_AI.svg.json") as FakeFile).text).imagePreferred).toBe(1);
  }, 15000);

  it("logs the provider's cost once for a composite, never once per saved icon", async () => {
    editCanvas();
    const pngHeader = String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10);
    imageAnswer = async () => new Response(JSON.stringify({ data: [{ b64_json: btoa(pngHeader) }],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, cost: 0.05 } }), { status: 200 });
    await mountWithImages(manyPairs(["mist"]));
    const before = getLogState().entries.length;
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    await waitFor(() => q("[data-testid=svg-img-composite]") !== null, "preview ready");
    await click(q("[data-testid=svg-img-generate]")!);
    await waitFor(() => q("[data-testid=svg-img-review]") !== null, "review ready");
    await click(q("[data-testid=svg-img-apply]")!);
    await waitFor(() => q("[data-testid=svg-busy]") === null, "images committed");
    const logs = getLogState().entries.slice(before).filter((entry) => entry.action === "image-regen-request");
    expect(logs).toHaveLength(1);
    expect(logs[0].data?.cost).toBe(0.05);
    expect(txt("[data-testid=svg-toast]")).toContain("$0.0500");
  }, 15000);

  it("Stop blocks the next group but lets the sent group finish and be reviewed", async () => {
    const reply = deferred<Response>();
    editCanvas();
    const goodReply = imageAnswer;
    imageAnswer = () => reply.promise;
    await mountWithImages(manyPairs(["mist", "icon3", "icon4"]));
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    const input = q("[data-testid=svg-img-per-request]") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "2");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitFor(() => txt("[data-testid=svg-img-composite]").includes("Request 1 of 2"), "two prepared requests");
    await click(q("[data-testid=svg-img-generate]")!);
    await waitFor(() => imageCalls.length === 1, "first edit sent");
    await click(q("[data-testid=svg-img-stop]")!);
    await act(async () => reply.resolve(await goodReply()));
    await waitFor(() => q("[data-testid=svg-img-review]") !== null, "sent group review still offered");
    await click(q("[data-testid=svg-img-discard]")!);
    await waitFor(() => q("[data-testid=svg-busy]") === null, "stopped run ended");
    expect(imageCalls).toHaveLength(1);
    expect(txt("[data-testid=svg-toast]")).toMatch(/2 discarded.*2 not sent/i);
  }, 15000);

  it("Stop remains available while the user reviews an answered group", async () => {
    editCanvas();
    await mountWithImages(manyPairs(["mist", "icon3", "icon4"]));
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    const input = q("[data-testid=svg-img-per-request]") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "2");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitFor(() => txt("[data-testid=svg-img-composite]").includes("Request 1 of 2"), "two requests previewed");
    await click(q("[data-testid=svg-img-generate]")!);
    await waitFor(() => q("[data-testid=svg-img-review]") !== null, "first group review");
    expect(q("[data-testid=svg-img-stop]")).not.toBeNull();
    await click(q("[data-testid=svg-img-stop]")!);
    await click(q("[data-testid=svg-img-discard]")!);
    await waitFor(() => q("[data-testid=svg-busy]") === null, "run stopped after review");
    expect(imageCalls).toHaveLength(1);
  }, 15000);

  it("an unknown network outcome is never automatically resent, even after Retry is clicked", async () => {
    editCanvas();
    imageAnswer = async () => { throw new TypeError("connection lost"); };
    const root = manyPairs(["mist"]);
    await mountWithImages(root);
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    await waitFor(() => q("[data-testid=svg-img-composite]") !== null, "prepared reference");
    await click(q("[data-testid=svg-img-generate]")!);
    await waitFor(() => q("[data-testid=svg-img-inflight]") !== null, "unknown-outcome note");
    expect(imageCalls).toHaveLength(1);
    await act(async () => ui?.unmount());
    ui = undefined;
    resetAppStore();
    await mountWithImages(root);
    expect(q("[data-testid=svg-img-inflight]")).not.toBeNull();
    expect(imageCalls).toHaveLength(1);
    await click(q("[data-testid=svg-img-inflight-retry]")!);
    expect(q("[data-testid=svg-img-confirm]")).not.toBeNull();
    expect(imageCalls).toHaveLength(1);
  }, 15000);
});

describe("image regeneration — every pair, one truth (RC5/RC6/RC8)", () => {
  it("a pair that was never generated gets its pair file — the paid-for image is never discarded", async () => {
    await mountWithImages(makeRoot({ pairFile: null }));
    expect(metaNow()).toBeNull();
    await regenerateRow();
    await settle(200);
    const m = metaNow();
    expect(m).not.toBeNull();
    expect(m.imageVersions[0]).toMatchObject({ status: "done", file: `${REGEN}/fog_AI_v1.png` });
    expect(m.imagePreferred).toBe(1);
    expect(regenNames()).toEqual(["fog_AI_v1.png"]);
  });

  it("an SVG generation after a regen keeps the image history and vectorizes the new main", async () => {
    await mountWithImages();
    await regenerateRow();
    await settle(200);
    expect(metaNow().imagePreferred).toBe(1);
    await choose("[data-testid=svg-connection-select]", "Sol");
    await click(q(`[data-testid=svg-generate-${FOG}]`)!);
    await click(q("[data-testid=svg-confirm-generate]")!);
    await waitFor(() => (metaNow()?.versions?.length ?? 0) === 1 && svgT.calls.length === 1, "the SVG version to be saved");
    await settle(200);
    const m = metaNow();
    expect(m.imageVersions).toHaveLength(1);
    expect(m.imagePreferred).toBe(1);
    expect(sheets.at(-1)).toEqual([`${REGEN}/fog_AI_v1.png`]);
  });
});

// 2026-10-19 (archive/2026-10-19-image-regen-usage): the pair file keeps what a
// regeneration spent, and the row's usage column shows it under "Image gen."
// the same way it shows the SVG version's spend under "SVG gen.".
describe("image regeneration — tokens and cost on the row", () => {
  const usageAnswer = (cost?: number) => {
    const pngHeader = String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10);
    imageAnswer = async () => new Response(JSON.stringify({ data: [{ b64_json: btoa(pngHeader) }],
      usage: { input_tokens: 400, output_tokens: 1325, total_tokens: 1725, cost } }), { status: 200 });
  };

  it("a single regen stores the reported spend; the row shows v1 · tokens · reported under 'Image gen.'", async () => {
    usageAnswer(0.0132);
    await mountWithImages();
    expect(txt(`[data-testid=svg-usage-svg-${FOG}]`)).toContain("SVG gen.");
    expect(q(`[data-testid=svg-usage-img-${FOG}]`)).toBeNull(); // no image history yet
    await regenerateRow();
    await settle(200);
    const v = metaNow().imageVersions[0];
    expect(v.usage).toEqual({ input: 400, output: 1325, total: 1725 });
    expect(v.cost).toMatchObject({ actual: 0.0132, estimated: null, basis: "provider" });
    const cell = txt(`[data-testid=svg-usage-img-${FOG}]`);
    expect(cell).toContain("Image gen.");
    expect(cell).toContain("v1");
    expect(cell).toContain("1,725 tokens");
    expect(cell).toContain("$0.0132 reported");
    // the SVG half is still the SVG half
    expect(txt(`[data-testid=svg-usage-svg-${FOG}]`)).not.toContain("1,725");
  });

  it("the original as main shows 'original' with no usage, the history kept", async () => {
    usageAnswer(0.0132);
    await mountWithImages();
    await regenerateRow();
    await settle(200);
    await click(q(`[data-testid=svg-ai-chip-${FOG}-orig]`)!);
    await settle(150);
    const cell = txt(`[data-testid=svg-usage-img-${FOG}]`);
    expect(cell).toContain("original");
    expect(cell).not.toContain("1,725");
  });

  it("a two-pair composite stores each pair an ESTIMATED half share of the one request", async () => {
    editCanvas();
    usageAnswer(0.05);
    const root = manyPairs(["mist"]);
    const arch = root.children.get("architecture") as FakeDir;
    await mountWithImages(root);
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    await waitFor(() => q("[data-testid=svg-img-composite]") !== null, "preview ready");
    await click(q("[data-testid=svg-img-generate]")!);
    await waitFor(() => q("[data-testid=svg-img-review]") !== null, "review ready");
    await click(q("[data-testid=svg-img-apply]")!);
    await waitFor(() => q("[data-testid=svg-busy]") === null, "images committed");
    const mist = JSON.parse((arch.children.get("mist_AI.svg.json") as FakeFile).text).imageVersions[0];
    for (const v of [metaNow().imageVersions[0], mist]) {
      expect(v.usage.total).toBe(862.5);
      expect(v.cost).toMatchObject({ actual: null, estimated: 0.025, basis: "batch-split" });
    }
    expect(txt(`[data-testid=svg-usage-img-${FOG}]`)).toContain("$0.0250 Estimated");
  }, 15000);

  it("tokens but no reported cost: each pair gets its share of the rate-card cost of the one image (user report)", async () => {
    editCanvas();
    usageAnswer(); // the image endpoint reports tokens, never a cost
    const root = manyPairs(["mist"]);
    const arch = root.children.get("architecture") as FakeDir;
    await mountWithImages(root);
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    await waitFor(() => q("[data-testid=svg-img-composite]") !== null, "preview ready");
    await click(q("[data-testid=svg-img-generate]")!);
    await waitFor(() => q("[data-testid=svg-img-review]") !== null, "review ready");
    await click(q("[data-testid=svg-img-apply]")!);
    await waitFor(() => q("[data-testid=svg-busy]") === null, "images committed");
    // whole image: (400 × $8 + 1325 × $30) / 1M × 1.05 = $0.0451; each of 2 icons: $0.0225
    const mist = JSON.parse((arch.children.get("mist_AI.svg.json") as FakeFile).text).imageVersions[0];
    for (const v of [metaNow().imageVersions[0], mist]) {
      expect(v.cost.basis).toBe("rate-card");
      expect(v.cost.estimated).toBeCloseTo(0.02254875, 8);
    }
    const cell = txt(`[data-testid=svg-usage-img-${FOG}]`);
    expect(cell).toContain("$0.0225 Estimated");
    expect(cell).not.toContain("no cost reported");
  }, 15000);
});

function twoSourceRoot(): FakeDir {
  const root = makeRoot();
  const arch = root.children.get("architecture") as FakeDir;
  arch.children.set("court.png", new FakeFile("court.png"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png"));
  const own = newPairMeta({ id: pairId("architecture", "court", ""), base: "court", suffix: "", dirPath: "architecture",
    ai: { relPath: "architecture/court_AI.png", name: "court_AI.png", fingerprint: "4:1000" },
    source: { relPath: "architecture/court.png", name: "court.png", fingerprint: "4:1000" } });
  const text = serializePairMeta({ ...own, decision: "approved", reviewedAt: "2026-10-24T10:00:00.000Z" });
  arch.children.set("court_AI.svg.json", new FakeFile("court_AI.svg.json", text.length, 1000, text));
  return root;
}

describe("independent image edits during SVG generation", () => {
  it("starts an independent image edit without stopping SVG generation and keeps both histories", async () => {
    const response = deferred<Response>();
    imageAnswer = () => response.promise;
    svgT = transport({ mode: "silent" });
    await mount(twoSourceRoot());
    await click(q(`[data-testid=svg-generate-${FOG}]`)!);
    await click(q("[data-testid=svg-confirm-generate]")!);
    await waitFor(() => svgT.calls.length === 1, "SVG run to start");
    await choose("[data-testid=svg-connection-select]", "Sunburst");
    const court = pairId("architecture", "court", "");
    await click(q(`[data-testid=svg-row-image-regen-${court}]`)!);
    await click(q("[data-testid=svg-img-generate]")!);
    await waitFor(() => imageCalls.length === 1, "independent image edit to start");
    expect(txt(`[data-testid=svg-status-${FOG}]`)).toContain("Generating");
    expect(q(`[data-testid=svg-ai-running-${court}]`)).not.toBeNull();
    await act(async () => { response.resolve(okImage()); });
    await waitFor(() => q("[data-testid=svg-img-stop]") === null, "image edit to finish");
    expect(q("[data-testid=svg-cancel-run]")).not.toBeNull(); // SVG still streams
    const root = (stored.get("__svg__") as { source: FakeDir }).source;
    const arch = root.children.get("architecture") as FakeDir;
    const courtMeta = JSON.parse((arch.children.get("court_AI.svg.json") as FakeFile).text);
    expect(courtMeta.imageVersions).toHaveLength(1);
    expect(courtMeta.imagePreferred).toBe(1);
    await act(async () => { svgT.streams[0].push(streamFrames(svgT.calls[0].items)); svgT.streams[0].close(); });
    await waitFor(() => q("[data-testid=svg-cancel-run]") === null, "SVG run to finish independently");
    expect(metaNow().versions).toHaveLength(1);
    expect(JSON.parse((arch.children.get("court_AI.svg.json") as FakeFile).text).imageVersions).toHaveLength(1);
  });

  it("refuses a conflicting image send, then saves both histories after explicit re-confirmation", async () => {
    svgT = transport({ mode: "silent" });
    await mount();
    await click(q(`[data-testid=svg-generate-${FOG}]`)!);
    await click(q("[data-testid=svg-confirm-generate]")!);
    await waitFor(() => svgT.calls.length === 1, "SVG to hold its source lease");
    await choose("[data-testid=svg-connection-select]", "Sunburst");
    await regenerateRow();
    expect(imageCalls).toHaveLength(0);
    expect(txt("[data-testid=svg-toast]")).toContain("in use by another process");
    expect(q("[data-testid=svg-img-confirm]")).not.toBeNull();
    await act(async () => { svgT.streams[0].push(streamFrames(svgT.calls[0].items)); svgT.streams[0].close(); });
    await waitFor(() => q("[data-testid=svg-cancel-run]") === null, "SVG to save and release its source");
    expect(imageCalls).toHaveLength(0); // releasing a lock is not consent to retry an edit
    await click(q("[data-testid=svg-img-generate]")!);
    await waitFor(() => (metaNow()?.imageVersions?.length ?? 0) === 1, "explicit image retry to save");
    expect(metaNow().versions).toHaveLength(1);
    expect(metaNow().imageVersions).toHaveLength(1);
    expect(imageCalls).toHaveLength(1);
  });

  it("never silently swaps a confirmed SVG input while its image is being edited", async () => {
    const response = deferred<Response>();
    imageAnswer = () => response.promise;
    await mountWithImages();
    await regenerateRow();
    await waitFor(() => imageCalls.length === 1, "image edit to hold its source lease");
    await choose("[data-testid=svg-connection-select]", "Sol");
    await click(q(`[data-testid=svg-generate-${FOG}]`)!);
    await click(q("[data-testid=svg-confirm-generate]")!);
    expect(svgT.calls).toHaveLength(0);
    expect(txt("[data-testid=svg-toast]")).toContain("review the SVG inputs again");
    expect(q("[data-testid=svg-confirm]")).not.toBeNull();
    await act(async () => { response.resolve(okImage()); });
    await waitFor(() => q("[data-testid=svg-img-stop]") === null, "edited image to land");
    expect(svgT.calls).toHaveLength(0); // never auto-send a different main image
  });
});
