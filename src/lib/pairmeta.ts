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
import type { Decision } from "./reviewfilter";
import type { ReviewRecord } from "./reviewfile";
import { svgStem } from "./svgfile";
import { parseVersion, type SvgVersion } from "./svgmodel";
import type { ReviewPair, SideRef } from "./pairing";

/** Bump when the stored shape changes; a reader must understand both. */
export const PAIR_META_VERSION = 2;
const LEGACY_VERSION = 1;

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

function baseName(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}

/** The identity of the pair a photographed side belongs to. */
export function identityOf(pair: ReviewPair): PairIdentity {
  return { id: pair.pairId, base: pair.base, suffix: pair.suffix, dirPath: pair.relDir };
}

/** Fresh side data from a scanned pair: paths plus a size:mtime fingerprint. */
export function aiSideOf(pair: ReviewPair): PairSide {
  return sideFromPath(pair.ai?.relPath ?? aiSideName(pair), pair.ai);
}

export function sourceSideOf(pair: ReviewPair): PairSide | null {
  const src = pair.source;
  if (src === null) return null;
  return { relPath: src.relPath, name: baseName(src.relPath), fingerprint: fingerprintOf(src) };
}

function sideFromPath(relPath: string, side: SideRef | null): PairSide {
  return { relPath, name: baseName(relPath), fingerprint: side === null ? "" : fingerprintOf(side) };
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

/** One pair file as the root that READ it sees it (I-44): the walk's identity
 * and face paths win over the stored ones, so a decision, a reset and the SVG
 * history mean the same thing at any level; a face the walk cannot see keeps
 * its stored path, and everything the pair owns is carried over untouched. */
export function forPair(meta: PairMeta, pair: ReviewPair): PairMeta {
  return {
    ...meta,
    id: pair.pairId, base: pair.base, suffix: pair.suffix, dirPath: pair.relDir,
    ai: faceOf(pair.ai) ?? meta.ai, source: faceOf(pair.source) ?? meta.source,
  };
}

/** A scanned side in the stored shape; null when the side is not on disk. */
function faceOf(side: SideRef | null): PairSide | null {
  return side === null ? null : sideOf(side.relPath, `${side.size}:${side.mtime}`);
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
  if (raw.v !== PAIR_META_VERSION || !isRecord(raw.pair)) return { ok: false };
  return readV2(raw);
}

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
      versions: (raw.versions as unknown[]).flatMap((v) => parseVersion(v) ?? []),
    },
  };
}

/** v1 -> v2: the old file's `source` WAS the AI image (design §2.1). */
export function pairMetaFromLegacy(raw: Record<string, unknown>): MetaParse {
  const ai = toSide(raw.source);
  if (ai.relPath === "") return { ok: false };
  const dirPath = dirOf(ai.relPath);
  const named = nameParts(ai.relPath);
  return {
    ok: true,
    meta: {
      v: PAIR_META_VERSION,
      id: pairId(dirPath, named.base, named.suffix),
      ...named, dirPath,
      ai, source: null, decision: null, reviewedAt: null,
      versions: (raw.versions as unknown[]).flatMap((v) => parseVersion(v) ?? []),
    },
  };
}

/** The pair's base and suffix, read from the AI image's own name. */
function nameParts(aiRelPath: string): { base: string; suffix: string } {
  const name = aiRelPath.split("/").pop() ?? "";
  const parsed = parseAiName(name);
  return { base: parsed?.base ?? stem(name), suffix: parsed?.suffix ?? "" };
}

function toSide(raw: unknown): PairSide {
  const r = isRecord(raw) ? raw : {};
  return { relPath: str(r.relPath), name: str(r.name), fingerprint: str(r.fingerprint) };
}

function toDecision(value: unknown): Decision | null {
  return value === "pending" || value === "approved" || value === "declined" ? value : null;
}

function dirOf(relPath: string): string {
  const at = relPath.lastIndexOf("/");
  return at < 0 ? "" : relPath.slice(0, at);
}

function stem(name: string): string {
  return svgStem(name);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
