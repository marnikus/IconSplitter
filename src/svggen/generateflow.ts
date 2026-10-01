// generateflow.ts — fold batch outcomes into a write plan (pure): which svg
// file to create, and the next sidecar per source. Versions always increment,
// invalid output records a failed version and writes nothing, missing results
// record nothing, and provider-reported usage is stored as actual while its
// absence stays null (spec §9/§10). The IO layer applies the plan.

import type { ChatUsage } from "../lib/requesty";
import type { ItemOutcome } from "../lib/svgbatch";
import { svgFileName } from "../lib/svgmanifest";
import { addVersion, emptySidecar, nextVersion, type Sidecar, type SvgVersionRec } from "../lib/svgsidecar";

export interface PlanSource {
  pairId: string;
  relDir: string;
  aiName: string;
  fingerprint: string;
}

export interface PlanMeta {
  batchId: string;
  requestId: string;
  prompt: string;
  provider: string;
  model: string;
  compositeHash: string | null;
  nowIso: string;
}

export interface PairPlan {
  pairId: string;
  relDir: string;
  aiName: string;
  sidecar: Sidecar;
  writeFile: { name: string; text: string } | null;
}

export interface PlanArgs {
  sources: PlanSource[];
  outcomes: ItemOutcome[];
  usage: ChatUsage | null;
  meta: PlanMeta;
  prev: Map<string, Sidecar | null>;
}

export function planOutcomes(a: PlanArgs): Map<string, PairPlan> {
  const byId = new Map(a.sources.map((s) => [s.pairId, s]));
  const out = new Map<string, PairPlan>();
  for (const o of a.outcomes) {
    const src = byId.get(o.sourceId);
    if (!src) continue;
    out.set(src.pairId, planOne({ src, o, usage: a.usage, meta: a.meta, prior: a.prev.get(src.pairId) ?? null }));
  }
  return out;
}

interface OneArgs { src: PlanSource; o: ItemOutcome; usage: ChatUsage | null; meta: PlanMeta; prior: Sidecar | null }

function planOne(a: OneArgs): PairPlan {
  const { src, o, usage, meta } = a;
  const sidecar = a.prior ?? emptySidecar(src.pairId, `${src.relDir}/${src.aiName}`, src.fingerprint);
  if (o.kind === "missing" || o.kind === "unmapped") return { ...src, sidecar, writeFile: null };
  if (o.kind === "invalid") return { ...src, sidecar: addVersion(sidecar, failedRec(sidecar, o, meta)), writeFile: null };
  const version = nextVersion(sidecar);
  return { ...src, sidecar: addVersion(sidecar, versionRec({ version, src, o, usage, meta })), writeFile: { name: svgFileName(src.aiName, version), text: o.svg ?? "" } };
}

function versionRec(a: { version: number; src: PlanSource; o: ItemOutcome; usage: ChatUsage | null; meta: PlanMeta }): SvgVersionRec {
  const { version, src, o, usage, meta } = a;
  return {
    version, file: svgFileName(src.aiName, version), createdAt: meta.nowIso, prompt: meta.prompt,
    provider: meta.provider, model: meta.model, batchId: meta.batchId, requestId: meta.requestId,
    position: o.position, compositeHash: meta.compositeHash,
    tokensIn: usage?.tokensIn ?? null, tokensOut: usage?.tokensOut ?? null, tokensTotal: usage?.tokensTotal ?? null,
    cost: usage?.cost ?? null, costKind: usage && usage.cost != null ? "actual" : null,
    validationOk: true, validationWarnings: o.validation?.warnings ?? [], review: "pending",
    status: "generated", safeError: null,
  };
}

function failedRec(sidecar: Sidecar, o: ItemOutcome, meta: PlanMeta): SvgVersionRec {
  return {
    version: nextVersion(sidecar), file: "", createdAt: meta.nowIso, prompt: meta.prompt,
    provider: meta.provider, model: meta.model, batchId: meta.batchId, requestId: meta.requestId,
    position: o.position, compositeHash: meta.compositeHash,
    tokensIn: null, tokensOut: null, tokensTotal: null, cost: null, costKind: null,
    validationOk: false, validationWarnings: o.validation?.warnings ?? [], review: "pending",
    status: "failed", safeError: o.reasons.join("; ").slice(0, 200),
  };
}
