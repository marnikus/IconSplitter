// upload_epsprobe.test.ts — "can this machine draw the EPS we make?"
//
// Two honest answers only: a host bridge that owns a PostScript interpreter, or
// "unavailable". The probe must never guess, and the SVGO plugin list must not
// name plugins where svgo would only warn (that noise hid real messages).

import { afterEach, describe, expect, it } from "vitest";
import { EPS_BRIDGE_KEY, EPS_RENDERER_NOTE, epsHostRenderer, epsRendererAvailable } from "../src/upload/epsprobe";
import { optimizeSvg, SVGO_CONFIG } from "../src/lib/svgoptimize";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals[EPS_BRIDGE_KEY];
});

describe("EPS renderer probe", () => {
  it("reports unavailable on a plain browser tab", () => {
    expect(epsHostRenderer()).toBeNull();
    expect(epsRendererAvailable()).toBe(false);
    expect(EPS_RENDERER_NOTE).toContain("Ghostscript");
  });

  it("finds a host bridge that can render", async () => {
    const drawn: string[] = [];
    globals[EPS_BRIDGE_KEY] = { render: async (eps: string) => (drawn.push(eps), true) };
    expect(epsRendererAvailable()).toBe(true);
    const renderer = epsHostRenderer();
    expect(renderer).not.toBeNull();
    expect(await renderer?.render("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
    expect(drawn).toEqual(["%!PS-Adobe-3.0 EPSF-3.0"]);
  });

  it("ignores anything that is not a renderer", () => {
    globals[EPS_BRIDGE_KEY] = { render: "yes" };
    expect(epsHostRenderer()).toBeNull();
    globals[EPS_BRIDGE_KEY] = null;
    expect(epsHostRenderer()).toBeNull();
  });
});

describe("SVGO plugin list", () => {
  const names = (SVGO_CONFIG.plugins as readonly { name: string }[]).map((plugin) => plugin.name);

  it("names no standalone metadata plugin, because naming one runs it", () => {
    expect(names).toEqual(["preset-default"]);
    const preset = SVGO_CONFIG.plugins[0] as unknown as { params: { overrides: Record<string, boolean> } };
    expect(preset.params.overrides).not.toHaveProperty("removeTitle");
    expect(preset.params.overrides).not.toHaveProperty("removeViewBox");
    expect(preset.params.overrides.removeDesc).toBe(false);
  });

  it("still keeps title, desc and metadata alive in an embedded document", () => {
    const embedded = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">',
      "  <title>Rounded bolt</title>",
      "  <desc>An editable line pictogram of a bolt.</desc>",
      "  <metadata>keywords: bolt, icon</metadata>",
      '  <path d="M4 12 L20 12" stroke="#111" stroke-width="2.2" fill="none"/>',
      "</svg>",
    ].join("\n");
    const result = optimizeSvg(embedded);
    expect(result.ok).toBe(true);
    for (const kept of ["<title>", "<desc>", "<metadata>", 'viewBox="0 0 24 24"', "stroke-width"]) {
      expect(result.code).toContain(kept);
    }
  });
});
