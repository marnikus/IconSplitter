// @vitest-environment happy-dom
// svg_builder_meta_options.test.tsx — two choices in the metadata confirmation
// (2026-11-23): send the WHOLE sheet with its banner, or only the icons (the
// default); and let the answer's title replace the banner words (the default),
// or only fill the metadata. Both are remembered; switching the image redraws
// the exact requests before anything is sent.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { acceptSheetMetadata } from "../src/lib/svgBuilder/metadata";
import { withSheetAnswer, type FinalArtboard } from "../src/lib/svgBuilder/artboards";
import { iconsImageFor } from "../src/svgBuilder/metaimagefor";
import { DEFAULT_BUILDER_PREFS, parseBuilderPrefs } from "../src/svgBuilder/prefsstore";
import SvgBuilderArtboardMeta from "../src/svgBuilder/SvgBuilderArtboardMeta";
import type { BuilderApi } from "../src/svgBuilder/useSvgBuilder";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const png = async () => new Blob([new Uint8Array([1])], { type: "image/png" });

describe("metadata request options (2026-11-23)", () => {
  it("are remembered: icons only and title to the banner by default", () => {
    expect(DEFAULT_BUILDER_PREFS).toMatchObject({ metaFullSheet: false, metaTitleToBanner: true });
    expect(parseBuilderPrefs({ metaFullSheet: true, metaTitleToBanner: false })).toMatchObject({ metaFullSheet: true, metaTitleToBanner: false });
    expect(parseBuilderPrefs({ metaFullSheet: "yes", metaTitleToBanner: 0 })).toMatchObject({ metaFullSheet: false, metaTitleToBanner: true });
  });

  it("the whole sheet keeps its banner and its size; icons only drops it", async () => {
    const config = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "left", size: 242, title: "VISIBLE TITLE" } });
    let drawn = "";
    const deps = { pngBlob: async (svg: string) => { drawn = svg; return png(); } };
    await iconsImageFor({ config, assets: [], placedIds: [], svgTexts: {}, full: true }, deps);
    expect(drawn).toContain("data-banner");
    expect(drawn).toContain(`width="${config.artboard.width}"`);
    await iconsImageFor({ config, assets: [], placedIds: [], svgTexts: {} }, deps);
    expect(drawn).not.toContain("data-banner");
  });

  it("the answer's title goes onto the banner only when asked; the metadata always", () => {
    const art = { id: "a", title: "kept words", subtitle: "kept sub", metadata: null } as unknown as FinalArtboard;
    const metadata = acceptSheetMetadata({ title: "Domestic household routines and grocery shopping", description: "Domestic household routines and grocery shopping concepts today",
      tags: ["icon", "pictogram", "vector", "stroke", "line", "editable", "web", "food", "home", "kitchen"] });
    const answer = { metadata, artboardTitle: "household icons" };
    expect(withSheetAnswer(art, answer)).toMatchObject({ title: "household icons" });
    expect(withSheetAnswer(art, answer, false)).toMatchObject({ title: "kept words", subtitle: "kept sub", metadata: { state: "accepted" } });
  });
});

describe("the confirmation's two checkboxes (2026-11-23)", () => {
  let host: HTMLDivElement;
  let ui: Root;
  beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); ui = createRoot(host); });
  afterEach(() => { act(() => ui.unmount()); host.remove(); });

  it("show the remembered choices and change them", () => {
    const setMetaOptions = vi.fn();
    const b = {
      artboardMeta: { ids: ["a"], requests: [{ id: "a", name: "A", preview: "data:image/png;base64,AA==" }], skipped: [], done: 0, running: false },
      prefs: { ...DEFAULT_BUILDER_PREFS }, prompt: "p", gemini: { model: "m" }, key: { mask: "k" },
      actions: { setMetaOptions, confirmArtboardsMetadata: vi.fn(), cancelArtboardsMetadata: vi.fn() },
    } as unknown as BuilderApi;
    act(() => { ui.render(<SvgBuilderArtboardMeta b={b} />); });
    const full = host.querySelector('[data-testid="builder-meta-full-sheet"]') as HTMLInputElement;
    const title = host.querySelector('[data-testid="builder-meta-title-banner"]') as HTMLInputElement;
    expect([full.checked, title.checked]).toEqual([false, true]);
    act(() => { full.click(); });
    expect(setMetaOptions).toHaveBeenLastCalledWith({ fullSheet: true });
    act(() => { title.click(); });
    expect(setMetaOptions).toHaveBeenLastCalledWith({ titleToBanner: false });
  });
});
