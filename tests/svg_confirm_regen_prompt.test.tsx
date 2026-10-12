// svg_confirm_regen_prompt.test.tsx — TDD for per-batch prompt selection
// Requirement: generation batch uses main prompt, regeneration asks in popup
// with dropdown, clearly says generation vs regeneration, applies selected to full batch.

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

vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async () => ({
      dataUrl: "data:image/png;base64,xxx",
      hash: "h1",
      layout: { cols: 1, rows: 1, size: 512, empty: [] },
      bytes: 10,
    })),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

function rows(n: number): SvgRow[] {
  return Array.from({ length: n }, (_, i) => {
    const id = `pair_${i + 1}`;
    const name = `icon-${i + 1}_AI.png`;
    const source = svgSource(id, { name, fingerprint: `${i + 1}:100` });
    return toRow(source, null, false);
  });
}

const PRESETS: PromptPreset[] = [
  { name: "Bolder", text: "Make strokes bolder." },
  { name: "Simpler", text: "Remove detail." },
];

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  ui?.unmount();
  host.remove();
});

describe("SvgConfirm — generation vs regeneration mode distinction", () => {
  it("generation shows 'Generation batch now' and no preset dropdown", async () => {
    const all = rows(2);
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
          prompt={DEFAULT_CONFIG.model}
          onConfirm={() => undefined}
          onDismiss={() => undefined}
        />,
      );
    });
    await settle();
    const mode = q("[data-testid=svg-confirm-mode]")?.textContent ?? "";
    expect(mode.toLowerCase()).toContain("generation");
    expect(mode.toLowerCase()).toContain("batch now");
    // should NOT have regen preset dropdown for generation
    expect(q("[data-testid=svg-confirm-regen-preset]")).toBeNull();
    // should show main prompt note
    expect(q("[data-testid=svg-confirm-main-prompt]")?.textContent?.toLowerCase()).toContain("main prompt");
  });

  it("regeneration shows 'Regeneration now' and preset dropdown", async () => {
    const all = rows(2);
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
          presets={PRESETS}
          prompt="main prompt text"
          onConfirm={() => undefined}
          onDismiss={() => undefined}
        />,
      );
    });
    await settle();
    const mode = q("[data-testid=svg-confirm-mode]")?.textContent ?? "";
    expect(mode.toLowerCase()).toContain("regeneration");
    expect(mode.toLowerCase()).toContain("now");
    const sel = q("[data-testid=svg-confirm-regen-preset]") as HTMLSelectElement | null;
    expect(sel).not.toBeNull();
    const opts = Array.from(sel!.querySelectorAll("option")).map((o) => o.textContent);
    expect(opts).toEqual(expect.arrayContaining(["Bolder", "Simpler"]));
  });

  it("regeneration applies selected preset to full batch via onConfirm", async () => {
    const all = rows(3);
    const onConfirm = vi.fn();
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
          presets={PRESETS}
          prompt="main"
          onConfirm={onConfirm}
          onDismiss={() => undefined}
        />,
      );
    });
    await settle();
    const sel = q("[data-testid=svg-confirm-regen-preset]") as HTMLSelectElement;
    // change selection to Simpler
    await act(async () => {
      sel.value = "Simpler";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
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

  it("generation uses main prompt — confirm passes null preset", async () => {
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

describe("SvgConfirm — full prompt preview below in popup", () => {
  it("generation shows full prompt with manifest and main prompt", async () => {
    const all = rows(2);
    const mainPrompt = "Create crisp icons with thick strokes.";
    await act(async () => {
      ui = createRoot(host);
      ui.render(
        <SvgConfirm
          ids={all.map((r) => r.source.id)}
          operation="generate"
          rows={all}
          config={{ ...DEFAULT_CONFIG, imagesPerRequest: 4 }}
          caps={capsFor(DEFAULT_CONFIG.model)}
          params={{ temperature: null, maxTokens: 8000, effort: null } as SamplingParams}
          rootRef={{ current: new FakeDir("root") }}
          running={false}
          presets={PRESETS}
          prompt={mainPrompt}
          onConfirm={() => undefined}
          onDismiss={() => undefined}
        />,
      );
    });
    await settle();
    const full = q("[data-testid=svg-confirm-full-prompt]")?.textContent ?? "";
    expect(full).toContain(mainPrompt);
    expect(full).toContain("1 — icon-1_AI");
    expect(full).toContain("2 — icon-2_AI");
    expect(full.toLowerCase()).toContain("return the svgs in the same numeric order");
  });

  it("regeneration shows full prompt with preset + title detection + SVG code", async () => {
    const id = "pair_1";
    const source = svgSource(id, { name: "fog_AI.png", fingerprint: "1:100" });
    const svgCode = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
    const ver = svgVersion("architecture/fog_AI.svg", { version: 1 });
    const meta = pairMetaFor(source, [ver], "approved");
    const { toRow } = await import("../src/svg/rowmodel");
    const row = toRow(source, meta, false);
    const root = new FakeDir("root");
    const arch = new FakeDir("architecture");
    arch.children.set("fog_AI.svg", new FakeFile("fog_AI.svg", svgCode.length, 3200, svgCode));
    root.children.set("architecture", arch);

    await act(async () => {
      ui = createRoot(host);
      ui.render(
        <SvgConfirm
          ids={[row.source.id]}
          operation="regenerate"
          rows={[row]}
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
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    await settle();
    const full = q("[data-testid=svg-confirm-full-prompt]")?.textContent ?? "";
    expect(full).toContain("Make strokes bolder.");
    expect(full).toContain("Icon name (use it as the SVG <title>)");
    expect(full).toContain("<svg");
    expect(full).toContain("Current SVG code of this icon");
  });
});
