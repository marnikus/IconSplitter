// jobplan.ts — the pure decisions a job makes before it touches an artifact
// (design §6.3/§9): which outputs the committed package holds, which stages
// today's settings require, and the bundle the commit pass reads. No IO, no
// class state — so every selective-export rule is directly testable (R07/R12).

import { fingerprintsOf, planReexport, type StagePlan } from "../lib/upfinger";
import type { IconMetadata } from "../lib/upmeta";
import type { ExportSettings } from "../lib/upsettings";
import type { ExportRecord } from "../lib/upexport";
import { PENDING_META, type CommitInputs, type PresentOutputs } from "./jobartifacts";
import type { ExportDirScan } from "./sources";

/** Which of this icon's three outputs the committed generation holds. */
export function outputsPresent(scan: ExportDirScan, base: string): PresentOutputs {
  return {
    svg: scan.outputs.includes(`${base}.svg`),
    jpeg: scan.outputs.includes(`${base}.jpg`),
    eps: scan.outputs.includes(`${base}.eps`),
  };
}

export interface PlanInputs {
  committed: ExportRecord | null;
  sourceSha: string;
  settings: ExportSettings;
  /** The metadata in hand NOW; null when the run may have to generate it. */
  metadata: IconMetadata | null;
  allowAi: boolean;
  present: PresentOutputs;
}

/**
 * The selective plan (§9): compare the committed record with today. Without
 * metadata in hand the comparison uses a sentinel that matches nothing, so the
 * plan re-embeds whatever the (possibly generated) metadata turns out to be —
 * and a paid generation is only planned when it is actually allowed.
 */
export function planFor(a: PlanInputs): StagePlan {
  const meta = a.metadata ?? (a.allowAi ? PENDING_META : a.committed?.metadata ?? PENDING_META);
  const plan = planReexport({
    record: a.committed,
    current: fingerprintsOf({ sourceSha: a.sourceSha, settings: a.settings, metadata: meta }),
    outputs: a.present,
    includeEps: a.settings.includeEps,
  });
  return a.metadata === null && a.allowAi ? { ...plan, metadata: "generate" } : plan;
}

/** The bundle the commit pass reads (R07/R12/R21 — jobartifacts owns the rules). */
export function commitInputs(a: {
  plan: StagePlan | null; base: string; present: PresentOutputs; settings: ExportSettings;
  epsText: string | null; epsFailure: string | null;
}): CommitInputs {
  return {
    plan: a.plan, base: a.base, present: a.present, settings: a.settings,
    epsText: a.epsText, epsFailure: a.epsFailure,
  };
}
