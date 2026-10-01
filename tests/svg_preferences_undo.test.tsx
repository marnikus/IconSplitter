import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PROMPT, DEFAULT_SVG_PREFERENCES } from "../src/svg/prefs";
import { useSvgPreferences } from "../src/svg/ui/useSvgPreferences";
import { HistoryProvider, useHistory } from "../src/state/HistoryProvider";
import { getSvgPreferences, reloadSvgPreferences, SVG_PREFS_KEY } from "../src/svg/prefsstore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let ui: Root;

function Harness() {
  const settings = useSvgPreferences();
  const history = useHistory();
  return <div>
    <textarea aria-label="prompt" value={settings.prefs.prompt} onChange={(event) => settings.edit({ prompt: event.target.value }, "Edit SVG prompt", true)} />
    <input aria-label="search" value={settings.prefs.search} onChange={(event) => settings.edit({ search: event.target.value }, "Search SVG sources", true)} />
    <select aria-label="generation" value={settings.prefs.generationFilter}
      onChange={(event) => settings.edit({ generationFilter: event.target.value as typeof settings.prefs.generationFilter }, "Filter SVG state")}>
      <option value="all">All</option><option value="failed">Failed</option>
    </select>
    <input type="range" aria-label="zoom" min="48" max="180" step="4" value={settings.prefs.thumbHeight}
      onChange={(event) => settings.edit({ thumbHeight: Number(event.target.value) }, "SVG thumbnail zoom", true)} />
    <button data-testid="undo" disabled={!history.canUndo} onClick={history.undo}>Undo</button>
    <button data-testid="redo" disabled={!history.canRedo} onClick={history.redo}>Redo</button>
    <output data-testid="index">{history.index}</output>
  </div>;
}

function mount(): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => ui.render(<HistoryProvider><Harness /></HistoryProvider>));
}

async function edit(selector: string, value: string): Promise<void> {
  await act(async () => {
    const control = host.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value")?.set;
    setter?.call(control, value);
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function hotkeyUndo(target: Window | HTMLElement = window): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => { localStorage.clear(); reloadSvgPreferences(); mount(); });
afterEach(() => { act(() => ui.unmount()); host.remove(); });

const value = (selector: string) => (host.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;

describe("Generate SVG undoable preferences", () => {
  it("undoes and redoes prompt, search and filters through the single persisted global timeline", async () => {
    expect(value("textarea")).toBe(DEFAULT_PROMPT);
    await edit("textarea", "New careful geometry prompt");
    expect(value("textarea")).toBe("New careful geometry prompt");
    await hotkeyUndo();
    expect(value("textarea")).toBe(DEFAULT_PROMPT);
    await act(async () => { (host.querySelector("[data-testid='redo']") as HTMLButtonElement).click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(value("textarea")).toBe("New careful geometry prompt");

    await edit("input[aria-label='search']", "folder/leaf");
    expect(value("input[aria-label='search']")).toBe("folder/leaf");
    await hotkeyUndo();
    expect(value("input[aria-label='search']")).toBe("");

    await edit("select[aria-label='generation']", "failed");
    expect(value("select[aria-label='generation']")).toBe("failed");
    await hotkeyUndo();
    expect(value("select[aria-label='generation']")).toBe("all");
    expect(getSvgPreferences().generationFilter).toBe("all");
  });

  it("blocks key-like prompt text before it can reach preferences or global history", async () => {
    await edit("textarea", "rq_live_abcdefghijklmnopqrstuvwxyz");
    expect(value("textarea")).toBe(DEFAULT_PROMPT);
    expect(String(localStorage.getItem(SVG_PREFS_KEY))).not.toContain("rq_live_abcdefghijklmnopqrstuvwxyz");
    expect(String(localStorage.getItem("iconSplitter.history.v1"))).not.toContain("rq_live_abcdefghijklmnopqrstuvwxyz");
  });

  it("keeps slider gestures undoable after focus lands on a range control", async () => {
    await edit("input[aria-label='zoom']", "104");
    expect(value("input[aria-label='zoom']")).toBe("104");
    expect(getSvgPreferences().thumbHeight).toBe(104);
    const slider = host.querySelector("input[aria-label='zoom']") as HTMLInputElement;
    slider.focus();
    await hotkeyUndo(slider);
    expect(value("input[aria-label='zoom']")).toBe(String(DEFAULT_SVG_PREFERENCES.thumbHeight));
    expect(getSvgPreferences().thumbHeight).toBe(DEFAULT_SVG_PREFERENCES.thumbHeight);
  });
});
