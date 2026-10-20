// svg_confirm_regen_batch.test.tsx — batch regeneration in the popup
// (2026-10-20). A batch carries up to nine icons, so nine icons at the default
// size are ONE confirmed page; lowering the size re-plans the same selection.
// Each page previews exactly its own icons' codes, and a row without a readable
// current SVG is named and left out before anything is sent.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toRow } from "../src/svg/rowmodel";
import SvgConfirm from "../src/svg/SvgConfirm";
import type { ConfirmedBatch, SvgRow } from "../src/svg/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairMetaFor, svgPathFor, svgSource, svgVersion } from "./helpers/svgpair";
import type { PromptPreset } from "../src/lib/promptpresets";
import { settle as quietSettle } from "./helpers/quiet";
import { confirmProps } from "./helpers/svgconfirm";

vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async (_root: unknown, sources: readonly { relPath: string }[]) => ({
      dataUrl: `data:image/png;base64,${sources.map((s) => s.relPath).join("|")}`,
      hash: "h", layout: { cols: 1, rows: 1, size: 512, empty: [] }, bytes: 10,
    })),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PRESETS: PromptPreset[] = [{ name: "Bolder", text: "Make strokes bolder." }];
const BATCH = { "svg.regenerate.batch": { choice: "preset" as const, presetName: "Bolder" } };

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = () => quietSettle(0);

/** `n` approved rows, every one with a readable v1 SVG on disk. */
function fixture(n: number, missing: number[] = []): { rows: SvgRow[]; root: FakeDir } {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  root.children.set("architecture", arch);
  const rows = Array.from({ length: n }, (_, i) => {
    const source = svgSource(`pair_${i + 1}`, { name: `icon-${i + 1}_AI.png`, fingerprint: `${i + 1}:100` });
    const path = svgPathFor(source, 1);
    if (!missing.includes(i + 1)) {
      const code = `<svg viewBox="0 0 24 24"><title>icon-${i + 1}_AI</title></svg>`;
      arch.children.set(path.split("/").pop() as string, new FakeFile(`icon-${i + 1}_AI_v1.svg`, 10, 1, code));
    }
    return toRow(source, pairMetaFor(source, [svgVersion(path)]), false);
  });
  return { rows, root };
}

async function mount(o: { n: number; size?: number; missing?: number[]; onConfirm?: (b: ConfirmedBatch) => void; onRegenSize?: (n: number) => void }) {
  const { rows, root } = fixture(o.n, o.missing);
  await act(async () => {
    ui = createRoot(host);
    ui.render(<SvgConfirm {...confirmProps({
      ids: rows.map((r) => r.source.id), rows, operation: "regenerate", presets: PRESETS,
      regenSize: o.size ?? 9, taskEntries: BATCH, root,
      onConfirm: o.onConfirm, onRegenSize: o.onRegenSize,
    })} />);
  });
  await settle();
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  await settle();
  return rows;
}

/** React tracks its own value: the native setter is what makes onChange fire. */
async function setSize(value: string) {
  const input = q("[data-testid=svg-confirm-regen-size]") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

const items = () => Array.from(host.querySelectorAll("[data-testid=svg-batch-items] span")).map((s) => s.textContent ?? "");
const fullPrompt = () => q("[data-testid=svg-confirm-full-prompt]")?.textContent ?? "";

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  ui?.unmount();
  host.remove();
});

describe("batch regeneration — one request carries a whole sheet", () => {
  it("nine icons at the default 9 are ONE confirmed page holding all nine", async () => {
    await mount({ n: 9 });
    expect(q("[data-testid=svg-confirm-requests]")?.textContent).toBe("1 × 9 max · prompt “Bolder”");
    expect(q("[data-testid=svg-batch-page]")?.textContent).toContain("Request 1 of 1");
    expect(items()).toHaveLength(9);
    expect(q("[data-testid=svg-batch-grid]")?.textContent).toContain("3×3");
    expect(q("[data-testid=svg-batch-empty]")?.textContent).toContain("0 empty");
    expect(fullPrompt()).toContain("Here is a batch of 9 icons to regenerate");
  });

  it("the size control re-plans live and reports the value it persisted", async () => {
    const onRegenSize = vi.fn();
    await mount({ n: 9, onRegenSize });
    expect(q("[data-testid=svg-confirm-regen-size]")).not.toBeNull();
    await setSize("4");
    await settle();
    expect(onRegenSize).toHaveBeenCalledWith(4);
    expect(q("[data-testid=svg-confirm-requests]")?.textContent).toBe("3 × 4 max · prompt “Bolder”");
    expect(q("[data-testid=svg-batch-page]")?.textContent).toContain("Request 1 of 3");
    expect(items()).toHaveLength(4);
  });

  it("a size above 9 is clamped, never planned", async () => {
    const onRegenSize = vi.fn();
    await mount({ n: 9, onRegenSize });
    await setSize("42");
    await settle();
    expect(onRegenSize).toHaveBeenCalledWith(9);
    expect(q("[data-testid=svg-confirm-requests]")?.textContent).toBe("1 × 9 max · prompt “Bolder”");
  });

  it("each page previews its own icons' codes and nothing from the next page", async () => {
    const rows = await mount({ n: 5, size: 4 });
    expect(q("[data-testid=svg-batch-page]")?.textContent).toContain("Request 1 of 2");
    expect(fullPrompt()).toContain("1 — ");
    expect(fullPrompt()).toContain("4 — ");
    const pageOne = fullPrompt();

    await act(async () => { (q("[data-testid=svg-batch-next]") as HTMLButtonElement).click(); });
    await settle();
    expect(items()).toEqual([`1 — ${rows[4].source.stem}`]);
    // a one-icon page keeps the single-icon text: the name drives the <title>
    expect(fullPrompt()).toContain(rows[4].source.stem);
    expect(fullPrompt()).not.toBe(pageOne);
  });

  it("names an icon that has no readable current SVG and leaves it out of the plan", async () => {
    await mount({ n: 3, missing: [2] });
    expect(q("[data-testid=svg-confirm-excluded]")?.textContent).toContain("icon-2_AI.png");
    expect(items()).toEqual(["1 — icon-1_AI", "2 — icon-3_AI"]);
    expect(q("[data-testid=svg-confirm-count]")?.textContent).toBe("3");
  });

  it("refuses the batch when no selected icon has a readable SVG", async () => {
    await mount({ n: 2, missing: [1, 2] });
    expect(q("[data-testid=svg-confirm-problem]")?.textContent).toContain("no selected icon has a readable current SVG"
      .replace("no", "No"));
    expect((q("[data-testid=svg-confirm-generate]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("hands the queue the frozen codes, the preset text and the size it planned with", async () => {
    const onConfirm = vi.fn();
    const rows = await mount({ n: 2, onConfirm });
    await act(async () => { (q("[data-testid=svg-confirm-generate]") as HTMLButtonElement).click(); });
    const batch = onConfirm.mock.calls[0][0] as ConfirmedBatch;
    expect(batch.size).toBe(9);
    expect(batch.choice).toEqual({ kind: "preset", name: "Bolder", text: "Make strokes bolder." });
    expect([...batch.codes.keys()]).toEqual(rows.map((r) => r.source.id));
    expect(batch.codes.get(rows[0].source.id)?.code).toContain("icon-1_AI");
  });
});
