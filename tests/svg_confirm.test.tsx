// svg_confirm.test.tsx — the confirmation that must show EVERY request before
// anything is sent (RULE 8): the request count, one page per batch, that page's
// own composite and its exact ordered filenames, and the empty cells of a
// partial last batch. Each test fails if the pagination or the per-page
// composite disappears.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capsFor, type SamplingParams } from "../src/lib/modelcaps";
import { compositeLayout } from "../src/lib/svgcomposite";
import { DEFAULT_CONFIG } from "../src/lib/svgconfig";
import { toRow } from "../src/svg/rowmodel";
import SvgConfirm from "../src/svg/SvgConfirm";
import type { SvgRow } from "../src/svg/types";
import type { SvgSource } from "../src/svg/sources";
import { FakeDir } from "./helpers/fakefs";
import { svgSource } from "./helpers/svgpair";

vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async (_root: unknown, sources: readonly SvgSource[]) => ({
      dataUrl: `data:image/png;base64,${sources.map((s) => s.relPath).join("|")}`,
      hash: `h${sources.length}`,
      layout: compositeLayout(sources.length),
      bytes: 10,
    })),
  };
});

const { buildComposite } = await import("../src/svg/composite");
const compositeCalls = vi.mocked(buildComposite);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

/** `n` approved rows in scan order. */
function rows(n: number): SvgRow[] {
  return Array.from({ length: n }, (_, i) => {
    const id = `pair_${i + 1}`;
    const name = `icon-${i + 1}_AI.png`;
    const source = svgSource(id, { name, fingerprint: `${i + 1}:100` });
    return toRow(source, null, false);
  });
}

interface MountOpts {
  count: number;
  perRequest?: number;
  effort?: SamplingParams["effort"];
}

async function mount(opts: MountOpts): Promise<SvgRow[]> {
  const all = rows(opts.count);
  await act(async () => {
    ui = createRoot(host);
    ui.render(
      <SvgConfirm
        ids={all.map((r) => r.source.id)}
        rows={all}
        config={{ ...DEFAULT_CONFIG, imagesPerRequest: opts.perRequest ?? 4 }}
        caps={capsFor(DEFAULT_CONFIG.model)}
        params={{ temperature: null, maxTokens: 8_000, effort: opts.effort ?? null }}
        rootRef={{ current: new FakeDir("split_root") }}
        onConfirm={() => undefined}
        onDismiss={() => undefined}
      />,
    );
  });
  await settle();
  return all;
}

const items = () => Array.from(host.querySelectorAll("[data-testid=svg-batch-items] span")).map((s) => s.textContent ?? "");
const click = async (sel: string) => {
  await act(async () => { (q(sel) as HTMLButtonElement).click(); });
  await settle();
};

beforeEach(() => {
  compositeCalls.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  ui?.unmount();
  host.remove();
});

describe("SvgConfirm — the whole plan before any request", () => {
  it("shows the request count at the size the user configured — even at medium effort", async () => {
    await mount({ count: 8, perRequest: 4, effort: "medium" });
    expect(q("[data-testid=svg-confirm-count]")?.textContent).toBe("8");
    // 8 images at the configured 4 stay TWO requests of 4 at every tier: the
    // reasoning level widens the stall window, it never shrinks the batch.
    expect(q("[data-testid=svg-confirm-requests]")?.textContent).toBe("2 × 4 max");
    expect(q("[data-testid=svg-confirm-limit]")?.textContent).toContain("medium");
    expect(q("[data-testid=svg-confirm-limit]")?.textContent).toContain("stall window");
    expect(q("[data-testid=svg-batch-page]")?.textContent).toContain("Request 1 of 2");
    // ...and the dialog says the answer is streamed with no total limit
    expect(q("[data-testid=svg-confirm-streaming]")?.textContent).toContain("never cut");
  });

  it("paginates every batch with its own composite and exact ordered filenames", async () => {
    const all = await mount({ count: 5, perRequest: 4 });
    expect(q("[data-testid=svg-batch-page]")?.textContent).toContain("Request 1 of 2");
    expect(items()).toEqual(["1 — icon-1_AI", "2 — icon-2_AI", "3 — icon-3_AI", "4 — icon-4_AI"]);
    expect((q("[data-testid=svg-composite-img]") as HTMLImageElement).src).toContain(all.slice(0, 4).map((r) => r.source.relPath).join("|"));
    expect((q("[data-testid=svg-batch-prev]") as HTMLButtonElement).disabled).toBe(true);

    await click("[data-testid=svg-batch-next]");
    expect(q("[data-testid=svg-batch-page]")?.textContent).toContain("Request 2 of 2");
    expect(items()).toEqual(["1 — icon-5_AI"]);
    expect((q("[data-testid=svg-composite-img]") as HTMLImageElement).src).toContain(all[4].source.relPath);

    // one composite built per visited page — going back does not rebuild
    await click("[data-testid=svg-batch-prev]");
    expect(q("[data-testid=svg-batch-page]")?.textContent).toContain("Request 1 of 2");
    expect(compositeCalls).toHaveBeenCalledTimes(2);
  });

  it.each([1, 3, 4, 5, 8, 9])("plans %i images into the right requests, 4 at a time", async (count) => {
    await mount({ count, perRequest: 4 });
    const pages = Math.ceil(count / 4);
    expect(q("[data-testid=svg-confirm-count]")?.textContent).toBe(String(count));
    expect(q("[data-testid=svg-confirm-requests]")?.textContent).toBe(`${pages} × 4 max`);
    expect(q("[data-testid=svg-batch-page]")?.textContent).toContain(`Request 1 of ${pages}`);
    expect(items()).toHaveLength(Math.min(4, count));

    // walk to the last page: it holds exactly the remaining images, in order
    for (let i = 1; i < pages; i += 1) await click("[data-testid=svg-batch-next]");
    const shown = items();
    expect(shown).toHaveLength(count - (pages - 1) * 4);
    // positions restart at 1 inside EVERY request (they name the contact
    // sheet's cells), while the file names carry on with the real image
    const first = (pages - 1) * 4 + 1;
    expect(shown[0]).toBe(`1 — icon-${first}_AI`);
    expect(shown[shown.length - 1]).toBe(`${shown.length} — icon-${first + shown.length - 1}_AI`);
    // a partial page keeps a square grid with the cells it could not fill
    const shape = q("[data-testid=svg-batch-grid]")?.textContent ?? "";
    const cells = (() => { const m = /(\d+)×(\d+) grid/.exec(shape); return m ? Number(m[1]) * Number(m[2]) : 0; })();
    expect(cells).toBeGreaterThanOrEqual(shown.length);
    expect(q("[data-testid=svg-batch-empty]")?.textContent).toContain(String(cells - shown.length));
  });

  it("keeps the empty cells of a partial last batch visible", async () => {
    await mount({ count: 11, perRequest: 4 });
    expect(q("[data-testid=svg-batch-page]")?.textContent).toContain("Request 1 of 3");
    await click("[data-testid=svg-batch-next]");
    await click("[data-testid=svg-batch-next]");
    expect(q("[data-testid=svg-batch-page]")?.textContent).toContain("Request 3 of 3");
    expect(items()).toEqual(["1 — icon-9_AI", "2 — icon-10_AI", "3 — icon-11_AI"]);
    expect(q("[data-testid=svg-batch-grid]")?.textContent).toContain("2×2");
    expect(q("[data-testid=svg-batch-empty]")?.textContent).toContain("1");
    expect((q("[data-testid=svg-batch-next]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends nothing by being opened, and confirms or cancels like a dialog", async () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    const all = rows(3);
    await act(async () => {
      ui = createRoot(host);
      ui.render(
        <SvgConfirm ids={all.map((r) => r.source.id)} rows={all} config={DEFAULT_CONFIG}
          caps={capsFor(DEFAULT_CONFIG.model)} params={{ temperature: null, maxTokens: 8_000, effort: null }}
          rootRef={{ current: new FakeDir("split_root") }} onConfirm={onConfirm} onDismiss={onDismiss} />,
      );
    });
    await settle();
    expect(onConfirm).not.toHaveBeenCalled();
    await click("[data-testid=svg-confirm-generate]");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await click("[data-testid=svg-confirm-cancel]");
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(compositeCalls).toHaveBeenCalledTimes(1);
  });

  it("says honestly when a page's composite cannot be built", async () => {
    compositeCalls.mockRejectedValueOnce(new Error("source image gone"));
    await mount({ count: 1 });
    expect(q("[data-testid=svg-composite-error]")?.textContent).toContain("source image gone");
    expect(q("[data-testid=svg-composite-img]")).toBeNull();
  });
});
