// svg_confirm_regen_prompt.test.tsx — TDD for Generate & Batch Regenerate popups:
// 1. Both Generate SVG and Regenerate SVG popups show active default prompt message
//    above the preset dropdown (svg-confirm-default-prompt) and remember single vs batch
//    defaults independently across opens.
// 2. Regenerate SVG supports configurable batch size (svg-regen-per-request, 1..9, default 4)
//    sending all batch icons' current SVG codes + contact sheet in one request.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capsFor, type SamplingParams } from "../src/lib/modelcaps";
import { DEFAULT_CONFIG } from "../src/lib/svgconfig";
import { toRow } from "../src/svg/rowmodel";
import SvgConfirm from "../src/svg/SvgConfirm";
import type { SvgRow } from "../src/svg/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairMetaFor, svgSource, svgVersion } from "./helpers/svgpair";
import type { PromptPreset } from "../src/lib/promptpresets";
import { settle as quietSettle } from "./helpers/quiet";

vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async () => ({
      dataUrl: "data:image/png;base64,xxx",
      hash: "h1",
      layout: { cols: 2, rows: 2, size: 512, empty: [] },
      bytes: 10,
    })),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = () => quietSettle(0);
const setInputValue = (el: HTMLInputElement, v: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

function rows(n: number): SvgRow[] {
  return Array.from({ length: n }, (_, i) => {
    const id = `pair_${i + 1}`;
    const name = `icon-${i + 1}_AI.png`;
    const source = svgSource(id, { name, fingerprint: `${i + 1}:100` });
    return toRow(source, null, false);
  });
}

function rowsWithSvg(n: number): { root: FakeDir; list: SvgRow[] } {
  const root = new FakeDir("root");
  const arch = new FakeDir("architecture");
  root.children.set("architecture", arch);
  const list = Array.from({ length: n }, (_, i) => {
    const idx = i + 1;
    const source = svgSource(`pair_${idx}`, { name: `icon-${idx}_AI.png`, fingerprint: `${idx}:100` });
    const svgCode = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path id="old-${idx}" d="M2 2h20"/></svg>`;
    arch.children.set(`icon-${idx}_AI.svg`, new FakeFile(`icon-${idx}_AI.svg`, svgCode.length, 3200, svgCode));
    const meta = pairMetaFor(source, [svgVersion(`architecture/icon-${idx}_AI.svg`, { version: 1 })], "approved");
    return toRow(source, meta, false);
  });
  return { root, list };
}

const PRESETS: PromptPreset[] = [
  { name: "Bolder", text: "Make strokes bolder." },
  { name: "Simpler", text: "Remove detail." },
];

beforeEach(() => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  ui?.unmount();
  host.remove();
});

describe("SvgConfirm — generation preset selector & per-scope default memory", () => {
  it("generation shows default-prompt message above preset selector and remembers single vs batch separately", async () => {
    const all = rows(2);
    const onConfirm = vi.fn();
    await act(async () => {
      ui = createRoot(host);
      ui.render(
        <SvgConfirm
          ids={all.map((r) => r.source.id)}
          operation="generate"
          rows={all}
          config={DEFAULT_CONFIG}
          caps={capsFor(DEFAULT_CONFIG.model)}
          params={{ temperature: null, maxTokens: 8000, effort: null } as SamplingParams}
          rootRef={{ current: new FakeDir("root") }}
          running={false}
          presets={PRESETS}
          prompt="Main tab editor prompt"
          onConfirm={onConfirm}
          onDismiss={() => undefined}
        />,
      );
    });
    await settle();

    const banner = q("[data-testid=svg-confirm-default-prompt]")!;
    const genSel = q("[data-testid=svg-confirm-gen-preset]") as HTMLSelectElement;
    expect(banner).not.toBeNull();
    expect(genSel).not.toBeNull();
    expect(banner.compareDocumentPosition(genSel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner.textContent).toContain("SVG generation · batch");
    expect(banner.textContent).toContain("Main editor prompt");

    // Pick "Simpler" for batch generation -> updates default banner + live full prompt preview!
    await act(async () => {
      genSel.value = "Simpler";
      genSel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(banner.textContent).toContain("“Simpler”");
    expect(q("[data-testid=svg-confirm-full-prompt]")?.textContent).toContain("Remove detail.");

    await act(async () => {
      (q("[data-testid=svg-confirm-generate]") as HTMLButtonElement).click();
    });
    expect(onConfirm).toHaveBeenCalledWith({ regenPresetName: null, promptOverride: "Remove detail." });

    // Opening single-icon generation (1 icon) has its own independent default (Main editor prompt)!
    await act(async () => {
      ui.render(
        <SvgConfirm
          ids={[all[0].source.id]}
          operation="generate"
          rows={all}
          config={DEFAULT_CONFIG}
          caps={capsFor(DEFAULT_CONFIG.model)}
          params={{ temperature: null, maxTokens: 8000, effort: null } as SamplingParams}
          rootRef={{ current: new FakeDir("root") }}
          running={false}
          presets={PRESETS}
          prompt="Main tab editor prompt"
          onConfirm={onConfirm}
          onDismiss={() => undefined}
        />,
      );
    });
    await settle();
    expect(q("[data-testid=svg-confirm-default-prompt]")?.textContent).toBe(
      "Default prompt for SVG generation · single icon: Main editor prompt",
    );
  });

  it("generation uses main prompt when unpicked — confirm passes null preset", async () => {
    const all = rows(2);
    const onConfirm = vi.fn();
    await act(async () => {
      ui = createRoot(host);
      ui.render(
        <SvgConfirm
          ids={all.map((r) => r.source.id)}
          operation="generate"
          rows={all}
          config={DEFAULT_CONFIG}
          caps={capsFor(DEFAULT_CONFIG.model)}
          params={{ temperature: null, maxTokens: 8000, effort: null } as SamplingParams}
          rootRef={{ current: new FakeDir("root") }}
          running={false}
          presets={PRESETS}
          prompt="main prompt"
          onConfirm={onConfirm}
          onDismiss={() => undefined}
        />,
      );
    });
    await settle();
    await act(async () => {
      (q("[data-testid=svg-confirm-generate]") as HTMLButtonElement).click();
    });
    expect(onConfirm).toHaveBeenCalledWith(null);
  });
});

describe("SvgConfirm — batch regeneration (1..9 per request) & single vs batch defaults", () => {
  it("batches 5 icons into 2 requests (4 + 1) by default, previews all batch SVG codes, and switches single vs batch defaults live", async () => {
    const { root, list } = rowsWithSvg(5);
    const onConfirm = vi.fn();
    await act(async () => {
      ui = createRoot(host);
      ui.render(
        <SvgConfirm
          ids={list.map((r) => r.source.id)}
          operation="regenerate"
          rows={list}
          config={DEFAULT_CONFIG}
          caps={capsFor(DEFAULT_CONFIG.model)}
          params={{ temperature: null, maxTokens: 8000, effort: null } as SamplingParams}
          rootRef={{ current: root }}
          running={false}
          presets={PRESETS}
          prompt="main"
          onConfirm={onConfirm}
          onDismiss={() => undefined}
        />,
      );
    });
    await settle();
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    await settle();

    // Default regen batch size = 4 -> 5 icons split into 2 requests (2 × 4 max)!
    const countInput = q("[data-testid=svg-regen-per-request]") as HTMLInputElement;
    expect(countInput.value).toBe("4");
    expect(q("[data-testid=svg-confirm-requests]")?.textContent).toContain("2 × 4 max");

    // Page 1 full prompt preview contains all 4 icons' current SVG codes in one batch request!
    const fullPage1 = q("[data-testid=svg-confirm-full-prompt]")?.textContent ?? "";
    for (let i = 1; i <= 4; i++) expect(fullPage1).toContain(`id="old-${i}"`);
    expect(fullPage1).not.toContain('id="old-5"');

    // Pick "Simpler" for batch regeneration -> remembered under svg-regenerate:batch
    const sel = q("[data-testid=svg-confirm-regen-preset]") as HTMLSelectElement;
    await act(async () => {
      sel.value = "Simpler";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(q("[data-testid=svg-confirm-default-prompt]")?.textContent).toBe(
      "Default prompt for SVG regeneration · batch (multiple icons): “Simpler”",
    );

    // Lower count to 1 -> live-switches scope to single (5 × 1 max) with independent default ("Bolder")!
    await act(async () => setInputValue(countInput, "1"));
    await settle();
    expect(q("[data-testid=svg-confirm-requests]")?.textContent).toContain("5 × 1 max");
    expect(q("[data-testid=svg-confirm-default-prompt]")?.textContent).toBe(
      "Default prompt for SVG regeneration · single icon: “Bolder”",
    );

    // Raise count back to 4 -> restores batch default ("Simpler")!
    await act(async () => setInputValue(countInput, "4"));
    await settle();
    expect(q("[data-testid=svg-confirm-default-prompt]")?.textContent).toBe(
      "Default prompt for SVG regeneration · batch (multiple icons): “Simpler”",
    );

    await act(async () => {
      (q("[data-testid=svg-confirm-generate]") as HTMLButtonElement).click();
    });
    expect(onConfirm).toHaveBeenCalledWith("Simpler");
  });

  it("regeneration with no presets shows problem and disables confirm", async () => {
    const all = rows(1);
    await act(async () => {
      ui = createRoot(host);
      ui.render(
        <SvgConfirm
          ids={all.map((r) => r.source.id)}
          operation="regenerate"
          rows={all}
          config={DEFAULT_CONFIG}
          caps={capsFor(DEFAULT_CONFIG.model)}
          params={{ temperature: null, maxTokens: 8000, effort: null } as SamplingParams}
          rootRef={{ current: new FakeDir("root") }}
          running={false}
          presets={[]}
          prompt="main"
          onConfirm={() => undefined}
          onDismiss={() => undefined}
        />,
      );
    });
    await settle();
    expect(q("[data-testid=svg-confirm-problem]")?.textContent?.toLowerCase()).toContain("no saved prompts");
    expect((q("[data-testid=svg-confirm-generate]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("single-icon regeneration shows single-item prompt with preset + title detection + SVG code", async () => {
    const { root, list } = rowsWithSvg(1);
    await act(async () => {
      ui = createRoot(host);
      ui.render(
        <SvgConfirm
          ids={[list[0].source.id]}
          operation="regenerate"
          rows={list}
          config={DEFAULT_CONFIG}
          caps={capsFor(DEFAULT_CONFIG.model)}
          params={{ temperature: null, maxTokens: 8000, effort: null } as SamplingParams}
          rootRef={{ current: root }}
          running={false}
          presets={PRESETS}
          prompt="main"
          onConfirm={() => undefined}
          onDismiss={() => undefined}
        />,
      );
    });
    await settle();
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    await settle();
    const full = q("[data-testid=svg-confirm-full-prompt]")?.textContent ?? "";
    expect(full).toContain("Make strokes bolder.");
    expect(full).toContain("Icon name (use it as the SVG <title>)");
    expect(full).toContain("<svg");
    expect(full).toContain("Current SVG code of this icon");
  });
});
