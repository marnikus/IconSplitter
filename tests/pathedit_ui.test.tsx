// pathedit_ui.test.tsx — the in-preview path editor in the page (2026-11-06):
// anchors drawn for the whole session, a drag edits the working copy only,
// Finish hands back the file with ONE path's d rewritten, Cancel drops it,
// Enter finishes, the list's row shortcuts never see the session's keys, a
// multi-path icon waits for a click on a path; Finish's history entry writes
// the file back on undo / redo; Edit settings sizes the anchors.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SvgPathEditor from "../src/svg/pathedit/SvgPathEditor";
import EditSettingsButton from "../src/svg/EditSettingsButton";
import { finishSvgEdit, useSvgEditBinding } from "../src/svg/svgedit";
import { EDIT_SETTINGS_KEY, forgetEditSettings, getEditSettings } from "../src/svg/editsettings";
import { loadHandles } from "../src/batch/store";
import { applyEntry } from "../src/state/apply";
import type { HistoryEntry } from "../src/lib/history";
import { FakeDir, FakeFile } from "./helpers/fakefs";

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, loadHandles: vi.fn(async () => null) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** happy-dom has no layout: one path unit = 10 screen px, no offset. */
const SCALE = 10;
const ctm = () => ({ a: SCALE, b: 0, c: 0, d: SCALE, e: 0, f: 0, inverse: () => ({ a: 1 / SCALE, b: 0, c: 0, d: 1 / SCALE, e: 0, f: 0 }) });

/** Every prototype that may carry its own getScreenCTM (happy-dom's SVG classes do). */
const protos = () => ["Element", "SVGElement", "SVGGraphicsElement", "SVGGeometryElement", "SVGPathElement", "SVGSVGElement"]
  .map((name) => (globalThis as unknown as Record<string, { prototype: object } | undefined>)[name]?.prototype)
  .filter((p): p is object => p !== undefined);
const saved = new Map<object, PropertyDescriptor | undefined>();

let host: HTMLDivElement;
let ui: Root;
beforeEach(() => {
  for (const p of protos()) { saved.set(p, Object.getOwnPropertyDescriptor(p, "getScreenCTM")); Object.defineProperty(p, "getScreenCTM", { configurable: true, writable: true, value: ctm }); }
  localStorage.removeItem(EDIT_SETTINGS_KEY);
  forgetEditSettings();
  host = document.createElement("div");
  document.body.append(host);
  ui = createRoot(host);
});
afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  for (const [p, d] of saved) { if (d === undefined) delete (p as { getScreenCTM?: unknown }).getScreenCTM; else Object.defineProperty(p, "getScreenCTM", d); }
  saved.clear();
});

const SRC = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2"><path d="M2 2L12 2L12 12"/></svg>';
const q = (sel: string) => host.querySelector(sel);
const shadow = () => (q("[data-testid=e]") as HTMLElement).shadowRoot as ShadowRoot;
const pointer = (target: EventTarget, type: string, x: number, y: number) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x * SCALE, clientY: y * SCALE, pointerId: 1 }));

async function mount(source = SRC) {
  const onFinish = vi.fn();
  const onCancel = vi.fn();
  await act(async () => { ui.render(<SvgPathEditor source={source} box={{ width: 240, height: 240 }} testid="e" label="icon" onFinish={onFinish} onCancel={onCancel} />); });
  return { onFinish, onCancel };
}

describe("the edit session", () => {
  it("draws every anchor at once and keeps Finish off until something changes", async () => {
    await mount();
    expect(shadow().querySelectorAll("[data-edit-overlay] circle")).toHaveLength(3);
    expect((q("[data-testid=e-finish]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a drag edits the working copy; Finish hands back the file with only that d rewritten", async () => {
    const { onFinish } = await mount();
    const node = q("[data-testid=e]") as HTMLElement;
    await act(async () => { pointer(node, "pointerdown", 12, 2); pointer(node, "pointermove", 14, 4); pointer(node, "pointerup", 14, 4); });
    expect(shadow().querySelector("[data-edit-path='0']")?.getAttribute("d")).toBe("M2 2L14 4L12 12");
    expect(shadow().querySelectorAll("[data-edit-overlay] circle")).toHaveLength(3); // still visible after mouse-up
    await act(async () => { (q("[data-testid=e-finish]") as HTMLButtonElement).click(); });
    expect(onFinish).toHaveBeenCalledWith(SRC.replace('d="M2 2L12 2L12 12"', 'd="M2 2L14 4L12 12"'));
  });

  it("Cancel drops the working copy; Enter finishes; row shortcuts never see the keys", async () => {
    const { onFinish, onCancel } = await mount();
    const rowKeys = vi.fn();
    window.addEventListener("keydown", rowKeys);
    const node = q("[data-testid=e]") as HTMLElement;
    await act(async () => { pointer(node, "pointerdown", 2, 2); pointer(node, "pointermove", 3, 3); pointer(node, "pointerup", 3, 3); });
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true })); });
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    window.removeEventListener("keydown", rowKeys);
    expect(rowKeys).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledTimes(1);
    await act(async () => { (q("[data-testid=e-cancel]") as HTMLButtonElement).click(); });
    expect(onCancel).toHaveBeenCalled();
  });

  it("a multi-path icon waits for a click on the path to edit", async () => {
    await mount(SRC.replace("</svg>", '<path d="M20 20L22 22"/></svg>'));
    expect(q("[data-testid=e-pick]")).not.toBeNull();
    const second = shadow().querySelector("[data-edit-path='1']") as Element;
    await act(async () => { pointer(second, "pointerdown", 20, 20); });
    expect(q("[data-testid=e-pick]")).toBeNull();
    expect(shadow().querySelectorAll("[data-edit-overlay] circle")).toHaveLength(2);
  });
});

describe("Finish edit", () => {
  function Bind({ root, push }: { root: FakeDir | null; push: (e: unknown) => void }) {
    useSvgEditBinding({ current: root as never }, { push: push as never });
    return null;
  }

  it("writes the file once and records ONE svgEdit entry with both texts; nothing without a folder", async () => {
    const root = new FakeDir("root");
    const dir = new FakeDir("a");
    root.children.set("a", dir);
    dir.children.set("a_AI.svg", new FakeFile("a_AI.svg", 10, 1, "<svg>old</svg>"));
    const push = vi.fn();
    await act(async () => { ui.render(<Bind root={root} push={push} />); });
    const args = { id: "x", svgPath: "a/a_AI.svg", label: "a SVG v1", before: "<svg>old</svg>", after: "<svg>new</svg>" };
    await expect(finishSvgEdit(args)).resolves.toBe(true);
    expect((dir.children.get("a_AI.svg") as unknown as { text: string }).text).toBe("<svg>new</svg>");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toMatchObject({ type: "svgEdit", before: { markup: "<svg>old</svg>" }, after: { markup: "<svg>new</svg>" } });
    await act(async () => { ui.render(<Bind root={null} push={push} />); });
    await expect(finishSvgEdit(args)).resolves.toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe("Finish's undo step", () => {
  it("undo writes the SVG from before the session, redo the finished one", async () => {
    const root = new FakeDir("root");
    const dir = new FakeDir("a");
    root.children.set("a", dir);
    dir.children.set("a_AI.svg", new FakeFile("a_AI.svg", 10, 1, "new"));
    vi.mocked(loadHandles).mockImplementation(async (k: string) => (k === "__svg__" ? { source: root as never } : null));
    const entry = { type: "svgEdit", label: "Edit", origin: "generateSvg", ids: ["x"],
      before: { svgPath: "a/a_AI.svg", markup: "<svg>old</svg>" }, after: { svgPath: "a/a_AI.svg", markup: "<svg>new</svg>" } } as unknown as HistoryEntry;
    const text = async () => (dir.children.get("a_AI.svg") as unknown as { text: string }).text;
    await expect(applyEntry(entry, entry.before)).resolves.toBe(true);
    expect(await text()).toBe("<svg>old</svg>");
    await expect(applyEntry(entry, entry.after)).resolves.toBe(true);
    expect(await text()).toBe("<svg>new</svg>");
    await expect(applyEntry(entry, { svgPath: "", markup: 1 })).resolves.toBe(false);
  });
});

describe("Edit settings", () => {
  it("sets the anchor size in px, clamped and remembered", async () => {
    await act(async () => { ui.render(<EditSettingsButton />); });
    await act(async () => { (q("[data-testid=svg-edit-settings]") as HTMLButtonElement).click(); });
    const field = q("[data-testid=svg-edit-anchor-px]") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, "16");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(getEditSettings().anchorPx).toBe(16);
    expect(JSON.parse(localStorage.getItem(EDIT_SETTINGS_KEY) ?? "{}").anchorPx).toBe(16);
    forgetEditSettings();
    localStorage.setItem(EDIT_SETTINGS_KEY, JSON.stringify({ anchorPx: 999 }));
    expect(getEditSettings().anchorPx).toBe(24);
  });
});

describe("wired into Generate SVG", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it("Edit beside the SVG version, Edit settings in the bar, the history knows svgEdit", () => {
    expect(src("src/svg/svgeditslot.tsx")).toContain("svg-edit-btn-${id}");
    expect(src("src/svg/SvgThumbs.tsx")).toContain("svgBarOf(");
    expect(src("src/svg/SvgBulkBar.tsx")).toContain("<EditSettingsButton");
    expect(src("src/state/apply.ts")).toContain('case "svgEdit"');
  });
});
