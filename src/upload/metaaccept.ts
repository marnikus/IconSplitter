// One acceptance gate for row and checked-only bulk actions. No model requests.
import { cleanMetadata, validateMetadata } from "../lib/upload/meta";
import { rememberMeta } from "./metacache";
import { log } from "../log/logstore";
import { namedSpec } from "./uploadlog";
import { runExportBatch } from "./exportactions";
import type { UploadCtx } from "./actions";
import type { Latest, UploadMetaState, UploadRow } from "./types";

/** Drafts and edited accepted fields need explicit review; pending rows do not. */
export function needsMetadataAcceptance(meta: UploadMetaState): boolean {
  return meta.metadata !== null && (meta.state === "generated" || meta.state === "invalid" || (meta.state === "accepted" && meta.edited));
}
export function idsAwaitingAcceptance(rows: readonly UploadRow[], ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  return rows.filter((row) => wanted.has(row.source.id) && needsMetadataAcceptance(row.meta)).map((row) => row.source.id);
}
/** Clean, validate, publish and persist exactly the fields the user reviewed. */
export function acceptMetadataRow(c: UploadCtx, row: UploadRow): UploadMetaState | null {
  if (row.meta.metadata === null) { c.say("Nothing to accept — generate metadata first", true); return null; }
  const metadata = cleanMetadata(row.meta.metadata);
  const validation = validateMetadata(metadata);
  if (!validation.ok) {
    c.dispatch({ type: "meta", id: row.source.id, meta: { ...row.meta, validation } });
    c.say(validation.errors.join("; "), true);
    return null;
  }
  const accepted: UploadMetaState = { ...row.meta, metadata, state: "accepted", validation, edited: false };
  c.dispatch({ type: "meta", id: row.source.id, meta: accepted });
  rememberMeta(row.sourceHash ?? "", { state: "accepted", meta: metadata });
  log(namedSpec({ id: row.source.id, base: row.source.base, model: c.m.gemini.model, tags: metadata.tags.length }));
  return accepted;
}
interface AcceptanceResult {
  accepted: Map<string, UploadMetaState>;
  reexport: string[];
  invalid: number;
  skipped: number;
}
function acceptCheckedRows(c: UploadCtx, ids: readonly string[]): AcceptanceResult {
  const wanted = new Set(ids);
  const result: AcceptanceResult = { accepted: new Map(), reexport: [], invalid: 0, skipped: 0 };
  for (const row of c.rows.filter((r) => wanted.has(r.source.id))) {
    if (!needsMetadataAcceptance(row.meta)) { result.skipped++; continue; }
    const accepted = acceptMetadataRow(c, row);
    if (accepted === null) { result.invalid++; continue; }
    result.accepted.set(row.source.id, accepted);
    if (row.record !== null) result.reexport.push(row.source.id);
  }
  return result;
}
/** All newly accepted states travel in ONE sequential re-export batch (RULE24). */
export async function acceptSelectedMetadata(latest: Latest, ids: readonly string[]): Promise<void> {
  const c = latest.current;
  if (ids.length === 0) return c.say("Select at least one icon first", true);
  if (c.m.busy !== null || c.refs.abortMeta.current !== null || c.refs.abortExport.current !== null) {
    return c.say("Wait for the current run before accepting metadata", true);
  }
  const result = acceptCheckedRows(c, ids);
  if (result.reexport.length) await runExportBatch(latest, result.reexport, result.accepted);
  latest.current.say(`Accepted metadata for ${result.accepted.size} icons · ${result.invalid} invalid · ${result.skipped} skipped`, result.invalid > 0);
}
