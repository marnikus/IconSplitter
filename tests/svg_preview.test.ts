// svg_preview.test.ts — the SVG preview pipeline executes for real (RULE 8).
// Every case reproduces one of the preview defects recorded in
// docs/archive/2026-10-01-svg-preview-rendering/design.md: a saved document that
// copies as valid code but painted nothing (no xmlns, XML prolog, unbound
// prefix), painted wrong (no intrinsic size, currentColor on a dark frame,
// cross-row id collisions) or painted nothing at all with no reason given.
// Each assertion fails if src/lib/svgpreview.ts is deleted.
import { describe, expect, it } from "vitest";
import { buildSvgPreview, PREVIEW_INK } from "../src/lib/svgpreview";
import { previewTargetOf } from "../src/svg/rowmodel";
import { newSidecar, withVersion, type SvgSidecar, type SvgVersion } from "../src/lib/svgfile";
import type { SvgRow } from "../src/svg/types";

const NS = "http://www.w3.org/2000/svg";

/** A stroke-only line icon, exactly what the prompt produces (D4). */
const STROKE_ONLY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M12 4v16"/></svg>`;

function preview(code: string | null) {
  return buildSvgPreview(code);
}

describe("buildSvgPreview — documents that copy but did not paint", () => {
  it("adds the missing xmlns declaration (D1)", () => {
    const p = preview(STROKE_ONLY);
    expect(p.ok).toBe(true);
    expect(p.html).toContain(`xmlns="${NS}"`);
    expect(p.html.startsWith("<svg")).toBe(true);
  });

  it("accepts an XML prolog, a doctype and a leading comment (D2)", () => {
    const prolog = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "svg11.dtd">\n<!-- made by hand -->\n${STROKE_ONLY}`;
    expect(preview(prolog).ok).toBe(true);
    expect(preview(prolog).viewBox).toBe("0 0 24 24");
  });

  it("repairs an unbound xlink prefix instead of rejecting the document", () => {
    const code = `<svg xmlns="${NS}" viewBox="0 0 24 24"><defs><path id="p" d="M2 2h4v4H2z"/></defs><use xlink:href="#p"/></svg>`;
    const p = preview(code);
    expect(p.ok).toBe(true);
    expect(p.html).toContain(`xmlns:xlink="http://www.w3.org/1999/xlink"`);
    expect(p.html).toContain(`xlink:href="#`);
  });

  it("keeps a document that already declares its namespaces byte-for-byte", () => {
    const code = `<svg xmlns="${NS}" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`;
    const p = preview(code);
    expect(p.ok).toBe(true);
    expect(p.html.match(/xmlns=/g)).toHaveLength(1);
  });
});

describe("buildSvgPreview — fit, centre and stroke width", () => {
  it("derives a viewBox from px width/height when none is declared (D3)", () => {
    const p = preview(`<svg xmlns="${NS}" width="512" height="256"><path d="M0 0h512v256H0z"/></svg>`);
    expect(p.ok).toBe(true);
    expect(p.viewBox).toBe("0 0 512 256");
    expect(p.ratio).toBe(2);
  });

  it("scales every box uniformly: 100% frame, centred, ratio kept", () => {
    for (const [box, ratio] of [["0 0 24 24", 1], ["0 0 64 32", 2], ["0 0 512 128", 4], ["-8 -8 32 16", 2]] as const) {
      const p = preview(`<svg xmlns="${NS}" viewBox="${box}"><path d="M0 0h1v1H0z"/></svg>`);
      expect(p.ok).toBe(true);
      expect(p.viewBox).toBe(box);
      expect(p.ratio).toBe(ratio);
      expect(p.html).toContain(`width="100%"`);
      expect(p.html).toContain(`height="100%"`);
      expect(p.html).toContain(`preserveAspectRatio="xMidYMid meet"`);
    }
  });

  it("gives currentColor a visible ink and leaves explicit colours alone (D4)", () => {
    const p = preview(STROKE_ONLY);
    expect(p.html).toContain(`stroke="currentColor"`);
    expect(p.html).toContain(`color:${PREVIEW_INK}`);
    const white = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><path fill="#ffffff" d="M2 2h20v20H2z"/></svg>`);
    expect(white.html).toContain(`fill="#ffffff"`);
  });

  it("drops the root's own width/height so the fit cannot be overridden", () => {
    const p = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24" style="width:512px;height:512px;opacity:.9"><path d="M2 2h20v20H2z"/></svg>`);
    expect(p.ok).toBe(true);
    expect(p.html).not.toContain("512px");
    expect(p.html).toContain("opacity:.9");
  });

  it("keeps the artwork's own background rect and its transparency", () => {
    const p = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><rect width="24" height="24" fill="#101010"/><path d="M2 2h20v20H2z"/></svg>`);
    expect(p.html).toContain(`<rect width="24" height="24" fill="#101010"/>`);
    const plain = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`);
    expect(plain.html).not.toContain("<rect");
  });
});

describe("buildSvgPreview — sanitizing the saved document", () => {
  it("removes scripts, event handlers, javascript: URLs and remote references", () => {
    const p = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24">`
      + `<script>alert(1)</script>`
      + `<path onload="alert(2)" d="M2 2h20v20H2z"/>`
      + `<a href="javascript:alert(3)"><circle cx="4" cy="4" r="2"/></a>`
      + `<image href="https://tracker.example/x.png" width="8" height="8"/>`
      + `<use href="https://cdn.example/defs.svg#x"/>`
      + `<foreignObject><iframe src="https://tracker.example"></iframe></foreignObject>`
      + `</svg>`);
    expect(p.ok).toBe(true);
    expect(p.html).not.toContain("script");
    expect(p.html).not.toContain("onload");
    expect(p.html).not.toContain("javascript:");
    expect(p.html).not.toContain("tracker.example");
    expect(p.html).not.toContain("cdn.example");
    expect(p.html).not.toContain("foreignObject");
    expect(p.html).toContain(`<path d="M2 2h20v20H2z"/>`);
  });

  it("keeps local fragment references and inline data images (RULE 20)", () => {
    const p = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><defs><path id="p" d="M2 2h4v4H2z"/></defs>`
      + `<use href="#p"/><image href="data:image/png;base64,AAAA" width="4" height="4"/></svg>`);
    expect(p.html).toContain("<use");
    expect(p.html).toContain("data:image/png;base64,AAAA");
    expect(p.html).not.toContain('href=""');
  });

  it("keeps a safe <style> and drops one that imports or fetches", () => {
    const safe = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><style>.cls-1{fill:#fff;stroke:url(#g)}</style><path class="cls-1" d="M2 2h20v20H2z"/></svg>`);
    expect(safe.html).toContain(".cls-1{fill:#fff;stroke:url(#g)}");
    expect(preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><style>@import url(https://evil.example/a.css);</style><path d="M2 2h20v20H2z"/></svg>`).html).not.toContain("@import");
    expect(preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><style>.a{background:url(https://evil.example/b.png)}</style><path d="M2 2h20v20H2z"/></svg>`).html).not.toContain("evil.example");
  });

  it("rewrites ids inside a <style> but never a hex colour", () => {
    const code = `<svg xmlns="${NS}" viewBox="0 0 24 24"><style>#g{fill:#fff}.a{stroke:#0f0}</style>`
      + `<defs><linearGradient id="g"/></defs><rect width="24" height="24" fill="url(#g)"/></svg>`;
    const p = preview(code);
    const scoped = /id="([^"]+)"/.exec(p.html)?.[1] ?? "";
    expect(scoped).not.toBe("g");
    expect(p.html).toContain(`#${scoped}{fill:#fff}`);
    expect(p.html).toContain("stroke:#0f0");
  });

  it("scopes ids so two previews cannot share one definition", () => {
    const doc = (stop: string) => `<svg xmlns="${NS}" viewBox="0 0 24 24"><defs><linearGradient id="g"><stop stop-color="${stop}"/></linearGradient></defs><rect width="24" height="24" fill="url(#g)"/></svg>`;
    const a = preview(doc("#ffffff"));
    const b = preview(doc("#000000"));
    const idA = /id="([^"]+)"/.exec(a.html)?.[1];
    const idB = /id="([^"]+)"/.exec(b.html)?.[1];
    expect(idA).toBeTruthy();
    expect(idA).not.toBe(idB);
    expect(a.html).toContain(`url(#${idA})`);
    expect(a.html).not.toContain(`url(#g)`);
    expect(b.html).toContain(`url(#${idB})`);
  });

  it("never touches the text it was given", () => {
    const code = `<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`;
    buildSvgPreview(code);
    expect(code).toBe(`<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`);
  });
});

describe("buildSvgPreview — empty is not broken (RULE 4)", () => {
  it("reports why a document cannot be previewed", () => {
    expect(preview(null)).toMatchObject({ ok: false, html: "", error: "no SVG to preview" });
    expect(preview("   ")).toMatchObject({ ok: false, error: "no SVG to preview" });
    expect(preview("Here is your icon: sorry, no code.")).toMatchObject({ ok: false, error: "no SVG markup found" });
    expect(preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"`)).toMatchObject({ ok: false, error: "not well-formed XML" });
    expect(preview(`<html><body><svg xmlns="${NS}" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg></body></html>`))
      .toMatchObject({ ok: false, error: "root element is not <svg>" });
  });

  it("says so when there is no box to fit into", () => {
    const pct = preview(`<svg xmlns="${NS}" width="100%" height="100%"><path d="M2 2h20v20H2z"/></svg>`);
    expect(pct).toMatchObject({ ok: false, error: "no viewBox and no usable width/height" });
    expect(preview(`<svg xmlns="${NS}"><path d="M2 2h20v20H2z"/></svg>`).ok).toBe(false);
    expect(preview(`<svg xmlns="${NS}" viewBox="0 0 0 24"><path d="M2 2h20v20H2z"/></svg>`).ok).toBe(false);
  });
});

describe("previewTargetOf — one version for the preview and for Copy", () => {
  const source = { id: "fog", name: "fog_AI.png", stem: "fog_AI", relPath: "a/fog_AI.png", dirPath: "a", fingerprint: "20:3100" };

  function version(v: number, svgPath: string, ok = true): SvgVersion {
    return {
      version: v, svgPath, status: "generated", review: "pending", prompt: "p", provider: "Requesty",
      model: "m", requestedAt: "2026-10-01T10:00:00.000Z", completedAt: "2026-10-01T10:00:05.000Z",
      usage: { input: 1, output: 2, total: 3 },
      cost: { actual: 0.01, estimated: null, currency: "USD", pricing: null },
      validation: { ok, errors: [], warnings: [], icons: 1 },
      batch: null, error: null, requestId: null,
    };
  }

  function rowWith(versions: SvgVersion[]): SvgRow {
    const sidecar: SvgSidecar = versions.reduce(
      (acc, v) => withVersion(acc, v),
      newSidecar({ relPath: source.relPath, name: source.name, fingerprint: source.fingerprint }),
    );
    return { source, sidecar, corrupt: false, newest: versions.at(-1) ?? null, approved: null, status: "generated", error: null, running: false };
  }

  it("points at the newest valid version's file and number", () => {
    const row = rowWith([version(1, "a/fog_AI.svg"), version(2, "a/fog_AI_v2.svg")]);
    expect(previewTargetOf(row)).toEqual({ version: 2, svgPath: "a/fog_AI_v2.svg" });
  });

  it("is null when there is nothing valid to preview or to copy", () => {
    expect(previewTargetOf(rowWith([]))).toBeNull();
    expect(previewTargetOf(rowWith([version(3, "")]))).toBeNull();
  });
});
