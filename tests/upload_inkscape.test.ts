// RULE 8 — the Inkscape CLI framework: version/argv are pure; convert runs
// the real dispatcher against writeEps and a fake CliHost (never mocked).
import { describe, expect, it } from "vitest";
import { convertSvgToEps } from "../src/lib/upload/epsconvert/convert";
import { unavailableHost } from "../src/lib/upload/epsconvert/host";
import { inkscapeArgv, parseInkscapeVersion } from "../src/lib/upload/epsconvert/inkscapeargv";
import { INKSCAPE_UNAVAILABLE } from "../src/lib/upload/epsconvert/inkscape";
import { verifyEps, verifyEpsDocument } from "../src/lib/upload/epsdoc";
import type { CliHost, ConvertRequest, InkscapeJob, InkscapeRun } from "../src/lib/upload/epsconvert/types";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="#000"/></svg>`;
const REQ: ConvertRequest = { svgText: SVG, background: "#ffffff", opts: { title: "fog.eps" } };
const PATHS = { input: "/tmp/in.svg", output: "/tmp/out.eps" };
const CAIRO = [
  "%!PS-Adobe-3.0 EPSF-3.0",
  "%%BoundingBox: 0 0 100 100",
  "%%Creator: cairo 1.16.0",
  "0 0 0 setrgbcolor fill",
  "%%EOF",
  "",
].join("\n");

function recordingHost(run: InkscapeRun): CliHost & { jobs: InkscapeJob[] } {
  const jobs: InkscapeJob[] = [];
  return {
    jobs,
    probe: async (id) => (id === "builtin" ? { ok: true, reason: "in-process" } : { ok: run.ok, reason: run.ok ? "ready" : run.reason }),
    runInkscape: async (job) => { jobs.push(job); return run; },
  };
}

describe("Inkscape argv", () => {
  it("parses 1.x and 0.92; garbage is null (no guess)", () => {
    expect(parseInkscapeVersion("Inkscape 1.3.2 (1:1.3.2-1)")).toEqual({ major: 1, minor: 3 });
    expect(parseInkscapeVersion("Inkscape 0.92.5")).toEqual({ major: 0, minor: 92 });
    expect(parseInkscapeVersion("not inkscape")).toBeNull();
  });

  it("1.x uses --export-filename; 0.92 uses --export-eps --without-gui", () => {
    const v1 = inkscapeArgv({ major: 1, minor: 3 }, PATHS);
    expect(v1).toContain("--export-filename=/tmp/out.eps");
    expect(v1).toContain("--export-type=eps");
    expect(v1).toContain("--export-ps-level=3");
    expect(v1).toContain("--export-area-page");
    expect(v1).toContain("--export-text-to-path");
    expect(v1.at(-1)).toBe("/tmp/in.svg");
    const v092 = inkscapeArgv({ major: 0, minor: 92 }, PATHS);
    expect(v092).toContain("--without-gui");
    expect(v092).toContain("--export-eps=/tmp/out.eps");
    expect(v092).toContain("--export-area-page");
    expect(v092).toContain("--export-text-to-path");
    expect(v092.at(-1)).toBe("/tmp/in.svg");
  });
});

describe("convertSvgToEps", () => {
  it("builtin still writes today's EPS 10 (real writeEps)", async () => {
    const result = await convertSvgToEps("builtin", REQ, unavailableHost);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.writer).toBe("builtin-subset-1");
    expect(result.eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
    expect(verifyEps(result.eps).ok).toBe(true);
  });

  it("inkscape + unavailable host fails honestly, never a builtin body (D7)", async () => {
    const result = await convertSvgToEps("inkscape", REQ, unavailableHost);
    expect(result).toEqual({ ok: false, reason: INKSCAPE_UNAVAILABLE, writer: "inkscape-cli" });
  });

  it("a fake host's Cairo EPS converts as inkscape-cli", async () => {
    const host = recordingHost({ ok: true, eps: CAIRO, version: "Inkscape 1.3.2", argv: [] });
    const result = await convertSvgToEps("inkscape", REQ, host);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.writer).toBe("inkscape-cli");
    expect(result.eps).toBe(CAIRO);
    expect(result.engine).toBe("Inkscape 1.3.2");
    expect(host.jobs).toEqual([{ svgText: SVG, title: "fog.eps" }]);
  });

  it("a host failure reason is the convert reason, never a builtin body", async () => {
    const host = recordingHost({ ok: false, reason: "inkscape: not found" });
    const result = await convertSvgToEps("inkscape", REQ, host);
    expect(result).toEqual({ ok: false, reason: "inkscape: not found", writer: "inkscape-cli" });
  });

  it("an already-aborted signal is interruption and does not run the host (RULE 7)", async () => {
    const host = recordingHost({ ok: true, eps: CAIRO, version: "1.3.2", argv: [] });
    const result = await convertSvgToEps("inkscape", { ...REQ, signal: AbortSignal.abort() }, host);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("interrupted");
    expect(host.jobs).toEqual([]);
  });
});

describe("verify by profile (D6)", () => {
  it("Cairo EPS fails EPS 10 and passes generic; empty/missing header fail closed", () => {
    expect(verifyEps(CAIRO).ok).toBe(false);
    expect(verifyEpsDocument(CAIRO, "generic").ok).toBe(true);
    expect(verifyEpsDocument("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 1 1\n%%EOF\n", "generic").ok).toBe(false);
    expect(verifyEpsDocument("not eps\n%%BoundingBox: 0 0 1 1\n%%EOF\n", "generic").ok).toBe(false);
  });
});
