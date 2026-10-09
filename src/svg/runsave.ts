// runsave.ts — the per-request writers of a generation run: map every returned
// SVG block back to its source BY POSITION (never by guess), save each valid
// result as the next version beside its images, record an invalid one instead
// of writing it, and keep the pair file and the in-memory copy in step (I-41/
// I-43, RULE 24). One request's missing positions stay pending; one failed
// write never touches the other items (RULE 5).

import { batchManifest } from "../lib/svgbatch";
import { extractSvgBlocks, matchBlocks } from "../lib/svgextract";
import { allocateUsage } from "../lib/svgusage";
import { type PairMeta } from "../lib/pairmeta";
import { saveMetaAt } from "../selection/pairstore";
import { metaAfterFailure, saveSvgVersion, type SaveArgs } from "./saveversion";
import type { Usage } from "../lib/svgrequest";
import type { SvgSource } from "./sources";
import type { BatchCtx } from "./runbatch";

export async function saveMatches(ctx: BatchCtx, text: string, usage: Usage): Promise<void> {
  const matched = matchBlocks(extractSvgBlocks(text), batchManifest(ctx.plan.items));
  ctx.state.usages.push(usage);
  ctx.usage = usage;
  ctx.share = allocateUsage(usage, ctx.items.length);
  for (const item of ctx.items) {
    const position = ctx.plan.items.find((i) => i.sourceId === item.id)?.position ?? 0;
    const code = matched.byPosition.get(position);
    if (code === undefined) await missOne(ctx, item, position);
    else await saveOne(ctx, item, position, code);
  }
}

/** A position the provider did not answer stays pending — never guessed at. */
async function missOne(ctx: BatchCtx, item: SvgSource, position: number): Promise<void> {
  const { state, plan } = ctx;
  ctx.tally.missing++;
  state.missing++;
  state.problems.push(`${item.name}: no SVG returned for position ${position}`);
  state.args.onEvent({ kind: "item-failed", batchId: plan.id, position, sourceId: item.id, error: "no SVG returned for this position", failure: "malformed", retryAfterMs: null });
}

async function saveOne(ctx: BatchCtx, item: SvgSource, position: number, code: string): Promise<void> {
  const { state, plan } = ctx;
  state.args.onEvent({ kind: "item-start", batchId: plan.id, position, sourceId: item.id });
  const meta = state.args.metas.get(item.id) ?? null;
  const usage = ctx.share ?? zeroUsage();
  const args: SaveArgs = {
    root: state.args.root, source: item, code, prompt: ctx.promptUsed || state.args.prompt,
    provider: "Requesty", model: state.args.config.model, requestedAt: new Date().toISOString(),
    usage, batch: toBatchRef(plan, position, ctx.hash, batchManifest(plan.items)), requestId: ctx.requestId, meta,
  };
  const out = await saveSvgVersion(args);
  if (!out.ok) return rejectOne(ctx, item, position, out.error);
  ctx.tally.saved++;
  state.saved++;
  const stored = await persist(state, item, out.meta);
  state.args.onEvent({ kind: "item-saved", batchId: plan.id, position, sourceId: item.id, version: out.version, icons: out.icons, warnings: out.warnings, usage, meta: stored });
}

/** An invalid result is recorded, never written as a successful version. */
async function rejectOne(ctx: BatchCtx, item: SvgSource, position: number, error: string): Promise<void> {
  const meta = ctx.state.args.metas.get(item.id) ?? null;
  const { state, plan } = ctx;
  ctx.tally.failed++;
  state.invalid++;
  state.problems.push(`${item.name}: ${error}`);
  // A charged attempt keeps its share of the usage, and a pair without a file
  // gets one so no task can vanish without its cost (I-41).
  const next = metaAfterFailure({
    source: item, prompt: ctx.promptUsed || state.args.prompt, provider: "Requesty", model: state.args.config.model,
    requestedAt: new Date().toISOString(), error, meta, usage: ctx.share ?? zeroUsage(),
  });
  await persist(state, item, next);
  state.args.onEvent({ kind: "item-failed", batchId: plan.id, position, sourceId: item.id, error, failure: "malformed", retryAfterMs: null });
}

/** Writes the pair's own file and keeps the in-memory copy in step (RULE 24). */
async function persist(state: BatchCtx["state"], item: SvgSource, meta: PairMeta | null): Promise<PairMeta | null> {
  if (!meta) return null;
  state.args.metas.set(item.id, meta);
  try {
    await saveMetaAt(state.args.root, item.metaPath, meta);
  } catch {
    state.problems.push(`${item.name}: its pair file could not be written — the SVG is saved, retry the save`);
  }
  return meta;
}

function toBatchRef(plan: BatchCtx["plan"], position: number, hash: string, manifest: ReturnType<typeof batchManifest>): SaveArgs["batch"] {
  return { batchId: plan.id, position, compositeHash: hash, manifest: manifest.map((m) => `${m.position} — ${m.name}`).join("\n") };
}

export function zeroUsage(): Usage {
  return { input: null, output: null, total: null, cost: null, currency: "USD" };
}
