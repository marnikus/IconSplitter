// fakeinkscape.mjs — a stand-in for the Inkscape binary (2026-10-09). The
// helper tests point INKSCAPE_PATH at this script: `--version` prints what
// Inkscape 1.3.2 prints; an export call writes a minimal EPS whose bounding
// box is derived from the SVG's width/height. FAKE_INKSCAPE_MODE=fail exits 1
// with an stderr line; FAKE_INKSCAPE_MODE=slow hangs until killed.
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("Inkscape 1.3.2 (091e20e, 2023-11-25, custom)\n");
  process.exit(0);
}
const mode = process.env.FAKE_INKSCAPE_MODE ?? "ok";
if (mode === "fail") {
  process.stderr.write("** (inkscape:1): CRITICAL **: fake failure\n");
  process.exit(1);
}
if (mode === "slow") {
  setInterval(() => undefined, 1000); // keep the event loop alive until the helper kills us
} else {
  const input = args.find((a) => !a.startsWith("--"));
  const out = args.find((a) => a.startsWith("--export-filename="))?.slice("--export-filename=".length);
  if (!input || !out) { process.stderr.write("fake inkscape: no input or output\n"); process.exit(2); }
  const svg = readFileSync(input, "utf8");
  const w = Math.round(Number(/\bwidth="(\d+(?:\.\d+)?)/.exec(svg)?.[1] ?? 100));
  const h = Math.round(Number(/\bheight="(\d+(?:\.\d+)?)/.exec(svg)?.[1] ?? 100));
  writeFileSync(out, [
    "%!PS-Adobe-3.0 EPSF-3.0", "%%Creator: cairo 1.18.0 (fake inkscape)", "%%LanguageLevel: 3",
    `%%BoundingBox: 0 0 ${w} ${h}`, "%%EndComments", "0 0 moveto fill", "%%EOF", "",
  ].join("\n"));
  process.exit(0);
}
