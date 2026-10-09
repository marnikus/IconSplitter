// upload_regen_ui.test.tsx — the "Regenerate SVG from" row of the export
// settings dialog (2026-10-09). The real row over localStorage: the choice and
// the saved prompt are written at the moment of the change (RULE 24), the
// drop-down lists the saved prompt presets by name, a missing pick is said
// out loud, and the row exists in the global scope only (an icon's override
// cannot change how every regeneration is asked).
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import UploadRegenSetting from "../src/upload/UploadRegenSetting";
import UploadSettingsDialog from "../src/upload/UploadSettingsDialog";
import { normalizeSettings } from "../src/lib/upload/settings";
import { savePresets } from "../src/upload/promptstore";
import type { PromptPreset } from "../src/lib/upload/promptpresets";

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

/** A change event the way React sees a user choosing an option. */
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

describe("UploadRegenSetting — the choice and the saved prompt", () => {
  it("starts on the main prompt + first image, with no saved-prompt drop-down", async () => {
    await render(<UploadRegenSetting />);
    expect((q("[data-testid=upload-regen-mode]") as HTMLSelectElement).value).toBe("main");
    expect(q("[data-testid=upload-regen-preset]")).toBeNull();
  });

  it("choosing the current-SVG mode shows the saved prompts by name and asks for one", async () => {
    await render(<UploadRegenSetting />);
    await choose("[data-testid=upload-regen-mode]", "current-svg");
    const names = Array.from(q("[data-testid=upload-regen-preset]")?.querySelectorAll("option") ?? []).map((o) => o.textContent);
    expect(names).toEqual(expect.arrayContaining(["Bolder", "Simpler"]));
    expect(q("[data-testid=upload-regen-note]")?.textContent).toContain("pick a saved prompt");
    expect(stored().mode).toBe("current-svg");
  });

  it("picking a saved prompt stores it at once and the note confirms it", async () => {
    await render(<UploadRegenSetting />);
    await choose("[data-testid=upload-regen-mode]", "current-svg");
    await choose("[data-testid=upload-regen-preset]", "Simpler");
    expect(stored()).toEqual({ v: 1, mode: "current-svg", presetName: "Simpler" });
    expect(q("[data-testid=upload-regen-note]")?.textContent).toContain("Simpler");
  });

  it("with no saved prompts at all, says so instead of offering an empty list", async () => {
    savePresets([]);
    await render(<UploadRegenSetting />);
    await choose("[data-testid=upload-regen-mode]", "current-svg");
    expect(q("[data-testid=upload-regen-note]")?.textContent).toContain("No saved prompts yet");
  });

  it("going back to the main prompt keeps the picked name for next time", async () => {
    await render(<UploadRegenSetting />);
    await choose("[data-testid=upload-regen-mode]", "current-svg");
    await choose("[data-testid=upload-regen-preset]", "Bolder");
    await choose("[data-testid=upload-regen-mode]", "main");
    expect(stored()).toEqual({ v: 1, mode: "main", presetName: "Bolder" });
  });
});

describe("UploadSettingsDialog — the row lives in the global scope only", () => {
  const dialog = (id: string | null) => (
    <UploadSettingsDialog
      scope={id === null ? null : "icon-1_AI.svg"} id={id} defaults={normalizeSettings(null)} overrides={{}}
      onDefaults={() => undefined} onOverride={() => undefined} onResetOverride={() => undefined} onClose={() => undefined}
    />
  );

  it("shows the row for the global defaults", async () => {
    await render(dialog(null));
    expect(q("[data-testid=upload-regen]")).not.toBeNull();
  });

  it("does not show it for one icon's override", async () => {
    await render(dialog("pair-1"));
    expect(q("[data-testid=upload-regen]")).toBeNull();
  });
});
