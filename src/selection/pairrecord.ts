// pairrecord.ts — one decision record ⇄ one pair file. Owns the mapping between
// the two shapes: the file to write for a scanned pair, the file a legacy/undo
// record rebuilds on its own, and the questions a writer asks of a record
// ("is it locatable?", "which id do these paths name?"). Pure path arithmetic on
// PairMeta/ReviewRecord — no disk access, so it stays testable in isolation.

import { parseAiName } from "../lib/naming";
import { pairId, type ReviewPair, type SideRef } from "../lib/pairing";
import {
  metaPathForAi, newPairMeta, withDecision,
  type PairIdentity, type PairMeta, type PairSide,
} from "../lib/pairmeta";
import type { ReviewRecord } from "../lib/reviewfile";

/**
 * The pair file to write for a scanned pair: the decision the state holds (a
 * pending pair owns no record, I-13) added to the record already on disk, so
 * neither half can overwrite the other (I-41).
 */
export function metaForRecord(records: readonly ReviewRecord[], pair: ReviewPair, base: PairMeta): PairMeta {
  const rec = records.find((r) => r.pair_id === pair.pairId);
  return withDecision(base, rec?.decision ?? "pending", rec?.reviewed_at ?? "");
}

/** A fresh pair file for a scanned pair that has none yet. */
export function metaFor(pair: ReviewPair): PairMeta {
  return newPairMeta({
    id: pair.pairId, base: pair.base, suffix: pair.suffix, dirPath: pair.relDir,
    ai: pair.ai === null ? sideNameOf(pair) : { relPath: pair.ai.relPath, name: baseName(pair.ai.relPath), fingerprint: fp(pair.ai) },
    source: pair.source === null ? null : { relPath: pair.source.relPath, name: baseName(pair.source.relPath), fingerprint: fp(pair.source) },
  });
}

function sideNameOf(pair: ReviewPair): PairSide {
  const from = pair.source?.relPath ?? "";
  const ext = from.includes(".") ? from.slice(from.lastIndexOf(".")) : ".png";
  return { relPath: "", name: `${pair.base}_AI${pair.suffix}${ext}`, fingerprint: "" };
}

function fp(side: SideRef): string {
  return `${side.size}:${side.mtime}`;
}

function baseName(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}

/**
 * Where a decision record's pair file lives. Derived from the record's own paths
 * (the AI image when it has one, else the reference's AI name), so an undo from
 * another tab finds the file without a scan. A reference-only pair that carried
 * a batch suffix cannot be located from the record alone — the caller that saw
 * the pair uses `savePairDecision` instead.
 */
export function metaPathOf(rec: ReviewRecord): string {
  if (rec.ai_result !== null && rec.ai_result !== "") return metaPathForAi(rec.ai_result);
  if (rec.source !== null && rec.source !== "") return metaPathForAi(aiNameOf(rec.source));
  return "";
}

/** "split_01/icon.png" -> "split_01/icon_AI.png" (the name a healthy AI side has). */
function aiNameOf(sourceRelPath: string): string {
  const name = baseName(sourceRelPath);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : ".png";
  const base = parseAiName(name) ? stem.slice(0, -3) : stem;
  return `${base}_AI${ext}`;
}

/**
 * A pair file rebuilt from a record alone — the legacy/undo path, when the file
 * is missing or unreadable. The AI path names the identity (a record always
 * carries the AI path for a pair that has one); a reference-only record falls
 * back to its own pair id.
 */
export function metaFromRecord(rec: ReviewRecord): PairMeta {
  const identity = identityFromRecord(rec);
  return withDecision(newPairMeta({
    ...identity,
    source: rec.source === null ? null : { relPath: rec.source, name: baseName(rec.source), fingerprint: "" },
  }), rec.decision, rec.reviewed_at);
}

/** The half a record can always name: the identity and the AI face. */
function identityFromRecord(rec: ReviewRecord): PairIdentity & { ai: PairSide } {
  const aiRel = rec.ai_result ?? "";
  const name = aiRel === "" ? "" : baseName(aiRel);
  const parsed = name === "" ? null : parseAiName(name);
  const dirPath = aiRel === "" ? dirOf(rec.source ?? "") : dirOf(aiRel);
  return {
    id: rec.pair_id,
    base: parsed?.base ?? rec.pair_id,
    suffix: parsed?.suffix ?? "",
    dirPath,
    ai: { relPath: aiRel, name, fingerprint: "" },
  };
}

function dirOf(relPath: string): string {
  const at = relPath.lastIndexOf("/");
  return at < 0 ? "" : relPath.slice(0, at);
}

/** True when the record can be turned into a pair file (used by the writers). */
export function locatable(rec: ReviewRecord): boolean {
  return metaPathOf(rec) !== "";
}

/** Side identity a writer can rebuild from a path alone (pairing helper). */
export function identityOfPaths(dirPath: string, aiName: string): string {
  const parsed = parseAiName(aiName);
  return pairId(dirPath, parsed?.base ?? aiName, parsed?.suffix ?? "");
}
