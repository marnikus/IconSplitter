// pairmeta.ts — one JSON per image pair, in the folder that holds it (I-41/I-42).
// Owns: the pair's identity and both image faces, the pair's own decision ("may
// this AI image be generated from?"), and the SVG history that belongs to it —
// versions, generation status, review, tokens, cost. There is deliberately NO
// global metadata file: the pair's record travels with the images, so a copied
// or renamed folder keeps its approvals. Pure: the model, serializing and the
// transition rules only (RULE 1/3) — reading is lib/pairfile, the merge with
// the legacy fallback is lib/pairmerge.

import { parseAiName } from "./naming";
import { pairId } from "./pairing";
import type { Decision } from "./reviewfilter";
import { svgStem } from "./svgfile";
import type { SvgVersion } from "./svgmodel";
import type { ReviewPair, SideRef } from "./pairing";

/** Bump when the stored shape changes; a reader must understand both. */
export const PAIR_META_VERSION = 2;

/** One image face as the pair file records it. */
export interface PairSide {
  relPath: string;
  name: string;
  fingerprint: string;
}

/** What identifies the pair everywhere (stable across a move, design I-42). */
export interface PairIdentity {
  id: string;
  base: string;
  suffix: string;
  dirPath: string;
}

/**
 * The pair's file: identity + faces + the pair decision + every SVG version.
 * `decision` is null when nobody ever decided (a legacy file carries versions
 * but no pair decision) — null and "pending" are different: pending is a
 * deliberate reset that must outlive the legacy fallback.
 */
export interface PairMeta extends PairIdentity {
  v: number;
  ai: PairSide;
  source: PairSide | null;
  decision: Decision | null;
  reviewedAt: string | null;
  versions: SvgVersion[];
}

export type MetaParse = { ok: true; meta: PairMeta } | { ok: false };

export interface NewMetaArgs extends PairIdentity {
  ai: PairSide;
  source: PairSide | null;
}

export function newPairMeta(args: NewMetaArgs): PairMeta {
  return { v: PAIR_META_VERSION, ...args, decision: null, reviewedAt: null, versions: [] };
}

/** `<AI stem>.svg.json` — the name that has always lived beside the AI image. */
export function metaFileName(aiName: string): string {
  return `${svgStem(aiName)}.svg.json`;
}

/** The same, from an AI image's path relative to the root. */
export function metaPathForAi(aiRelPath: string): string {
  if (aiRelPath === "") return "";
  const at = aiRelPath.lastIndexOf("/");
  const dir = at < 0 ? "" : aiRelPath.slice(0, at);
  const name = metaFileName(baseName(aiRelPath));
  return dir === "" ? name : `${dir}/${name}`;
}

/**
 * Where a pair's file lives, relative to the scanned root. A pair whose AI side
 * is gone is still located by the name that side would have, so the file beside
 * the reference keeps answering for it (design §2.1).
 */
export function metaPathFor(pair: ReviewPair): string {
  if (pair.ai === null && pair.source === null) return ""; // no face: nothing to name it after
  if (pair.ai !== null) return metaPathForAi(pair.ai.relPath);
  const aiName = aiSideName(pair);
  if (aiName === "") return "";
  const fileName = metaFileName(aiName);
  return pair.relDir === "" ? fileName : `${pair.relDir}/${fileName}`;
}

/** The AI image file name a pair without one would have (`fog_AI_9_01.png`). */
function aiSideName(pair: ReviewPair): string {
  const from = pair.source?.relPath ?? pair.base;
  if (from === "") return ""; // neither face exists: there is no name to build
  return `${pair.base}_AI${pair.suffix}${extOf(from)}`;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : ".png";
}

/** A side as the pair file stores it; the path drives name and stem. */
export function sideOf(relPath: string, fingerprint: string): PairSide {
  return { relPath, name: baseName(relPath), fingerprint };
}

/** The file name in a root-relative path (shared with the pair file's readers). */
export function baseName(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}

/** The directory in a root-relative path, "" for a root-level file. */
export function dirOf(relPath: string): string {
  const at = relPath.lastIndexOf("/");
  return at < 0 ? "" : relPath.slice(0, at);
}

/** The identity of the pair a photographed side belongs to. */
export function identityOf(pair: ReviewPair): PairIdentity {
  return { id: pair.pairId, base: pair.base, suffix: pair.suffix, dirPath: pair.relDir };
}

/** Fresh side data from a scanned pair: paths plus a size:mtime fingerprint. */
export function aiSideOf(pair: ReviewPair): PairSide {
  return sideFromPath(pair.ai?.relPath ?? aiSideNameAt(pair), pair.ai);
}

export function sourceSideOf(pair: ReviewPair): PairSide | null {
  const src = pair.source;
  if (src === null) return null;
  return { relPath: src.relPath, name: baseName(src.relPath), fingerprint: fingerprintOf(src) };
}

function sideFromPath(relPath: string, side: SideRef | null): PairSide {
  return { relPath, name: baseName(relPath), fingerprint: side === null ? "" : fingerprintOf(side) };
}

function aiSideNameAt(pair: ReviewPair): string {
  return aiSideName(pair);
}

function fingerprintOf(side: SideRef): string {
  return `${side.size}:${side.mtime}`;
}

/**
 * The pair id a pair file's path names — so a file that will not parse can still
 * be reported against the pair it belongs to (the extension is not part of the
 * id, so the name alone is enough). "" when the path is not a pair file.
 */
export function pairIdOfMetaPath(relPath: string): string {
  const at = relPath.lastIndexOf("/");
  const dir = at < 0 ? "" : relPath.slice(0, at);
  const file = relPath.slice(at + 1);
  if (!file.toLowerCase().endsWith(".svg.json")) return "";
  const stem = file.slice(0, -".svg.json".length);
  const parsed = parseAiName(`${stem}.png`);
  return parsed === null ? "" : pairId(dir, parsed.base, parsed.suffix);
}

/**
 * Re-seats a pair file onto the picked root (I-46): the stored identity and
 * root-relative paths were written for the root picked then, so a file read at
 * another pick level (the split output vs its stamp) re-derives them from where
 * the file sits now. The id comes from the file's own path, or from the intact
 * content's base/suffix in the file's dir when the name was renamed; the faces
 * and the version svg paths sit beside the file. Names, fingerprints, the
 * decision and the audit fields are untouched, and a file read at its home
 * level comes back unchanged.
 */
export function rebasePairMeta(meta: PairMeta, relPath: string): PairMeta {
  const dir = dirOf(relPath);
  return {
    ...meta,
    id: pairIdOfMetaPath(relPath) || pairId(dir, meta.base, meta.suffix),
    dirPath: dir,
    ai: reseat(meta.ai, dir),
    source: meta.source === null ? null : reseat(meta.source, dir),
    versions: meta.versions.map((v) => v.svgPath === "" ? v : { ...v, svgPath: joinDir(dir, baseName(v.svgPath)) }),
  };
}

/** A face beside the file — unless it never named a file at all (RULE 13). */
function reseat(side: PairSide, dir: string): PairSide {
  if (side.name === "" || side.relPath === "") return side;
  return { ...side, relPath: joinDir(dir, side.name) };
}

/** `dir/name`, without a leading slash for a root-level file. */
export function joinDir(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}

/** The pair decision, leaving the SVG history exactly as it was. */
export function withDecision(meta: PairMeta, decision: Decision, nowIso: string): PairMeta {
  return { ...meta, decision, reviewedAt: nowIso };
}

/**
 * One generation attempt recorded into the pair's file. The pair half — its
 * identity, its faces, its own decision — is carried over untouched, because a
 * generation must never drop an approval (and vice versa, I-41).
 */
export function withVersion(meta: PairMeta, rec: SvgVersion): PairMeta {
  const rest = meta.versions.filter((v) => v.version !== rec.version);
  return { ...meta, versions: [...rest, rec].sort((a, b) => a.version - b.version) };
}

/** The stored shape (design §2): identity under `pair`, faces beside it. */
export function serializePairMeta(meta: PairMeta): string {
  return JSON.stringify(toJson(meta), null, 2);
}

function toJson(meta: PairMeta): Record<string, unknown> {
  return {
    v: PAIR_META_VERSION,
    pair: { id: meta.id, base: meta.base, suffix: meta.suffix, dir: meta.dirPath },
    ai: meta.ai,
    source: meta.source,
    decision: meta.decision,
    reviewedAt: meta.reviewedAt,
    versions: meta.versions,
  };
}
