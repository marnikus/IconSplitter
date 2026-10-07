// jobsteps.ts — the two per-icon runs the panel's jobs slice calls
// (design §7/§16). They live apart from the hook so the hook stays the wiring
// (state, queue, dialogs) and these stay the SEQUENCE of one run:
//   · requestNames — verify the model against the provider's list, send ONE request,
//     store the answer. A model that cannot be verified sends nothing at all
//     (the request forbids silent substitution).
//   · publishExport — run the whole pipeline through the queue, store whatever
//     metadata came back, and report the row state the result implies.

import type { MetaRecord, MetaText } from "../lib/svgupload/metaprompt";
import type { JobKind } from "../lib/svgupload/rows";
import type { RunContext } from "./runupload";
import { providerCard } from "./runupload";
import { log } from "../log/logstore";
import { acceptSpec, exportSpec, rejectSpec } from "./uploadlog";
import { getMetaStore, putRecordOnStore } from "./metastore";
import type { JobDeps } from "./useUploadJobs";

export type CtxOf = (id: string, signal?: AbortSignal) => Promise<RunContext | null>;
export type MarkFn = (id: string, state: JobKind) => void;
export type SayFn = (note: string | null) => void;

/** The seams one step needs: real in the app, fakes in the DOM tests. */
export interface StepIo {
  deps: JobDeps;
  context: CtxOf;
  mark: MarkFn;
  say: SayFn;
  /** The naming run's own cancellation — absent means "nothing can cancel it". */
  signal?: AbortSignal;
}

/** One metadata run: verify the model, name the icon, store the answer. */
export async function requestNames(id: string, io: StepIo): Promise<void> {
  io.mark(id, "running");
  const ctx = await io.context(id, io.signal);
  if (ctx === null) { io.say("That icon has no usable SVG — nothing was sent."); io.mark(id, "failed"); return; }
  const card = providerCard({ config: ctx.config, catalog: ctx.catalog, model: ctx.metaStore.model });
  if (!card.choice.ok) { io.say(`Nothing was sent: ${card.choice.reason}`); io.mark(id, "failed"); return; }
  const out = await io.deps.nameOne({ ...ctx, metaStore: { ...ctx.metaStore, model: card.choice.model }, onProgress: (msg) => io.say(msg) });
  logName(out, ctx.row.exportBase, id, out.meta !== null);
  if (out.meta !== null) putRecordOnStore(getMetaStore(), out.record);
  io.say(out.meta === null ? `Metadata not accepted: ${out.error ?? "the answer was refused."}` : `Metadata accepted for ${ctx.row.exportBase}.`);
  io.mark(id, stateAfterName(out.meta !== null, io.signal));
}

/** A cancelled naming is cancelled, not failed: nothing about it needs review. */
function stateAfterName(accepted: boolean, signal?: AbortSignal): JobKind {
  if (accepted) return "queued";
  return signal?.aborted === true ? "cancelled" : "failed";
}

/** One export run: the pipeline result decides the row state. */
export async function publishExport(id: string, io: StepIo & { signal: AbortSignal }): Promise<{ state: Terminal; note: string }> {
  const ctx = await io.context(id, io.signal);
  if (ctx === null) return { state: "failed", note: "The icon cannot be exported: no usable SVG." };
  io.mark(id, "running");
  const out = await io.deps.exportOne(ctx);
  log(exportSpec({ id, base: ctx.row.exportBase, status: out.status, note: out.note }));
  if (out.meta !== null) putRecordOnStore(getMetaStore(), out.meta);
  io.say(out.note);
  const state = terminalOf(out.status);
  io.mark(id, state);
  return { state, note: out.note };
}

type Terminal = "processed" | "partial" | "failed" | "cancelled";

/** The naming outcome, in the one log: accepted names the model, refused says why. */
function logName(out: { record: MetaRecord; error?: string | null; meta: unknown }, base: string, id: string, accepted: boolean): void {
  if (accepted) {
    log(acceptSpec({ id, base, model: out.record.model, tags: out.record.tags.length }));
    return;
  }
  log(rejectSpec({ id, base, why: out.error ?? "the answer did not pass the policy" }));
}

/** The four terminal states the queue understands; anything else is a failure. */
export function terminalOf(status: string): Terminal {
  if (status === "processed" || status === "partial" || status === "cancelled") return status;
  return "failed";
}

export type { MetaRecord, MetaText };
