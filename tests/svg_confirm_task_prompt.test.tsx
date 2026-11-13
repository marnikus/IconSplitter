// svg_confirm_task_prompt.test.tsx — the six prompt tasks in the popup
// (2026-10-20). The message ABOVE the picker names the default of the task in
// force; the Single/Batch tabs let the other shape's default be inspected and
// changed without touching this batch; a stored preset that no longer exists is
// named, and the main prompt chosen in a popup never rewrites the prompt window.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toRow } from "../src/svg/rowmodel";
import SvgConfirm from "../src/svg/SvgConfirm";
import type { ConfirmedBatch, SvgRow } from "../src/svg/types";
import type { PromptPreset } from "../src/lib/promptpresets";
import type { TaskPromptMap } from "../src/lib/prompttasks";
import { settle as quietSettle } from "./helpers/quiet";
import { confirmProps } from "./helpers/svgconfirm";
import { svgSource } from "./helpers/svgpair";

vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async () => ({
      dataUrl: "data:image/png;base64,xxx", hash: "h",
      layout: { cols: 1, rows: 1, size: 512, empty: [] }, bytes: 10,
    })),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PRESETS: PromptPreset[] = [
  { name: "Bolder", text: "Make strokes bolder." },
  { name: "Simpler", text: "Remove detail." },
];

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = () => quietSettle(0);

function rows(n: number): SvgRow[] {
  return Array.from({ length: n }, (_, i) => toRow(svgSource(`pair_${i + 1}`, { name: `icon-${i + 1}_AI.png` }), null, false));
}

async function mount(o: { n: number; entries?: Partial<TaskPromptMap>; operation?: "generate" | "regenerate"; onTaskEntry?: (t: string, e: unknown) => void; onConfirm?: (b: ConfirmedBatch) => void }) {
  const all = rows(o.n);
  await act(async () => {
    ui = createRoot(host);
    ui.render(<SvgConfirm {...confirmProps({
      ids: all.map((r) => r.source.id), rows: all, presets: PRESETS, operation: o.operation ?? "generate",
      taskEntries: o.entries, onTaskEntry: o.onTaskEntry as never, onConfirm: o.onConfirm,
    })} />);
  });
  await settle();
}

const note = () => q("[data-testid=svg-confirm-prompt-default]")?.textContent ?? "";
const select = () => q("[data-testid=svg-confirm-prompt-select]") as HTMLSelectElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  ui?.unmount();
  host.remove();
});

describe("the task in force", () => {
  it("one icon is the single task, several are the batch task", async () => {
    await mount({ n: 1 });
    expect(q("[data-testid=svg-confirm-task]")?.textContent).toBe("Generate SVG · single icon");
    ui.unmount();
    await mount({ n: 4 });
    expect(q("[data-testid=svg-confirm-task]")?.textContent).toBe("Generate SVG · batch");
  });

  it("shows the main prompt default, then a preset default, for the batch task", async () => {
    await mount({ n: 4 });
    expect(note()).toBe("Default prompt for this task — main prompt (currently loaded)");
    ui.unmount();
    await mount({ n: 4, entries: { "svg.generate.batch": { choice: "preset", presetName: "Bolder" } } });
    expect(note()).toBe("Default prompt for this task — “Bolder”");
    expect(select().value).toBe("Bolder");
  });

  it("single and batch remember separately: the selection alone decides the task", async () => {
    const both = {
      "svg.generate.single": { choice: "preset", presetName: "Simpler" },
      "svg.generate.batch": { choice: "preset", presetName: "Bolder" },
    } as const;
    await mount({ n: 4, entries: both });
    expect(note()).toBe("Default prompt for this task — “Bolder”");
    expect(select().value).toBe("Bolder");
    ui.unmount();
    await mount({ n: 1, entries: both });
    expect(note()).toBe("Default prompt for this task — “Simpler”");
    expect(select().value).toBe("Simpler");
    // no tabs anywhere: the shape is detected, never chosen
    expect(q("[data-testid=svg-confirm-prompt-tabs]")).toBeNull();
    expect(q("[data-testid=svg-confirm-prompt-single]")).toBeNull();
    expect(q("[data-testid=svg-confirm-prompt-batch]")).toBeNull();
  });

  it("a preset default that is gone is named and falls back to the main prompt", async () => {
    await mount({ n: 4, entries: { "svg.generate.batch": { choice: "preset", presetName: "Deleted" } } });
    expect(note()).toContain("“Deleted” is gone");
    expect(select().value).toBe("main");
  });

  it("choosing a value remembers it for the detected task, and only that task", async () => {
    const onTaskEntry = vi.fn();
    await mount({ n: 1, onTaskEntry });
    await act(async () => {
      select().value = "Simpler";
      select().dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(onTaskEntry).toHaveBeenCalledWith("svg.generate.single", { choice: "preset", presetName: "Simpler" });
    // a batch of nine is a different task: it keeps its own default
    ui.unmount();
    const batchEntry = vi.fn();
    await mount({ n: 9, onTaskEntry: batchEntry });
    expect(note()).toBe("Default prompt for this task — main prompt (currently loaded)");
    await act(async () => {
      select().value = "Bolder";
      select().dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(batchEntry).toHaveBeenCalledWith("svg.generate.batch", { choice: "preset", presetName: "Bolder" });
  });
});

describe("the prompt window is never rewritten by a popup", () => {
  it("choosing a preset leaves the stored main prompt untouched", async () => {
    const onConfirm = vi.fn();
    await mount({ n: 2, onConfirm });
    await act(async () => {
      select().value = "Bolder";
      select().dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(q("[data-testid=svg-confirm-prompt-effective]")?.textContent).toContain("prompt window is not changed");
    await act(async () => { (q("[data-testid=svg-confirm-generate]") as HTMLButtonElement).click(); });
    const batch = onConfirm.mock.calls[0][0] as ConfirmedBatch;
    expect(batch.choice).toEqual({ kind: "preset", name: "Bolder", text: "Make strokes bolder." });
  });
});
