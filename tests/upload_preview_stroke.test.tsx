// upload_preview_stroke.test.tsx — the Generate SVG tab's preview stroke width,
// reused on "SVG to upload" (user request 2026-10-19; plan:
// docs/archive/2026-10-19-upload-preview-stroke). Same control, same rule
// (lib/previewstroke), but the tab's OWN shared sheet: both tabs stay mounted,
// so one tab's width must never repaint the other's thumbnails.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { clearKnownRoots } from "../src/lib/knownroots";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { createStrokeSheet, SVG_STROKE_SHEET, UPLOAD_STROKE_SHEET } from "../src/svg/strokesheet";
import UploadPanel from "../src/upload/UploadPanel";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { settle as quietSettle, waitUntil } from "./helpers/quiet";
import { svgVersion } from "./helpers/svgpair";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

const DIR = "architecture";
const FOG = pairId(DIR, "fog", "");
const SAVED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" stroke="#000" stroke-width="1"/></svg>`;

let host: HTMLDivElement;
let ui: Root | null = null;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = () => quietSettle(0);
const field = () => q("[data-testid=upload-stroke]") as HTMLInputElement;
const reset = () => q("[data-testid=upload-stroke-reset]") as HTMLButtonElement;
const preview = () => q(`[data-testid=upload-prev-${FOG}]`)!;

/** fog approved with a valid v1. */
function makeRoot(): BinDir {
  const root = new BinDir("split_root");
  const dir = new BinDir(DIR);
  const meta = pairFile(DIR, "fog_AI.png", { id: FOG, versions: [svgVersion(`${DIR}/fog_AI.svg`, { version: 1, review: "approved" })] });
  dir.children.set("fog_AI.png", new BinFile("fog_AI.png", "ai", 3100));
  dir.children.set("fog_AI.svg", new BinFile("fog_AI.svg", SAVED_SVG, 3400));
  dir.children.set("fog_AI.svg.json", new BinFile("fog_AI.svg.json", serializePairMeta(meta), 3300));
  root.children.set(DIR, dir);
  return root;
}

async function mount(root: BinDir): Promise<void> {
  stored.set("__upload__", { source: root });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><UploadPanel /></HistoryProvider>);
  });
  await waitUntil(() => q(`[data-testid=upload-prev-${FOG}]`)?.shadowRoot != null, "the row preview", 8000);
  await settle();
}

async function unmount(): Promise<void> {
  const r = ui;
  ui = null;
  if (r !== null) await act(async () => r.unmount());
}

async function type(sel: string, value: string): Promise<void> {
  await act(async () => {
    const el = q(sel) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}

/** The CSS a shadow root's adopted sheets carry, whitespace-normalized. */
function adopted(el: Element): string {
  const root = el.shadowRoot as (ShadowRoot & { adoptedStyleSheets?: CSSStyleSheet[] }) | null;
  return (root?.adoptedStyleSheets ?? []).map((s) => [...s.cssRules].map((r) => r.cssText).join(" ")).join(" ").replace(/\s+/g, " ");
}

function savedText(root: BinDir): string {
  return ((root.children.get(DIR) as BinDir).children.get("fog_AI.svg") as BinFile).text;
}

beforeEach(() => {
  localStorage.clear();
  stored.clear();
  clearKnownRoots();
  resetAppStore();
  (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker = () => Promise.reject(new Error("no picker"));
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  await unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe("preview stroke on SVG to upload", () => {
  it("the control sits in the Upload bulk bar, at default, Reset disabled", async () => {
    await mount(makeRoot());
    expect(q("[data-testid=upload-bulk]")!.querySelector("[data-testid=upload-stroke]")).not.toBeNull();
    expect(field().value).toBe("");
    expect(field().placeholder).toBe("default");
    expect(q("[data-testid=upload-stroke-value]")?.textContent).toBe("default");
    expect(reset().disabled).toBe(true);
    expect(adopted(preview())).not.toContain("stroke-width");
  });

  it("a width restyles the row preview through the tab's sheet; artwork and file untouched", async () => {
    const root = makeRoot();
    await mount(root);
    const before = preview().shadowRoot!.innerHTML;
    await type("[data-testid=upload-stroke]", "5");
    expect(adopted(preview())).toMatch(/stroke-width: 5px !important/);
    expect(adopted(preview())).toMatch(/vector-effect: non-scaling-stroke !important/);
    expect(preview().shadowRoot!.innerHTML).toBe(before);
    expect(savedText(root)).toBe(SAVED_SVG);
    expect(q("[data-testid=upload-stroke-value]")?.textContent).toBe("5 px");
  });

  it("Reset and the word 'default' bring back the file's own widths", async () => {
    await mount(makeRoot());
    await type("[data-testid=upload-stroke]", "5");
    await click(reset());
    expect(adopted(preview())).not.toContain("stroke-width");
    expect(field().value).toBe("");
    await type("[data-testid=upload-stroke]", "3");
    await type("[data-testid=upload-stroke]", "default");
    expect(adopted(preview())).not.toContain("stroke-width");
  });

  it("the width is remembered across a restart", async () => {
    await mount(makeRoot());
    await type("[data-testid=upload-stroke]", "7.5");
    await unmount();
    await mount(makeRoot());
    expect(field().value).toBe("7.5");
    expect(adopted(preview())).toMatch(/stroke-width: 7.5px !important/);
  });

  it("the Upload width never reaches the Generate SVG tab's sheet", async () => {
    await mount(makeRoot());
    await type("[data-testid=upload-stroke]", "5");
    const css = (s: { sheet: () => CSSStyleSheet | null }) => [...(s.sheet()?.cssRules ?? [])].map((r) => r.cssText).join(" ");
    expect(css(UPLOAD_STROKE_SHEET)).toContain("5px");
    expect(css(SVG_STROKE_SHEET)).not.toContain("stroke-width");
  });
});

describe("createStrokeSheet", () => {
  it("each instance is its own sheet; adopting is idempotent", () => {
    const a = createStrokeSheet();
    const b = createStrokeSheet();
    a.apply(2);
    const root = document.createElement("div").attachShadow({ mode: "open" }) as ShadowRoot & { adoptedStyleSheets: CSSStyleSheet[] };
    a.adopt(root);
    a.adopt(root);
    expect(root.adoptedStyleSheets).toHaveLength(1);
    expect([...(b.sheet()?.cssRules ?? [])]).toHaveLength(0);
    expect([...(a.sheet()?.cssRules ?? [])].map((r) => r.cssText).join(" ")).toContain("2px");
  });
});
