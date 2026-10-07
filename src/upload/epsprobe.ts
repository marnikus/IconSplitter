// epsprobe.ts — is there a machine here that can actually DRAW the EPS we make?
//
// An EPS file is PostScript. Browsers cannot render PostScript, so an EPS made
// in this app is always generated from our own vectors and checked structurally
// (header, bounding box, ink extents) — but "does it draw?" can only be answered
// by a host that owns a PostScript interpreter: Ghostscript (`gs`), or any
// equivalent, behind a local bridge. The desktop/CLI shell injects that bridge on
// `globalThis`; a plain browser tab has none, and we say so instead of pretending.
//
// This is a probe, not a dependency: a missing bridge never blocks SVG + JPEG
// exports, it only keeps their EPS sibling unconfirmed (DESIGN §7).

/** The one thing we ask of a host: "did this PostScript draw without error?". */
export interface EpsHostRenderer {
  render: (eps: string) => Promise<boolean>;
}

/** Where a host announces its renderer. Documented in CAPABILITIES (EPS section). */
export const EPS_BRIDGE_KEY = "__iconSplitterEps";

/** The host's renderer, or null when this machine cannot draw PostScript. */
export function epsHostRenderer(): EpsHostRenderer | null {
  const candidate = (globalThis as Record<string, unknown>)[EPS_BRIDGE_KEY];
  return isRenderer(candidate) ? candidate : null;
}

/** True when EPS files can be confirmed renderable here (preflight reads this). */
export function epsRendererAvailable(): boolean {
  return epsHostRenderer() !== null;
}

/** The dependency, said plainly: no bridge, no confirmation. */
export const EPS_RENDERER_NOTE =
  "EPS needs a PostScript interpreter (Ghostscript `gs` or equivalent) behind a host bridge; " +
  "without it the file is generated from the vectors and checked structurally only.";

/** Reject anything that is not shaped like `{ render(eps) => Promise<boolean> }`. */
function isRenderer(value: unknown): value is EpsHostRenderer {
  if (typeof value !== "object" || value === null) return false;
  const render = (value as { render?: unknown }).render;
  return typeof render === "function";
}
