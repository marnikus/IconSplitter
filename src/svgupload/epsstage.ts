// epsstage.ts — the EPS stage of one export (merge report §3.2, §9). Split from
// runstep.ts for size, and because the stage has its own rules worth reading in
// one place: ask the seam (the local writer first, a configured converter
// second), VERIFY that what came back really is Encapsulated PostScript, and
// record who wrote it. A refusal is never an invented file: it comes back with
// the reason to show and nothing to write.

import { verifyEps, type EpsPlan } from "../lib/svgupload/eps";
import type { EpsRequest } from "../lib/svgupload/epswrite";
import type { ToolRecord } from "../lib/svgupload/exportjson";
import type { ExportIo } from "./exporter";

export interface EpsRun {
  /** The export copy the run just wrote — the only input the writer reads. */
  svg: string;
  plan: EpsPlan;
  request: EpsRequest;
  eps: ExportIo["eps"];
}

export interface EpsRunOut {
  /** The bytes to publish, or null when the stage produced no file at all. */
  bytes: Uint8Array | null;
  /** Who wrote it, for the package's tool list; null on refusal. */
  tool: ToolRecord | null;
  /** The provenance word when it worked, else the reason it did not. */
  word: string;
  ok: boolean;
}

export async function runEpsStage(args: EpsRun): Promise<EpsRunOut> {
  const out = await args.eps(args.svg, args.plan, args.request);
  if (!out.ok) return refused(out.reason);
  const check = verifyEps(out.bytes);
  if (!check.ok) return refused(check.errors[0]);
  return {
    bytes: out.bytes, ok: true,
    tool: { name: "eps", version: out.via, config: { format: "EPSF-3.0" } },
    word: out.via === "local" ? "written locally" : "written by the configured converter",
  };
}

function refused(reason: string): EpsRunOut {
  return { bytes: null, tool: null, word: reason, ok: false };
}
