// applyplan.ts — apply a write plan to the folder handles (IO twin of
// generateflow): svg file first, then the sidecar. A sidecar that cannot be
// written is reported, not fatal: the validated svg stays on disk and the UI
// offers Retry (spec §10). Missing directories or svg write failures throw.

import type { DirHandleLike } from "../lib/fs";
import { writeFileOverwrite } from "../lib/fs";
import type { PairPlan } from "./generateflow";
import { saveSidecar } from "./sidecarstore";

export interface ApplyOut {
  written: string[];
  sidecarErrors: string[];
}

export async function applyPlan(
  dirFor: (relDir: string) => Promise<DirHandleLike>,
  plans: Iterable<PairPlan>,
): Promise<ApplyOut> {
  const out: ApplyOut = { written: [], sidecarErrors: [] };
  for (const p of plans) {
    const dir = await dirFor(p.relDir);
    if (p.writeFile) {
      await writeFileOverwrite(dir, p.writeFile.name, new Blob([p.writeFile.text], { type: "image/svg+xml" }));
      out.written.push(p.pairId);
    }
    try {
      await saveSidecar(dir, p.aiName, p.sidecar);
    } catch {
      out.sidecarErrors.push(p.pairId);
    }
  }
  return out;
}
