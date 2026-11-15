// @vitest-environment happy-dom
// svg_builder_meta_autoapply.test.ts — the sheet metadata answer is applied at
// once (2026-11-15): no draft to accept; Title-Artboard goes onto the banner.
// Gemini is a stubbed fetch; nothing leaves the test.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { DEFAULT_GEMINI_CONFIG } from "../src/lib/upload/gemini";
import { DEFAULT_SELECTION_RECIPE } from "../src/lib/svgBuilder/selection";
import { providerActions } from "../src/svgBuilder/actions/provider";
import type { BuilderActionContext } from "../src/svgBuilder/actiontypes";

const ANSWER = `Title: Asian noodle soup bowl icon set
Description: Healthy enjoyment of hot meals. Bowls contain noodles steam and chopsticks
Tags: icon, pictogram, vector, stroke, line, editable, web, noodles, bowl, steam, soup
Title-Artboard: noodle bowl icons asset`;

function fakeCtx() {
  const model: Record<string, unknown> = {
    config: DEFAULT_CONFIG, seed: 1, lockedIds: [], recipe: DEFAULT_SELECTION_RECIPE, metadata: null, draft: null, draftTitle: "",
    preview: "data:image/png;base64,iVBORw0KGgo=", dialog: "metadata", key: { value: "test-key" }, gemini: DEFAULT_GEMINI_CONFIG, prompt: "P",
  };
  const said: string[] = [];
  const ctx = {
    get model() { return model; },
    dispatch: (patch: Record<string, unknown>) => Object.assign(model, patch),
    say: (m: string) => { said.push(m); }, setBusy: () => undefined, hist: undefined,
  } as unknown as BuilderActionContext;
  return { ctx, model, said };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("sheet metadata applies automatically", () => {
  it("one confirmed request: accepted metadata, the banner title from Title-Artboard, the dialog closed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: ANSWER }] }, finishReason: "STOP" }] }), { status: 200 })));
    const { ctx, model, said } = fakeCtx();
    providerActions(() => ctx).confirmMetadata();
    await vi.waitFor(() => expect(model.dialog).toBe("none"));
    expect(model.metadata).toMatchObject({ state: "accepted", title: "Asian noodle soup bowl icon set" });
    expect(model.draft).toBeNull();
    expect((model.config as typeof DEFAULT_CONFIG).banner).toMatchObject({ title: "noodle bowl icons asset", subtitle: "Editable stroke width" });
    expect(said.join(" ")).toMatch(/applied/);
  });
});
