// regen_ui.test.tsx — the two surfaces of "regenerate from current SVG" drive
// the real components (RULE 8): the Export-settings section that edits the
// option (D2/D3) and the confirmation that states the mode and the solo split
// before anything is sent (D7). Nothing here renders a fake of either.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgconfig";
import { capsFor, type SamplingParams } from "../src/lib/modelcaps";
import { loadPresets, savePresets } from "../src/upload/promptstore";
import { loadRegenSettings, REGEN_KEY, saveRegenSettings } from "../src/svg/regenstore";
import UploadRegenSettings from "../src/upload/UploadRegenSettings";
import SvgConfirm from "../src/svg/SvgConfirm";
import type { SvgRow } from "../src/svg/types";
import type { PairMeta } from "../src/lib/pairmeta";
import { pairMetaFor, svgPathFor, svgSource, svgVersion } from "./helpers/svgpair";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PARAMS: SamplingParams = { temperature: null, maxTokens: 8_000, effort: "low" };

let host: HTMLDivElement;
let ui: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  savePresets([{ name: "Stock strict", text: "Keep the stroke weight even." }, { name: "Soft rounds", text: "Round every corner." }]);
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  if (ui !== null) await act(async () => { ui?.unmount(); });
  ui = null;
  host.remove();
});

async function mount(node: ReactNode): Promise<void> {
  await act(async () => {
    ui = createRoot(host);
    ui.render(node);
  });
}

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const text = (sel: string) => q(sel)?.textContent ?? "";

function mkRow(id: string, withVersion: boolean): SvgRow {
  const source = svgSource(id, { name: `${id}_AI.png` });
  const meta: PairMeta | null = withVersion ? pairMetaFor(source, [svgVersion(svgPathFor(source, 1))]) : null;
  return {
    source, meta, corrupt: false, newest: null, preferred: null, approved: null,
    status: withVersion ? "generated" : "not-generated", error: null, running: false, queued: false,
  };
}

describe("the Export settings section (D2/D3)", () => {
  it("offers the option off by default and lists the saved prompt presets by name", async () => {
    await mount(<UploadRegenSettings />);
    const box = q("[data-testid=regen-from-svg]") as HTMLInputElement;
    expect(box.checked).toBe(false);
    const list = q("[data-testid=regen-preset]") as HTMLSelectElement;
    expect([...list.options].map((o) => o.value)).toEqual(["", "Stock strict", "Soft rounds"]);
    expect(q("[data-testid=regen-preset-note]")).toBeNull();
  });

  it("persists the toggle and the chosen preset to the regen store", async () => {
    await mount(<UploadRegenSettings />);
    await act(async () => {
      (q("[data-testid=regen-from-svg]") as HTMLInputElement).click();
    });
    await act(async () => {
      const list = q("[data-testid=regen-preset]") as HTMLSelectElement;
      list.value = "Soft rounds";
      list.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(loadRegenSettings()).toEqual({ enabled: true, preset: "Soft rounds" });
    expect(localStorage.getItem(REGEN_KEY)).toContain("Soft rounds");
  });

  it("with no saved presets it says so and the option cannot arm a regeneration", async () => {
    savePresets([]);
    await mount(<UploadRegenSettings />);
    expect(loadPresets()).toEqual([]);
    const list = q("[data-testid=regen-preset]") as HTMLSelectElement;
    expect(list.disabled).toBe(true);
    expect(text("[data-testid=regen-preset-note]")).toContain("no saved prompt presets");
  });
});

describe("the confirmation states the mode (D7)", () => {
  const confirm = (rows: SvgRow[]) => (
    <SvgConfirm ids={rows.map((r) => r.source.id)} rows={rows} config={{ ...DEFAULT_CONFIG, imagesPerRequest: 4 }}
      caps={capsFor(DEFAULT_CONFIG.model)} params={PARAMS} rootRef={{ current: null }} running={false}
      onConfirm={() => undefined} onDismiss={() => undefined} />
  );

  it("names how many icons regenerate and with which preset, and shows the solo split", async () => {
    saveRegenSettings({ enabled: true, preset: "Stock strict" });
    const rows = [mkRow("pair_1", true), mkRow("pair_2", false)];
    await mount(confirm(rows));
    const fact = text("[data-testid=svg-confirm-regen]");
    expect(fact).toContain("1");
    expect(fact).toContain("Stock strict");
    // one solo re-generation + one fresh icon = two requests at the user's size
    expect(text("[data-testid=svg-confirm-requests]")).toContain("2");
  });

  it("says nothing about the mode when the option is off", async () => {
    const rows = [mkRow("pair_1", true), mkRow("pair_2", false)];
    await mount(confirm(rows));
    expect(q("[data-testid=svg-confirm-regen]")).toBeNull();
    expect(text("[data-testid=svg-confirm-requests]")).toContain("1");
  });

  it("enabled but every icon is brand new: no regeneration, no fact", async () => {
    saveRegenSettings({ enabled: true, preset: "Stock strict" });
    await mount(confirm([mkRow("pair_2", false)]));
    expect(q("[data-testid=svg-confirm-regen]")).toBeNull();
  });
});
