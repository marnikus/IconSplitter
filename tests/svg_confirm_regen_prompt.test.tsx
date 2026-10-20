// svg_confirm_regen_prompt.test.tsx — the prompt the confirmation sends, per
// batch (2026-10-09; one shared task picker 2026-10-20). Generation and
// regeneration are still clearly distinguished, the chosen prompt applies to the
// whole batch, the main prompt in the prompt window is never touched, and the
// full-prompt preview is exactly the text the runner builds.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toRow } from "../src/svg/rowmodel";
import SvgConfirm from "../src/svg/SvgConfirm";
import type { SvgRow } from "../src/svg/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairMetaFor, svgPathFor, svgSource, svgVersion } from "./helpers/svgpair";
import type { PromptPreset } from "../src/lib/promptpresets";
import type { ConfirmedBatch } from "../src/svg/types";
import { settle as quietSettle } from "./helpers/quiet";
import { confirmProps } from "./helpers/svgconfirm";

vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async () => ({
      dataUrl: "data:image/png;base64,xxx", hash: "h1",
      layout: { cols: 1, rows: 1, size: 512, empty: [] }, bytes: 10,
    })),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = () => quietSettle(0);

function rows(n: number): SvgRow[] {
  return Array.from({ length: n }, (_, i) => {
    const id = `pair_${i + 1}`;
    return toRow(svgSource(id, { name: `icon-${i + 1}_AI.png`, fingerprint: `${i + 1}:100` }), null, false);
  });
}

const PRESETS: PromptPreset[] = [
  { name: "Bolder", text: "Make strokes bolder." },
  { name: "Simpler", text: "Remove detail." },
];

const select = () => q("[data-testid=svg-confirm-prompt-select]") as HTMLSelectElement;
const pick = async (value: string) => {
  await act(async () => {
    select().value = value;
    select().dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  ui?.unmount();
  host.remove();
});

describe("SvgConfirm — generation vs regeneration mode distinction", () => {
  it("generation offers the main prompt AND the saved presets", async () => {
    const all = rows(2);
    await act(async () => {
      ui = createRoot(host);
      ui.render(<SvgConfirm {...confirmProps({ ids: all.map((r) => r.source.id), rows: all, presets: PRESETS })} />);
    });
    await settle();
    expect(q("[data-testid=svg-confirm-mode]")?.textContent).toContain("Generation batch now");
    const opts = Array.from(select().querySelectorAll("option")).map((o) => o.textContent);
    expect(opts[0]).toBe("Main prompt (currently loaded)");
    expect(opts).toEqual(expect.arrayContaining(["Bolder", "Simpler"]));
    expect(q("[data-testid=svg-confirm-prompt-default]")?.textContent)
      .toBe("Default prompt for this task — main prompt (currently loaded)");
  });

  it("regeneration offers the saved presets only and preselects this task's default", async () => {
    const all = rows(2);
    await act(async () => {
      ui = createRoot(host);
      ui.render(<SvgConfirm {...confirmProps({
        ids: all.map((r) => r.source.id), rows: all, operation: "regenerate", presets: PRESETS,
        taskEntries: { "svg.regenerate.batch": { choice: "preset", presetName: "Simpler" } },
      })} />);
    });
    await settle();
    expect(q("[data-testid=svg-confirm-mode]")?.textContent).toContain("Regeneration now");
    const values = Array.from(select().querySelectorAll("option")).map((o) => o.value);
    expect(values).not.toContain("main");
    expect(select().value).toBe("Simpler");
    expect(q("[data-testid=svg-confirm-prompt-default]")?.textContent).toBe("Default prompt for this task — “Simpler”");
  });

  it("applies the chosen preset to the whole batch and reports it to the caller", async () => {
    const all = rows(3);
    const onConfirm = vi.fn<(batch: ConfirmedBatch) => void>();
    await act(async () => {
      ui = createRoot(host);
      ui.render(<SvgConfirm {...confirmProps({
        ids: all.map((r) => r.source.id), rows: all, presets: PRESETS, onConfirm,
      })} />);
    });
    await settle();
    await pick("Simpler");
    await act(async () => { (q("[data-testid=svg-confirm-generate]") as HTMLButtonElement).click(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].choice).toEqual({ kind: "preset", name: "Simpler", text: "Remove detail." });
  });

  it("remembers the choice for THIS task through onTaskEntry, and only for it", async () => {
    const all = rows(3);
    const onTaskEntry = vi.fn();
    await act(async () => {
      ui = createRoot(host);
      ui.render(<SvgConfirm {...confirmProps({
        ids: all.map((r) => r.source.id), rows: all, presets: PRESETS, onTaskEntry,
      })} />);
    });
    await settle();
    await pick("Bolder");
    expect(onTaskEntry).toHaveBeenCalledWith("svg.generate.batch", { choice: "preset", presetName: "Bolder" });
    expect(onTaskEntry).not.toHaveBeenCalledWith("svg.generate.single", expect.anything());
  });

  it("regeneration with no presets says why and disables confirm", async () => {
    const all = rows(1);
    await act(async () => {
      ui = createRoot(host);
      ui.render(<SvgConfirm {...confirmProps({ ids: all.map((r) => r.source.id), rows: all, operation: "regenerate" })} />);
    });
    await settle();
    expect(q("[data-testid=svg-confirm-problem]")?.textContent?.toLowerCase()).toContain("no saved prompts");
    expect((q("[data-testid=svg-confirm-generate]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("generation confirms with the main prompt when nothing else is chosen", async () => {
    const all = rows(2);
    const onConfirm = vi.fn<(batch: ConfirmedBatch) => void>();
    await act(async () => {
      ui = createRoot(host);
      ui.render(<SvgConfirm {...confirmProps({ ids: all.map((r) => r.source.id), rows: all, presets: PRESETS, onConfirm })} />);
    });
    await settle();
    await act(async () => { (q("[data-testid=svg-confirm-generate]") as HTMLButtonElement).click(); });
    expect(onConfirm.mock.calls[0][0].choice).toEqual({ kind: "main" });
  });
});

describe("SvgConfirm — full prompt preview", () => {
  it("generation shows the manifest and the CHOSEN preset, not the main prompt", async () => {
    const all = rows(2);
    await act(async () => {
      ui = createRoot(host);
      ui.render(<SvgConfirm {...confirmProps({
        ids: all.map((r) => r.source.id), rows: all, presets: PRESETS, prompt: "the main prompt",
        taskEntries: { "svg.generate.batch": { choice: "preset", presetName: "Bolder" } },
      })} />);
    });
    await settle();
    const full = q("[data-testid=svg-confirm-full-prompt]")?.textContent ?? "";
    expect(full).toContain("Make strokes bolder.");
    expect(full).not.toContain("the main prompt");
    expect(full).toContain("1 — icon-1_AI");
    expect(full).toContain("2 — icon-2_AI");
  });

  it("regeneration shows the preset, the manifest and every carried icon's code", async () => {
    const a = svgSource("pair_1", { name: "fog_AI.png", fingerprint: "1:100" });
    const b = svgSource("pair_2", { name: "court_AI.png", fingerprint: "2:100" });
    const codeA = '<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
    const codeB = '<svg viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>';
    const root = new FakeDir("root");
    const arch = new FakeDir("architecture");
    arch.children.set("fog_AI_v1.svg", new FakeFile("fog_AI_v1.svg", codeA.length, 3200, codeA));
    arch.children.set("court_AI_v1.svg", new FakeFile("court_AI_v1.svg", codeB.length, 3200, codeB));
    root.children.set("architecture", arch);
    const list = [a, b].map((s) => toRow(s, pairMetaFor(s, [svgVersion(svgPathFor(s, 1))]), false));

    await act(async () => {
      ui = createRoot(host);
      ui.render(<SvgConfirm {...confirmProps({
        ids: list.map((r) => r.source.id), rows: list, operation: "regenerate", presets: PRESETS, root,
        taskEntries: { "svg.regenerate.batch": { choice: "preset", presetName: "Bolder" } },
      })} />);
    });
    await settle();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    await settle();
    const full = q("[data-testid=svg-confirm-full-prompt]")?.textContent ?? "";
    expect(full).toContain("Make strokes bolder.");
    expect(full).toContain("Here is a batch of 2 icons to regenerate");
    expect(full).toContain("1 — fog_AI");
    expect(full).toContain("2 — court_AI");
    expect(full).toContain(codeA);
    expect(full).toContain(codeB);
    expect(full).toContain("Each SVG's <title> must be exactly the name of its position");
  });
});
