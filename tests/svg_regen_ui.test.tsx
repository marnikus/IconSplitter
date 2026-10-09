// svg_regen_ui.test.tsx — the "Regenerate SVG from" window in the Generate SVG
// tab (2026-10-09, moved from Export settings). The drop-down lists the SVG
// prompt presets; a missing pick is said out loud; a preset list that changes
// while the window is open is shown at once (RULE 24); the window sits above
// the main prompt window and the Export settings dialog no longer carries it.
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import RegenSettingWindow from "../src/svg/RegenSetting";
import SvgPromptZone from "../src/svg/SvgPromptZone";
import UploadSettingsDialog from "../src/upload/UploadSettingsDialog";
import { normalizeSettings } from "../src/lib/upload/settings";
import { savePresets } from "../src/svg/promptstore";
import type { PromptPreset } from "../src/lib/promptpresets";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PRESETS: PromptPreset[] = [
  { name: "Bolder", text: "Make the strokes bolder." },
  { name: "Simpler", text: "Remove one detail." },
];

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const stored = () => JSON.parse(localStorage.getItem("iconSplitter.svg.regen.v1") ?? "{}");

async function render(node: ReactElement): Promise<void> {
  await act(async () => { ui.render(node); });
}

async function choose(sel: string, value: string): Promise<void> {
  const el = q(sel) as HTMLSelectElement;
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  savePresets(PRESETS);
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
});

afterEach(async () => {
  await act(async () => ui.unmount());
  host.remove();
});

describe("RegenSetting — the choice and the SVG prompt presets", () => {
  it("starts on the main prompt + first image, with no drop-down", async () => {
    await render(<RegenSettingWindow presets={PRESETS} />);
    expect((q("[data-testid=svg-regen-mode]") as HTMLSelectElement).value).toBe("main");
    expect(q("[data-testid=svg-regen-preset]")).toBeNull();
  });

  it("current-SVG mode lists the SVG presets by name", async () => {
    await render(<RegenSettingWindow presets={PRESETS} />);
    await choose("[data-testid=svg-regen-mode]", "current-svg");
    const names = Array.from(q("[data-testid=svg-regen-preset]")?.querySelectorAll("option") ?? []).map((o) => o.textContent);
    expect(names).toEqual(expect.arrayContaining(["Bolder", "Simpler"]));
    expect(q("[data-testid=svg-regen-note]")?.textContent).toContain("pick a saved prompt");
  });

  it("picking a preset stores it at once", async () => {
    await render(<RegenSettingWindow presets={PRESETS} />);
    await choose("[data-testid=svg-regen-mode]", "current-svg");
    await choose("[data-testid=svg-regen-preset]", "Simpler");
    expect(stored()).toEqual({ v: 1, mode: "current-svg", presetName: "Simpler" });
  });

  it("a preset saved while the window is open appears in the drop-down at once", async () => {
    await render(<RegenSettingWindow presets={PRESETS} />);
    await choose("[data-testid=svg-regen-mode]", "current-svg");
    await act(async () => {
      ui.render(<RegenSettingWindow presets={[...PRESETS, { name: "Fresh", text: "New." }]} />);
    });
    const names = Array.from(q("[data-testid=svg-regen-preset]")?.querySelectorAll("option") ?? []).map((o) => o.textContent);
    expect(names).toContain("Fresh");
  });

  it("with no presets at all, says so", async () => {
    await render(<RegenSettingWindow presets={[]} />);
    await choose("[data-testid=svg-regen-mode]", "current-svg");
    expect(q("[data-testid=svg-regen-note]")?.textContent).toContain("No saved prompts yet");
  });
});

describe("the Generate SVG prompt zone", () => {
  const win = {
    testId: "svg", label: "Generation prompt", text: "Generate.", isDefault: true, presets: PRESETS, picked: "",
    onText: () => undefined, onReset: () => undefined, onPick: () => undefined,
    onQuickLoad: () => undefined, onDelete: () => undefined, onSaveAs: () => undefined,
  };

  it("shows the regen window above the main prompt window", async () => {
    await render(<SvgPromptZone win={win} />);
    const regen = q("[data-testid=svg-regen]") as HTMLElement;
    const prompt = q("[data-testid=svg-prompt]") as HTMLElement;
    expect(regen).not.toBeNull();
    expect(regen.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("gives the prompt window the same preset controls as the metadata prompt", async () => {
    await render(<SvgPromptZone win={win} />);
    for (const id of ["svg-preset-list", "svg-preset-quick-load", "svg-preset-delete", "svg-preset-name", "svg-preset-save", "svg-prompt-reset"]) {
      expect(q(`[data-testid=${id}]`), id).not.toBeNull();
    }
  });
});

describe("Export settings — the regen window moved out", () => {
  it("the global dialog no longer carries the regen row", async () => {
    await render(
      <UploadSettingsDialog scope={null} id={null} defaults={normalizeSettings(null)} overrides={{}}
        onDefaults={() => undefined} onOverride={() => undefined} onResetOverride={() => undefined} onClose={() => undefined} />,
    );
    expect(q("[data-testid=svg-regen]")).toBeNull();
    expect(q("[data-testid=upload-regen]")).toBeNull();
  });
});
