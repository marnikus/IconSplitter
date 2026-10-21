// upload_live_preview.test.tsx — SVG to upload: "default" for every visual
// export setting, the live export preview and the ONE stroke (user request
// 2026-10-19; plan: docs/archive/2026-10-19-upload-default-settings). The bar's
// STROKE field IS the export strokePx (it replaced the preview-only override of
// archive/2026-10-19-upload-preview-stroke); every row previews the exact export
// text; the box fits the artboard's ratio inside the zoom square.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { clearKnownRoots } from "../src/lib/knownroots";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../src/lib/upload/settings";
import { ZOOM_DEFAULT } from "../src/lib/zoom";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import UploadPanel from "../src/upload/UploadPanel";
import { loadUploadSettings, saveUploadSettings } from "../src/upload/settingsstore";
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
const SAVED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="none" stroke="#000" stroke-width="1"/></svg>`;
const AS_IS: Partial<UploadSettings> = { paddingPct: null, background: "default", strokePx: 0, strokeColor: "artwork", artboard: { mode: "source", size: 512, width: 512, height: 512 } };

let host: HTMLDivElement;
let ui: Root | null = null;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = (ms = 0) => quietSettle(ms);
const preview = () => q(`[data-testid=upload-prev-${FOG}]`)!;
const art = () => preview().shadowRoot!.innerHTML;
const frame = () => q(`[data-testid=upload-prev-${FOG}-frame]`)!;

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

async function mount(defaults: Partial<UploadSettings> = {}): Promise<void> {
  saveUploadSettings({ defaults: { ...DEFAULT_UPLOAD_SETTINGS, ...defaults }, overrides: {} });
  stored.set("__upload__", { source: makeRoot() });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><UploadPanel /></HistoryProvider>);
  });
  await waitUntil(() => q(`[data-testid=upload-prev-${FOG}]`)?.shadowRoot != null, "the row preview", 8000);
  await settle(250); // past the preview debounce
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
  await settle(250);
}

async function click(sel: string): Promise<void> {
  await act(async () => { q(sel)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle(250);
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
});

describe("the bar's STROKE is the export stroke width", () => {
  it("typing a width writes the defaults' strokePx and the live preview shows it in the export", async () => {
    await mount();
    expect((q("[data-testid=upload-stroke]") as HTMLInputElement).value).toBe("");
    expect(art()).not.toContain('stroke-width="3"');
    await type("[data-testid=upload-stroke]", "3");
    expect(loadUploadSettings().defaults.strokePx).toBe(3);
    expect(art()).toContain('stroke-width="3"');
    await type("[data-testid=upload-stroke]", "45"); // the bar's 0–50 range is the export range
    expect(loadUploadSettings().defaults.strokePx).toBe(45);
    await click("[data-testid=upload-stroke-reset]");
    expect(loadUploadSettings().defaults.strokePx).toBe(0);
  });

  it("the settings dialog has no stroke-width row any more", async () => {
    await mount();
    await click("[data-testid=upload-settings-open]");
    expect(q("[data-testid=upload-dialog-backdrop]")).not.toBeNull();
    expect(q("[data-testid=upload-set-stroke]")).toBeNull();
  });
});

describe("default for every visual setting", () => {
  it("the dialog offers Default on padding, background, stroke colour and artboard", async () => {
    await mount();
    await click("[data-testid=upload-settings-open]");
    expect(q("[data-testid=upload-set-padding-default]")).not.toBeNull();
    expect(q("[data-testid=upload-set-bg-default]")).not.toBeNull();
    expect(q("[data-testid=upload-set-stroke-color-artwork]")?.textContent).toBe("Default");
    const options = [...(q("[data-testid=upload-set-artboard]") as HTMLSelectElement).options].map((o) => o.value);
    expect(options[0]).toBe("source");
  });

  it("All default: the row previews the approved SVG itself and says 'as is'", async () => {
    await mount();
    expect(art()).toContain("<rect"); // the factory defaults add the artboard object
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-as-is]");
    expect(loadUploadSettings().defaults).toMatchObject(AS_IS);
    expect(art()).not.toContain("<rect");
    expect(q(`[data-testid=upload-settings-${FOG}]`)?.textContent).toContain("as is");
  });

  it("padding Default does not activate when blank space in its setting is clicked", async () => {
    await mount();
    await click("[data-testid=upload-settings-open]");
    const button = q("[data-testid=upload-set-padding-default]")!;
    const field = button.closest(".up-set-field") as HTMLElement;
    await act(async () => { field.click(); }); // outside the button's own bounds
    await settle(250);
    expect(loadUploadSettings().defaults.paddingPct).toBe(8);
    await act(async () => { (field.querySelector(".svg-label") as HTMLLabelElement).click(); });
    expect(loadUploadSettings().defaults.paddingPct).toBe(8);
    expect(button.closest("label")).toBeNull(); // labels activate nested buttons from empty space
    await click("[data-testid=upload-set-padding-default]");
    expect(loadUploadSettings().defaults.paddingPct).toBeNull();
  });

  it("padding Default toggles null and back to a number", async () => {
    await mount();
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-padding-default]");
    expect(loadUploadSettings().defaults.paddingPct).toBeNull();
    expect((q("[data-testid=upload-set-padding]") as HTMLInputElement).value).toBe("");
    await click("[data-testid=upload-set-padding-default]");
    expect(loadUploadSettings().defaults.paddingPct).toBe(8);
  });
});

describe("per-icon shadow controls and exact live preview", () => {
  it("updates one icon's gradient cleanly with built-in EPS without partial warnings", async () => {
    await mount();
    expect(art()).not.toContain("radialGradient");
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    await click("[data-testid=upload-set-shadow]");
    await waitUntil(() => art().includes("radialGradient"), "shadow in the row preview", 8000);
    expect(loadUploadSettings().overrides[FOG].shadowEnabled).toBe(true);
    expect(q("[data-testid=upload-set-marker-shadow]")?.textContent).toBe("overridden");
    await type("[data-testid=upload-set-shadow-width]", "130");
    await blur("[data-testid=upload-set-shadow-width]");
    await type("[data-testid=upload-set-shadow-gap]", "10");
    await blur("[data-testid=upload-set-shadow-gap]");
    expect(loadUploadSettings().overrides[FOG]).toMatchObject({ shadowEnabled: true, shadowWidthPct: 130, shadowGapPct: 10 });
    expect(q(`[data-testid=upload-settings-${FOG}]`)?.textContent).toContain("shadow 130% · gap 10%");
    await click("[data-testid=upload-set-eps]");
    expect(q("[data-testid=upload-shadow-eps-note]")).toBeNull();
    expect(q(`[data-testid=upload-shadow-eps-${FOG}]`)).toBeNull();
    await click("[data-testid=upload-set-as-is]");
    expect(loadUploadSettings().overrides[FOG].shadowEnabled).toBe(false);
    expect(art()).not.toContain("radialGradient");
  });
});

describe("per-icon corner badge in the live export preview", () => {
  it("updates the same vector preview when the badge is enabled, resized and reset", async () => {
    await mount();
    expect(preview().shadowRoot?.querySelectorAll("path")).toHaveLength(1);
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    await click("[data-testid=upload-set-badge]");
    await waitUntil(() => (preview().shadowRoot?.querySelectorAll("path").length ?? 0) >= 8,
      "the artboard badge in the row preview", 8000);
    const first = art();
    await type("[data-testid=upload-set-badge-width]", "60");
    await blur("[data-testid=upload-set-badge-width]");
    await waitUntil(() => art() !== first, "the resized badge in the preview", 8000);
    expect(loadUploadSettings().overrides[FOG]).toMatchObject({ badgeEnabled: true, badgeWidthPct: 60 });
    await click("[data-testid=upload-set-as-is]");
    expect(loadUploadSettings().overrides[FOG]?.badgeEnabled).toBe(false);
    await waitUntil(() => preview().shadowRoot?.querySelectorAll("path").length === 1,
      "the source preview without a badge", 8000);
  });
});

describe("the preview box: the artboard's ratio inside the zoom square", () => {
  it("a 2:1 artboard draws full zoom width and half height", async () => {
    await mount({ artboard: { mode: "custom", size: 512, width: 200, height: 100 } });
    expect([frame().style.width, frame().style.height]).toEqual([`${ZOOM_DEFAULT}px`, `${ZOOM_DEFAULT / 2}px`]);
  });

  it("16 px and 2048 px artboards draw the same box — no tiny or giant thumbnails", async () => {
    await mount({ artboard: { mode: "custom", size: 512, width: 16, height: 16 } });
    const small = [frame().style.width, frame().style.height];
    await unmount();
    await mount({ artboard: { mode: "preset", size: 2048, width: 512, height: 512 } });
    expect([frame().style.width, frame().style.height]).toEqual(small);
    expect(small).toEqual([`${ZOOM_DEFAULT}px`, `${ZOOM_DEFAULT}px`]);
  });
});

describe("a stroke colour the background hides", () => {
  it("the row preview and the dialog both say the icon will be invisible", async () => {
    await mount({ background: "#000000", strokeColor: "#000000" });
    expect(q(`[data-testid=upload-prev-${FOG}-note]`)?.textContent).toMatch(/invisible/);
    await click("[data-testid=upload-settings-open]");
    expect(q("[data-testid=upload-set-paint-clash]")?.textContent).toMatch(/invisible/);
    await click("[data-testid=upload-set-bg-default]");
    expect(q("[data-testid=upload-set-paint-clash]")).toBeNull();
    expect(q(`[data-testid=upload-prev-${FOG}-note]`)).toBeNull();
  });
});

async function blur(sel: string): Promise<void> {
  await act(async () => { q(sel)!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); }); // React's onBlur
  await settle(250);
}

describe("one icon may pin its own stroke width (2026-10-19 follow-up)", () => {
  it("the icon's dialog writes an override the row previews; the bar still drives the rest; inherit drops it", async () => {
    await mount({ strokePx: 2 });
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    const field = () => q("[data-testid=upload-set-stroke]") as HTMLInputElement;
    expect(field().value).toBe("");
    expect(field().placeholder).toContain("2");
    await type("[data-testid=upload-set-stroke]", "7");
    expect(loadUploadSettings().overrides[FOG]?.strokePx).toBeUndefined(); // not until the field is left
    await blur("[data-testid=upload-set-stroke]");
    expect(loadUploadSettings().overrides[FOG]?.strokePx).toBe(7);
    expect(loadUploadSettings().defaults.strokePx).toBe(2);
    expect(art()).toContain('stroke-width="7"');
    await click("[data-testid=upload-set-stroke-inherit]");
    expect(loadUploadSettings().overrides[FOG]?.strokePx).toBeUndefined();
  });

  it("does not clear an icon's stroke pin from blank space around its Bar button", async () => {
    await mount({ strokePx: 2 });
    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    await type("[data-testid=upload-set-stroke]", "7");
    await blur("[data-testid=upload-set-stroke]");
    const button = q("[data-testid=upload-set-stroke-inherit]")!;
    const field = button.closest(".up-set-field") as HTMLElement;
    await act(async () => { field.click(); });
    await settle(250);
    expect(loadUploadSettings().overrides[FOG]?.strokePx).toBe(7);
    expect(button.closest("label")).toBeNull();
    await click("[data-testid=upload-set-stroke-inherit]");
    expect(loadUploadSettings().overrides[FOG]?.strokePx).toBeUndefined();
  });
});

describe("the custom artboard size is checked when the field is left, not per keystroke", () => {
  it("typing '1' on the way to '1600' is not clamped or written; leaving the field commits the clamped value", async () => {
    await mount({ artboard: { mode: "custom", size: 512, width: 512, height: 512 } });
    await click("[data-testid=upload-settings-open]");
    const w = () => q("[data-testid=upload-set-artboard-w]") as HTMLInputElement;
    await type("[data-testid=upload-set-artboard-w]", "1");
    expect(w().value).toBe("1");
    expect(loadUploadSettings().defaults.artboard.width).toBe(512);
    await type("[data-testid=upload-set-artboard-w]", "1600");
    await blur("[data-testid=upload-set-artboard-w]");
    expect(loadUploadSettings().defaults.artboard.width).toBe(1600);
    await type("[data-testid=upload-set-artboard-w]", "3");
    await blur("[data-testid=upload-set-artboard-w]");
    expect(loadUploadSettings().defaults.artboard.width).toBeGreaterThan(3); // clamped to the minimum on leave
    expect(w().value).toBe(String(loadUploadSettings().defaults.artboard.width));
  });
});
