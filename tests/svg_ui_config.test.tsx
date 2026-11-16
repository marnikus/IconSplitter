// svg_ui_config.test.tsx — the Generate SVG tab, second half (split from
// svg_ui.test.tsx so the two run in parallel): the model card and its per-model
// settings, the preview frame and zoom slider, cost labels, the undoable review
// decision and the row preview. Real panel, real history bar (RULE 8).
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { STANDALONE_INK } from "../src/lib/svgpreview";
import { BG_PRESETS } from "../src/lib/svgbackground";
import { saveCatalog } from "../src/svg/catalog";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import {
  installSvgPanelHooks, COURT, FOG, SAVED_SVG, SIDECAR, box, input, makeRoot, mount, q, setModel,
  settle, type, unmountPanel,
} from "./helpers/svgpanel";

installSvgPanelHooks();

describe("Generate SVG panel", () => {
  it("minimizes the model card to its header and restores it, and remembers", async () => {
    await mount(await makeRoot());
    const toggle = () => q("[data-testid=svg-provider-toggle]") as HTMLButtonElement;
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(q("[data-testid=svg-max-tokens]")).not.toBeNull();
    expect(q("[data-testid=svg-key-state]")).not.toBeNull();

    await act(async () => { toggle().click(); });
    await settle();
    // Only the header stays: the model, its limits and the toggle itself.
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(q("[data-testid=svg-provider]")?.textContent).toContain("Requesty");
    expect(q("[data-testid=svg-limits]")?.textContent).toContain("stall");
    expect(q("[data-testid=svg-max-tokens]")).toBeNull();
    expect(q("[data-testid=svg-key-state]")).toBeNull();

    // A restart restores the minimized card — the space saving is remembered.
    await unmountPanel();
    await mount(await makeRoot());
    expect(q("[data-testid=svg-max-tokens]")).toBeNull();
    await act(async () => { toggle().click(); });
    await settle();
    expect(q("[data-testid=svg-max-tokens]")).not.toBeNull();
    expect(q("[data-testid=svg-key-state]")).not.toBeNull();
  });

  it("offers only what the default reasoning model accepts", async () => {
    await mount(await makeRoot());
    await setModel("openai/gpt-6.1-sol");
    // openai/gpt-6.1-sol is a reasoning model: no temperature, completion
    // tokens, four efforts (extra high included).
    expect(q("[data-testid=svg-temperature]")).toBeNull();
    expect(q("[data-testid=svg-temperature-off]")?.textContent).toContain("Not supported");
    expect(input("[data-testid=svg-max-tokens]").min).toBe("1000");
    const effort = q("[data-testid=svg-effort]") as HTMLSelectElement;
    expect([...effort.options].map((o) => o.value)).toEqual(["", "low", "medium", "high", "xhigh"]);
    expect(q("[data-testid=svg-caps]")?.textContent).toContain("max_completion_tokens");
    expect(q("[data-testid=svg-caps]")?.textContent).toContain("family");
  });

  it("keeps one setting per model and switches back to it", async () => {
    await mount(await makeRoot());
    await setModel("openai/gpt-4o");
    expect(q("[data-testid=svg-temperature]")).not.toBeNull();
    expect(q("[data-testid=svg-effort]")).toBeNull();
    await type("[data-testid=svg-temperature]", "0.3");
    await settle();
    expect(input("[data-testid=svg-temperature]").value).toBe("0.3");

    // The reasoning model has its own (empty) temperature: nothing of gpt-4o's
    // was carried over, so there is nothing to warn about.
    await setModel("openai/gpt-6.1-sol");
    expect(q("[data-testid=svg-param-note]")).toBeNull();
    expect(q("[data-testid=svg-temperature]")).toBeNull();
    await setModel("openai/gpt-4o");
    expect(input("[data-testid=svg-temperature]").value).toBe("0.3");
  });

  it("takes the model list's limits over the family defaults, and warns", async () => {
    const catalog = { object: "list", data: [{ id: "openai/gpt-6.1-sol", max_output_tokens: 8_000, supports_reasoning: true }] };
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(catalog), { status: 200 }));
    await mount(await makeRoot());
    await setModel("openai/gpt-6.1-sol");
    // The boot refresh fetched the list: its 8 000 ceiling replaces the 32 000
    // default, and the user is told instead of being silently served less.
    expect(input("[data-testid=svg-max-tokens]").value).toBe("8000");
    expect(q("[data-testid=svg-param-note]")?.textContent).toContain("output tokens clamped");
    expect(q("[data-testid=svg-caps]")?.textContent).toContain("model list");
    // A hand-typed value above that ceiling cannot be saved either.
    await type("[data-testid=svg-max-tokens]", "48000");
    await settle();
    expect(input("[data-testid=svg-max-tokens]").value).toBe("8000");
    // The manual refresh re-reads the same list and says where it came from.
    await act(async () => { (q("[data-testid=svg-refresh-models]") as HTMLButtonElement).click(); });
    await settle();
    expect(q("[data-testid=svg-toast]")?.textContent).toContain("Model list refreshed");
  });

  it("restores the saved settings after a restart, per model", async () => {
    await mount(await makeRoot());
    await setModel("openai/gpt-4o");
    await type("[data-testid=svg-temperature]", "0.4");
    await type("[data-testid=svg-max-tokens]", "4096");
    await settle();
    await setModel("openai/gpt-6.1-sol");
    const reasoningTokens = input("[data-testid=svg-max-tokens]").value;

    // A restart with no cached model list: the family rules are back in charge,
    // but the stored settings are not.
    saveCatalog([]);
    await unmountPanel();
    await mount(await makeRoot());
    await setModel("openai/gpt-4o");
    expect(input("[data-testid=svg-temperature]").value).toBe("0.4");
    expect(input("[data-testid=svg-max-tokens]").value).toBe("4096");
    // The reasoning model keeps its own settings — and still no temperature.
    await setModel("openai/gpt-6.1-sol");
    expect(q("[data-testid=svg-temperature]")).toBeNull();
    expect(input("[data-testid=svg-max-tokens]").value).toBe(reasoningTokens);
  });

  it("clamps a token ceiling into the model's range before it can be sent", async () => {
    await mount(await makeRoot());
    await type("[data-testid=svg-max-tokens]", "999999");
    await settle();
    expect(input("[data-testid=svg-max-tokens]").value).toBe("200000");
    await type("[data-testid=svg-max-tokens]", "5");
    await settle();
    expect(input("[data-testid=svg-max-tokens]").value).toBe("1000");
  });

  it("frames the SVG preview in the chosen background and keeps black strokes visible", async () => {
    const root = await makeRoot();
    await mount(root);
    const frame = () => q(`[data-testid=svg-prev-frame-${FOG}]`);
    expect(frame()?.getAttribute("data-bg")).toBe("#ffffff");
    expect(frame()?.className).not.toContain("contrast");
    expect(q("[data-testid=svg-bg-white]")?.getAttribute("aria-pressed")).toBe("true");

    // Black: the frame turns black AND gets the light outline, so artwork drawn
    // in black cannot disappear (the SVG itself is not touched).
    await act(async () => { (q("[data-testid=svg-bg-black]") as HTMLButtonElement).click(); });
    await settle();
    expect(frame()?.getAttribute("data-bg")).toBe("#000000");
    expect(frame()?.className).toContain("contrast");
    expect(q("[data-testid=svg-bg-value]")?.textContent).toContain("Black");

    // A dark custom colour gets the same help; a light one needs none.
    await type("[data-testid=svg-bg-custom]", "#123456");
    await settle();
    expect(frame()?.getAttribute("data-bg")).toBe("#123456");
    expect(q("[data-testid=svg-bg-value]")?.textContent).toContain("#123456");
    expect(frame()?.className).toContain("contrast");
    await type("[data-testid=svg-bg-custom]", "#f0f4ff");
    await settle();
    expect(frame()?.getAttribute("data-bg")).toBe("#f0f4ff");
    expect(frame()?.className).not.toContain("contrast");

    // Presets stay one decision: picking Gray leaves the custom value alone.
    await act(async () => { (q("[data-testid=svg-bg-gray]") as HTMLButtonElement).click(); });
    await settle();
    expect(frame()?.getAttribute("data-bg")).toBe("#808080");

    // The document is never modified: the preview paints the file's own path
    // inside its shadow root, the AI thumbnail is not framed, and the code
    // dialog is pristine.
    const host = q(`[data-testid=svg-prev-${FOG}]`) as HTMLDivElement | null;
    expect(host?.shadowRoot?.innerHTML).toContain('d="M2 2h20v20H2z"');
    // The colour is behind the artwork: the inline host lives INSIDE the frame,
    // so the chosen background is what the document is painted on.
    expect(host?.closest(".svg-preview-frame")).toBe(frame());
    expect(q(`[data-testid=svg-ai-${FOG}]`)?.closest(".svg-preview-frame")).toBeNull();
    await act(async () => { (q(`[data-testid=svg-code-${FOG}]`) as HTMLButtonElement).click(); });
    await settle();
    expect((q("[data-testid=svg-code-block]") as HTMLTextAreaElement).value).toBe(SAVED_SVG);

    // The colour is part of the app, not the SVG: after all of those clicks the
    // saved document and its sidecar are still exactly what was written before.
    const arch = root.children.get("architecture") as FakeDir;
    expect((arch.children.get("fog_AI.svg") as FakeFile).text).toBe(SAVED_SVG);
    expect((arch.children.get("fog_AI.svg.json") as FakeFile).text).toBe(SIDECAR);
    expect(SIDECAR).not.toContain("#c22f2f");
  });

  it("resizes BOTH previews with the one zoom slider, each at its own ratio (I-55)", async () => {
    await mount(await makeRoot());
    const panel = q(".svg") as HTMLElement;
    const both = () => ({
      ai: box(`[data-testid=svg-ai-${FOG}]`),
      svg: box(`[data-testid=svg-prev-frame-${FOG}]`),
      host: box(`[data-testid=svg-prev-${FOG}]`),
    });
    // the slider value is the height of both boxes, and the row height reads it
    expect(panel.style.getPropertyValue("--svg-thumb")).toBe("84px");
    expect(both()).toEqual({ ai: { w: 84, h: 84 }, svg: { w: 84, h: 84 }, host: { w: 84, h: 84 } });

    await type("[data-testid=svg-thumb]", "240");
    await settle();
    expect(q("[data-testid=svg-thumb-value]")?.textContent).toBe("240 px");
    expect(panel.style.getPropertyValue("--svg-thumb")).toBe("240px");
    expect(both()).toEqual({ ai: { w: 240, h: 240 }, svg: { w: 240, h: 240 }, host: { w: 240, h: 240 } });

    await type("[data-testid=svg-thumb]", "48");
    await settle();
    expect(panel.style.getPropertyValue("--svg-thumb")).toBe("48px");
    expect(both()).toEqual({ ai: { w: 48, h: 48 }, svg: { w: 48, h: 48 }, host: { w: 48, h: 48 } });
  });

  it("draws a wide document at its own ratio up to 800 px, framed exactly (I-55)", async () => {
    const root = await makeRoot();
    const wide = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24"><rect width="48" height="24" fill="#123456"/></svg>';
    (root.children.get("architecture") as FakeDir).children.set("fog_AI.svg", new FakeFile("fog_AI.svg", wide.length, 3200, wide));
    await mount(root);
    const slider = q("[data-testid=svg-thumb]") as HTMLInputElement;
    expect([slider.min, slider.max, slider.step]).toEqual(["48", "800", "4"]);
    await type("[data-testid=svg-thumb]", "800");
    await settle();
    expect(q("[data-testid=svg-thumb-value]")?.textContent).toBe("800 px");
    // 800 px tall and 2:1 wide: the frame, the artwork host inside it and the
    // box the row reserves all agree, so nothing is clipped and nothing overlaps
    expect(box(`[data-testid=svg-prev-frame-${FOG}]`)).toEqual({ w: 1600, h: 800 });
    expect(box(`[data-testid=svg-prev-${FOG}]`)).toEqual({ w: 1600, h: 800 });
    expect(box(`[data-testid=svg-ai-${FOG}]`)).toEqual({ w: 800, h: 800 }); // pixels unknown yet
    // the document itself is still the file's own bytes, in its own frame colour
    const host = q(`[data-testid=svg-prev-${FOG}]`) as HTMLElement;
    expect(host.shadowRoot?.innerHTML).toContain('viewBox="0 0 48 24"');
    expect(host.closest(".svg-preview-frame")).toBe(q(`[data-testid=svg-prev-frame-${FOG}]`));
    // both slots of the pair are siblings in the one shared layout
    const thumbs = q(`[data-testid=svg-prev-frame-${FOG}]`)?.parentElement as HTMLElement;
    expect(thumbs.className).toBe("pair-thumbs");
    expect([...thumbs.children].map((c) => (c as HTMLElement).dataset.testid))
      .toEqual([`svg-ai-${FOG}`, `svg-prev-frame-${FOG}`]);
  });

  it("sizes both previews by the one rule at EVERY slider value, never cropping one", async () => {
    await mount(await makeRoot());
    const panel = q(".svg") as HTMLElement;
    const box = (sel: string) => {
      const el = q(sel) as HTMLElement;
      return [el.style.width, el.style.height];
    };
    const seen = new Set<number>();
    for (let px = 48; px <= 800; px += 4) {
      await type("[data-testid=svg-thumb]", String(px));
      await settle();
      const side = `${px}px`;
      expect(panel.style.getPropertyValue("--svg-thumb")).toBe(side);
      expect(q("[data-testid=svg-thumb-value]")?.textContent).toBe(`${px} px`);
      // BOTH previews are sized by the one rule at every step of the slider:
      // the square document and the square raster both come out px × px
      expect(box(`[data-testid=svg-ai-${FOG}]`)).toEqual([side, side]);
      expect(box(`[data-testid=svg-prev-frame-${FOG}]`)).toEqual([side, side]);
      expect(box(`[data-testid=svg-prev-${FOG}]`)).toEqual([side, side]);
      seen.add(px);
    }
    // the whole documented range was really exercised: 48, 52, ... 800
    expect(seen.size).toBe((800 - 48) / 4 + 1);
  }, 20000); // 189 slider steps: CPU-bound, so give it room on a loaded runner

  it("puts every background behind the artwork and never into it", async () => {
    await mount(await makeRoot());
    const host = () => q(`[data-testid=svg-prev-${FOG}]`) as HTMLElement;
    const frame = () => q(`[data-testid=svg-prev-frame-${FOG}]`) as HTMLElement;
    const artwork = () => host().shadowRoot?.innerHTML ?? "";
    const before = artwork();
    // the expected colours come from the module that owns them, so this test
    // really checks every preset the UI offers
    for (const { id: preset, color } of BG_PRESETS) {
      await act(async () => { (q(`[data-testid=svg-bg-${preset}]`) as HTMLButtonElement).click(); });
      await settle();
      expect(frame().dataset.bg).toBe(color);
      // the colour really is on the frame (as authored hex or its rgb form)
      const rgb = `rgb(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)})`;
      expect([color, rgb].some((c) => frame().style.background.includes(c))).toBe(true);
      // the frame is the ONLY coloured surface: the artwork host paints nothing
      expect(host().style.background).toBe("");
      // and the document is byte-identical whatever the frame colour is
      expect(artwork()).toBe(before);
      expect(frame().classList.contains("contrast")).toBe(preset === "black");
    }
    // a custom colour is applied the same way, still without touching the file
    await act(async () => {
      const el = q("[data-testid=svg-bg-custom]") as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, "#123456");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect(frame().dataset.bg).toBe("#123456");
    expect(artwork()).toBe(before);
  });

  it("remembers the preview background across a restart", async () => {
    const root = await makeRoot();
    await mount(root);
    await act(async () => { (q("[data-testid=svg-bg-red]") as HTMLButtonElement).click(); });
    await settle();
    expect(q(`[data-testid=svg-prev-frame-${FOG}]`)?.getAttribute("data-bg")).toBe("#c22f2f");
    await unmountPanel(); // a restart: the panel is rebuilt from stored prefs
    await mount(root);
    expect(q(`[data-testid=svg-prev-frame-${FOG}]`)?.getAttribute("data-bg")).toBe("#c22f2f");
    expect(q("[data-testid=svg-bg-red]")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the cost beside the tokens and labels a calculated one Estimated", async () => {
    await mount(await makeRoot());
    expect(q(`[data-testid=svg-usage-${FOG}]`)?.textContent).toContain("$0.0100 reported");
    expect(q("[data-testid=svg-estimate]")?.textContent).toContain("$0.0100 reported");
    await act(async () => { (q(`[data-testid=svg-history-${FOG}]`) as HTMLButtonElement).click(); });
    await settle();
    expect(q("[data-testid=svg-history-cost-1]")?.textContent).toContain("$0.0100 reported");
    const estimated = q("[data-testid=svg-history-cost-2]")?.textContent ?? "";
    expect(estimated).toContain("$0.0200 Estimated");
    expect(estimated).toContain("openai/gpt-6.1-sol");
    expect(estimated).toContain("requesty-2026-10-01");
  });

  it("approves the active row's version and undoes it in one entry", async () => {
    await mount(await makeRoot());
    await act(async () => { (q(`[data-testid=svg-approve-${FOG}]`) as HTMLButtonElement).click(); });
    await settle();
    expect(q(`[data-testid=svg-review-${FOG}]`)?.textContent).toContain("Approved");
    expect(q("[data-testid=svg-count-approved]")?.textContent).toContain("1");
    await act(async () => { (q("[data-testid=hist-undo]") as HTMLButtonElement).click(); });
    await settle();
    expect(q(`[data-testid=svg-review-${FOG}]`)?.textContent).toContain("Pending");
  });
});

// The preview is the one surface that used to lie: the code copied fine while
// the row painted nothing. These three cases drive the real DOM (RULE 8).
describe("SVG row preview", () => {
  // Stroke-only, no xmlns — renders inline, was invisible as an <img> (D1/D4).
  const V1 = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16"/></svg>`;
  const V2 = `<svg viewBox="0 0 64 32" fill="none" stroke="#7dd3fc" stroke-width="3"><path d="M2 16h60"/></svg>`;
  const BROKEN = `<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"`;
  const copied: string[] = [];

  beforeEach(() => {
    copied.length = 0;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (text: string) => { copied.push(text); return Promise.resolve(); } },
    });
  });

  /** fog carries v1+v2 (v2 newest); court carries nothing; harbor is broken. */
  async function makePreviewRoot(): Promise<FakeDir> {
    const root = new FakeDir("split_root");
    const arch = new FakeDir("architecture");
    const svgVersion = (version: number, path: string) => ({
      version, svgPath: path, status: "generated", review: "pending",
      prompt: "p", provider: "Requesty", model: "openai/gpt-6.1-sol",
      requestedAt: "2026-10-01T10:00:00.000Z", completedAt: "2026-10-01T10:00:05.000Z",
      usage: { input: 100, output: 200, total: 300 },
      cost: { actual: 0.01, estimated: null, currency: "USD", pricing: null },
      validation: { ok: true, errors: [], warnings: [], icons: 1 },
      batch: null, error: null, requestId: null,
    });
    for (const [id, name] of [[FOG, "fog"], [COURT, "court"]] as const) {
      arch.children.set(`${name}.png`, new FakeFile(`${name}.png`, 12, 3000, "a"));
      arch.children.set(`${name}_AI.png`, new FakeFile(`${name}_AI.png`, 20, 3100, "b"));
      void id;
    }
    arch.children.set("fog_AI.svg", new FakeFile("fog_AI.svg", V1.length, 3200, V1));
    arch.children.set("fog_AI_v2.svg", new FakeFile("fog_AI_v2.svg", V2.length, 3300, V2));
    arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 10, 3300, JSON.stringify({
      v: 1,
      source: { relPath: "architecture/fog_AI.png", name: "fog_AI.png", fingerprint: "20:3100" },
      versions: [svgVersion(1, "architecture/fog_AI.svg"), svgVersion(2, "architecture/fog_AI_v2.svg")],
    })));
    const coast = new FakeDir("coastal");
    coast.children.set("harbor.png", new FakeFile("harbor.png", 12, 1000, "e"));
    coast.children.set("harbor_AI.png", new FakeFile("harbor_AI.png", 20, 1100, "f"));
    coast.children.set("harbor_AI.svg", new FakeFile("harbor_AI.svg", BROKEN.length, 1200, BROKEN));
    coast.children.set("harbor_AI.svg.json", new FakeFile("harbor_AI.svg.json", 10, 1200, JSON.stringify({
      v: 1,
      source: { relPath: "coastal/harbor_AI.png", name: "harbor_AI.png", fingerprint: "20:1100" },
      versions: [svgVersion(1, "coastal/harbor_AI.svg")],
    })));
    root.children.set("architecture", arch);
    root.children.set("coastal", coast);
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({
      records: [FOG, COURT, pairId("coastal", "harbor", "")].map((id) => ({
        pair_id: id, source: `${id}.png`, ai_result: `${id}_AI.png`,
        decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
      })),
    })));
    return root;
  }

  const HARBOR = pairId("coastal", "harbor", "");
  const frame = (id: string) => q(`[data-testid=svg-prev-${id}]`) as HTMLElement | null;
  const inlineSvg = (id: string) => frame(id)?.shadowRoot?.querySelector("svg") ?? null;

  it("renders the newest SVG inline, fitted and centred, xmlns and all", async () => {
    await mount(await makePreviewRoot());
    const svg = inlineSvg(FOG);
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    // fit + centre: the document fills the frame and keeps its own ratio
    expect(svg?.getAttribute("width")).toBe("100%");
    expect(svg?.getAttribute("height")).toBe("100%");
    expect(svg?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    // v2 is the newest version, so v2 is what the frame shows (64x32 box)
    expect(svg?.getAttribute("viewBox")).toBe("0 0 64 32");
    expect(frame(FOG)?.dataset.version).toBe("2");
    // the frame's own CSS travels with the document, scoped to the shadow root
    const style = frame(FOG)?.shadowRoot?.querySelector("style");
    expect(style).not.toBeNull();
    expect(style?.textContent).not.toContain("color");
    expect(style?.textContent).not.toContain("filter");
    // currentColor resolves the way a standalone document resolves it, through
    // the weakest declaration there is — a presentation attribute on the root;
    // the app never forces an ink through CSS.
    expect(svg?.getAttribute("color")).toBe(STANDALONE_INK);
    expect(svg?.getAttribute("style") ?? "").not.toContain("color:");
  });

  it("previews and copies the SAME version", async () => {
    await mount(await makePreviewRoot());
    expect(frame(FOG)?.dataset.version).toBe("2");
    expect(q(`[data-testid=svg-usage-${FOG}]`)?.textContent).toContain("v2");
    await act(async () => { (q(`[data-testid=svg-copy-${FOG}]`) as HTMLButtonElement).click(); });
    await settle();
    expect(copied).toEqual([V2]);
  });

  it("says why a saved SVG cannot be previewed — empty stays empty (RULE 4)", async () => {
    await mount(await makePreviewRoot());
    const broken = frame(HARBOR);
    expect(broken?.textContent).toContain("Preview failed");
    expect(broken?.dataset.error).toBe("not well-formed XML");
    expect(inlineSvg(HARBOR)).toBeNull();
    // court has no SVG at all: that is empty, not broken
    expect(frame(COURT)?.textContent).toBe("No SVG");
    expect(frame(COURT)?.dataset.error).toBeUndefined();
  });
});
