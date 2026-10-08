// tools/inkscape-host.mjs — pure contract (no real Inkscape in verify).
import { describe, expect, it } from "vitest";
// @ts-expect-error Node ESM helper — no TS types (tools/inkscape-host.mjs)
import { healthPayload, inkscapeArgv, parseInkscapeVersion, probeInkscape } from "../tools/inkscape-host.mjs";
import {
  inkscapeArgv as libArgv, parseInkscapeVersion as libParse,
} from "../src/lib/upload/epsconvert/inkscapeargv";

const PATHS = { input: "/in.svg", output: "/out.eps" };

describe("inkscape-host contract", () => {
  it("healthPayload names a missing binary vs a found one", () => {
    expect(healthPayload(null)).toEqual({ ok: false, reason: "inkscape: not found" });
    expect(healthPayload({ version: "Inkscape 1.3.2", path: "inkscape" })).toEqual({
      ok: true, inkscape: { version: "Inkscape 1.3.2", path: "inkscape" },
    });
  });

  it("helper argv matches the lib framework (1.x and 0.92)", () => {
    const v1 = { major: 1, minor: 3 };
    const v092 = { major: 0, minor: 92 };
    expect(parseInkscapeVersion("Inkscape 1.3.2 (hash)")).toEqual(libParse("Inkscape 1.3.2 (hash)"));
    expect(inkscapeArgv(v1, PATHS)).toEqual(libArgv(v1, PATHS));
    expect(inkscapeArgv(v092, PATHS)).toEqual(libArgv(v092, PATHS));
  });
});

const live = process.env.INKSCAPE_TEST === "1";
(live ? it : it.skip)("finds a real Inkscape when INKSCAPE_TEST=1", async () => {
  expect(await probeInkscape()).not.toBeNull();
});
