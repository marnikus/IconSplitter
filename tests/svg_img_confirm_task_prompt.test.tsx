// svg_img_confirm_task_prompt.test.tsx — the image-edit popup joins the ONE
// task prompt picker (2026-10-20): it names its default above the list, keeps
// single and batch apart, never rewrites the shared prompt for a preset, and
// offers an explicit "load into the main prompt editor" instead.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PromptPreset } from "../src/lib/promptpresets";
import type { TaskPromptMap } from "../src/lib/prompttasks";
import SvgImgConfirm from "../src/svg/SvgImgConfirm";
import { imgConfirmProps } from "./helpers/svgimgconfirm";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PRESETS: PromptPreset[] = [
  { name: "Bolder", text: "Make the lines bolder." },
  { name: "Simpler", text: "Fewer details." },
];

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const text = (testid: string) => q(`[data-testid=${testid}]`)?.textContent ?? "";
const select = () => q("[data-testid=svg-img-prompt-select]") as HTMLSelectElement;
const box = () => q("[data-testid=svg-img-prompt]") as HTMLTextAreaElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  ui?.unmount();
  host.remove();
  vi.restoreAllMocks();
});

async function mount(o: { ids?: string[]; entries?: Partial<TaskPromptMap>; prompt?: string; onPrompt?: (p: string) => void; onTaskEntry?: (t: string, e: unknown) => void }) {
  await act(async () => {
    ui = createRoot(host);
    ui.render(<SvgImgConfirm {...imgConfirmProps({
      ids: o.ids ?? ["a"], presets: PRESETS, prompt: o.prompt ?? "main prompt",
      taskEntries: o.entries, onPrompt: o.onPrompt, onTaskEntry: o.onTaskEntry as never,
    })} />);
  });
}

const choose = async (value: string) => {
  await act(async () => {
    select().value = value;
    select().dispatchEvent(new Event("change", { bubbles: true }));
  });
};

describe("image edit — the task in force", () => {
  it("one icon is the single task and its main prompt default is named above the list", async () => {
    await mount({});
    expect(q("[data-testid=svg-img-prompt-box]")?.getAttribute("data-task")).toBe("image.edit.single");
    expect(text("svg-img-prompt-default")).toBe("Default prompt for this task — main prompt (currently loaded)");
    expect(select().value).toBe("main");
    expect(box().readOnly).toBe(false);
    expect(box().value).toBe("main prompt");
  });

  it("several icons are the batch task: the count alone decides, with no tabs", async () => {
    await mount({ ids: ["a", "b", "c"], entries: { "image.edit.single": { choice: "preset", presetName: "Simpler" } } });
    expect(q("[data-testid=svg-img-prompt-box]")?.getAttribute("data-task")).toBe("image.edit.batch");
    // the single icon's default belongs to that situation, not to this edit
    expect(select().value).toBe("main");
    expect(q("[data-testid=svg-img-prompt-tabs]")).toBeNull();
    expect(q("[data-testid=svg-img-prompt-single]")).toBeNull();
    // ...and one icon shows that remembered default
    ui.unmount();
    await mount({ ids: ["a"], entries: { "image.edit.single": { choice: "preset", presetName: "Simpler" } } });
    expect(text("svg-img-prompt-default")).toBe("Default prompt for this task — “Simpler”");
    expect(box().value).toBe("Fewer details.");
  });

  it("a remembered preset default fills the read-only prompt and never touches the main prompt", async () => {
    await mount({ entries: { "image.edit.single": { choice: "preset", presetName: "Bolder" } } });
    expect(text("svg-img-prompt-default")).toBe("Default prompt for this task — “Bolder”");
    expect(select().value).toBe("Bolder");
    expect(box().readOnly).toBe(true);
    expect(box().value).toBe("Make the lines bolder.");
    expect(text("svg-img-prompt-effective")).toContain("prompt window is not changed");
  });

  it("a stored preset that is gone is named and falls back to the main prompt", async () => {
    await mount({ entries: { "image.edit.single": { choice: "preset", presetName: "Deleted" } } });
    expect(text("svg-img-prompt-default")).toContain("“Deleted” is gone");
    expect(select().value).toBe("main");
    expect(box().readOnly).toBe(false);
  });
});

describe("image edit — choosing and loading", () => {
  it("remembers the choice for the open tab's task, not for the other shape", async () => {
    const onTaskEntry = vi.fn();
    await mount({ ids: ["a", "b"], onTaskEntry });
    await choose("Bolder");
    expect(onTaskEntry).toHaveBeenCalledWith("image.edit.batch", { choice: "preset", presetName: "Bolder" });
  });

  it("loading a preset into the editor writes its text once and returns the task to main", async () => {
    const onPrompt = vi.fn();
    const onTaskEntry = vi.fn();
    await mount({ entries: { "image.edit.single": { choice: "preset", presetName: "Simpler" } }, onPrompt, onTaskEntry });
    await act(async () => { (q("[data-testid=svg-img-load-preset]") as HTMLButtonElement).click(); });
    expect(onPrompt).toHaveBeenCalledWith("Fewer details.");
    expect(onTaskEntry).toHaveBeenCalledWith("image.edit.single", { choice: "main", presetName: "" });
  });

  it("the editable textarea keeps writing the shared main prompt", async () => {
    const onPrompt = vi.fn();
    await mount({ onPrompt });
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(box(), "a flat fog icon");
      box().dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onPrompt).toHaveBeenCalledWith("a flat fog icon");
  });
});
