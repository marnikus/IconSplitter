// pairmeta.ts — one JSON per image pair, in the folder that holds it (I-41/I-42).
// Owns: the pair's identity and both image faces, the pair's own decision ("may
// this AI image be generated from?"), and the SVG history that belongs to it —
// versions, generation status, review, tokens, cost. There is deliberately NO
// global metadata file: the pair's record travels with the images, so a copied
// or renamed folder keeps its approvals. Pure: parsing, serializing and the
// transition rules only (RULE 1/3).

import { isRecord } from "./isrecord";
import { parseAiName } from "./naming";
import { pairId } from "./pairing";
import { svgStem } from "./svgfile";
import type { Decision } from "./reviewfilter";
import type { ReviewRecord } from "./reviewfile";
import { pairMetaFromLegacy, LEGACY_VERSION } from "./pairmetalegacy";
import { parseVersion, type SvgVersion } from "./svgmodel";
import type { ReviewPair, SideRef } from "./pairing";

export { pairMetaFromLegacy } from "./pairmetalegacy";

/** Bump when the stored shape changes; a reader must understand both. */
export const PAIR_META_VERSION = 3;
/** v2 carried no preferred version (2026-10-05); it reads as "no preference". */
const PREVIOUS_VERSION = 2;

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
  /**
   * The version the user picked to preview (2026-10-05); null = the newest
   * valid one. A choice, never a deletion: every version stays in `versions`.
   */
  preferredVersion: number | null;
  versions: SvgVersion[];
}

export type MetaParse = { ok: true; meta: PairMeta } | { ok: false };

export interface NewMetaArgs extends PairIdentity {
  ai: PairSide;
  source: PairSide | null;
}

export function newPairMeta(args: NewMetaArgs): PairMeta {
  return {
    v: PAIR_META_VERSION, ...args, decision: null, reviewedAt: null,
    preferredVersion: null, versions: [],
  };
}

/** The preferred version of a stored pair file; null means "newest valid". */
export function preferredVersionOf(meta: PairMeta): number | null {
  return meta.preferredVersion;
}

/** Choosing a version leaves the versions themselves exactly as they were. */
export function withPreference(meta: PairMeta, version: number | null): PairMeta {
  return { ...meta, preferredVersion: version };
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

function baseName(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
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

/** The stored decision as a record entry (I-13: pending owns no record). */
export function toRecord(meta: PairMeta, pair: ReviewPair): ReviewRecord | null {
  if (meta.decision === null || meta.decision === "pending") return null;
  if (pair.source === null && pair.ai === null) return null; // a record must name a file
  return {
    pair_id: meta.id,
    source: pair.source?.relPath ?? null,
    ai_result: pair.ai?.relPath ?? null,
    decision: meta.decision,
    reviewed_at: meta.reviewedAt ?? new Date(0).toISOString(),
  };
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
    preferredVersion: meta.preferredVersion,
    versions: meta.versions,
  };
}

/**
 * Reads a pair file: v2 as it is, a legacy v1 sidecar as this pair's file (its
 * versions kept, the AI face taken from the stored source, the identity derived
 * from that path). A file that is not either shape is refused; a half-damaged
 * version list keeps every record that still parses (RULE 13).
 */
export function parsePairMeta(text: string): MetaParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  if (!isRecord(raw) || !Array.isArray(raw.versions)) return { ok: false };
  if (raw.v === LEGACY_VERSION) return pairMetaFromLegacy(raw);
  if (raw.v !== PAIR_META_VERSION && raw.v !== PREVIOUS_VERSION) return { ok: false };
  if (!isRecord(raw.pair)) return { ok: false };
  return readV2(raw);
}

/** The v2/v3 shape; `preferredVersion` is only present in a v3 file. */
function readV2(raw: Record<string, unknown>): MetaParse {
  const pair = raw.pair as Record<string, unknown>;
  const id = str(pair.id);
  const base = str(pair.base);
  if (id === "" || base === "") return { ok: false };
  return {
    ok: true,
    meta: {
      v: PAIR_META_VERSION, id, base, suffix: str(pair.suffix), dirPath: str(pair.dir),
      ai: toSide(raw.ai),
      source: isRecord(raw.source) ? toSide(raw.source) : null,
      decision: toDecision(raw.decision),
      reviewedAt: nullableStr(raw.reviewedAt),
      preferredVersion: toPreferred(raw.preferredVersion),
      versions: (raw.versions as unknown[]).flatMap((v) => parseVersion(v) ?? []),
    },
  };
}

function toSide(raw: unknown): PairSide {
  const r = isRecord(raw) ? raw : {};
  return { relPath: str(r.relPath), name: str(r.name), fingerprint: str(r.fingerprint) };
}

/** Only a positive integer names a version; anything else is no preference. */
function toPreferred(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function toDecision(value: unknown): Decision | null {
  return value === "pending" || value === "approved" || value === "declined" ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
