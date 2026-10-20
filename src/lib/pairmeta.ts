// pairmeta.ts — one JSON per image pair, in the folder that holds it (I-41/I-42).
// Owns: the pair's identity and both image faces, the pair's own decision ("may
// this AI image be generated from?"), and the SVG history that belongs to it —
// versions, generation status, review, tokens, cost. There is deliberately NO
// global metadata file: the pair's record travels with the images, so a copied
// or renamed folder keeps its approvals. Pure: parsing, serializing and the
// transition rules only (RULE 1/3).

import { isRecord } from "./isrecord";
import { readPreferred } from "./pairpreferred";
import { parseAiName } from "./naming";
import { pairId } from "./pairing";
import type { Decision } from "./reviewfilter";
import type { ReviewStatus } from "./svgmodel";
import type { ReviewRecord } from "./reviewfile";
import { svgStem } from "./svgfile";
import { aiSideName, baseName } from "./pairpath";
import { isReview, parseVersion, type SvgVersion } from "./svgmodel";
import { parseImageVersions, type ImageVersion } from "./svgimgreg";
import type { ReviewPair, SideRef } from "./pairing";

export { metaFileName, metaPathForAi, metaPathFor, pairIdOfMetaPath } from "./pairpath";

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
  /**
   * The ITEM's review status (2026-10-20): one status for the whole row, shared
   * by every version. Switching the version you look at never changes it; a
   * decision writes it here. The versions' own `review` key stays in the stored
   * shape for older readers and is kept in step with this one.
   */
  review: ReviewStatus;
  versions: SvgVersion[];
  /**
   * The version the user chose to show (I-54) — an ADDITIVE field, so `v` stays
   * 2: a build that predates it ignores the key, and a file without the key
   * means "nobody chose" (the newest valid version is shown). Never a delete
   * switch — the history under `versions` is what makes every choice re-choosable.
   */
  preferred: number | null;
  /**
   * The pair's regenerated AI images (2026-10-16) and the one shown as MAIN —
   * ADDITIVE like `preferred` (I-54): `v` stays 2, a build that predates the
   * keys ignores them, and an absent `imagePreferred` means "the original AI
   * image is main". Nothing is ever deleted; the original file is untouched.
   */
  imageVersions: ImageVersion[];
  imagePreferred: number | null;
}

export type MetaParse = { ok: true; meta: PairMeta } | { ok: false };

export interface NewMetaArgs extends PairIdentity {
  ai: PairSide;
  source: PairSide | null;
}

export function newPairMeta(args: NewMetaArgs): PairMeta {
  return { v: PAIR_META_VERSION, ...args, decision: null, reviewedAt: null, review: "pending", versions: [], preferred: null, imageVersions: [], imagePreferred: null };
}

/** A side as the pair file stores it; the path drives name and stem. */
export function sideOf(relPath: string, fingerprint: string): PairSide {
  return { relPath, name: baseName(relPath), fingerprint };
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
 * generation must never drop an approval (and vice versa, I-41). A GENERATED
 * attempt sets the item's one review status (a fresh SVG needs reviewing); a
 * failed one changes neither the status nor the versions' mirror.
 */
export function withVersion(meta: PairMeta, rec: SvgVersion): PairMeta {
  const rest = meta.versions.filter((v) => v.version !== rec.version);
  const review = rec.status === "generated" ? rec.review : meta.review;
  const versions = [...rest, rec].sort((a, b) => a.version - b.version).map((v) => ({ ...v, review }));
  return { ...meta, review, versions };
}

/**
 * The item's review status changes — once, for every version it has (2026-10-20).
 * The versions' own key is mirrored so a reader that predates the item-level
 * field still sees one consistent answer.
 */
export function withReview(meta: PairMeta, review: ReviewStatus): PairMeta {
  return { ...meta, review, versions: meta.versions.map((v) => (v.review === review ? v : { ...v, review })) };
}

/**
 * The status of a file written before the item-level field existed: the last
 * version anyone decided (the newest decision wins), else pending.
 */
export function derivedReview(versions: readonly SvgVersion[]): ReviewStatus {
  const decided = versions.filter((v) => v.review !== "pending");
  return decided.length > 0 ? decided[decided.length - 1].review : "pending";
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
    // The item's ONE review status; older builds ignore it and read the mirror
    // each version still carries (no version bump, additive like `preferred`).
    review: meta.review,
    // Written even when null: the key's presence documents the choice, and a
    // reader that predates it ignores an unknown key (I-54, no version bump).
    preferred: meta.preferred,
    versions: meta.versions,
    imageVersions: meta.imageVersions,
    imagePreferred: meta.imagePreferred,
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
  const versions = (raw.versions as unknown[]).flatMap((v) => parseVersion(v) ?? []);
  return {
    ok: true,
    meta: {
      v: PAIR_META_VERSION, id, base, suffix: str(pair.suffix), dirPath: str(pair.dir),
      ai: toSide(raw.ai),
      source: isRecord(raw.source) ? toSide(raw.source) : null,
      decision: toDecision(raw.decision),
      reviewedAt: nullableStr(raw.reviewedAt),
      preferred: readPreferred(raw.preferred),
      review: isReview(raw.review) ? raw.review : derivedReview(versions),
      versions,
      imageVersions: parseImageVersions(raw.imageVersions),
      imagePreferred: typeof raw.imagePreferred === "number" && Number.isFinite(raw.imagePreferred) ? raw.imagePreferred : null,
    },
  };
}

/** v1 -> v2: the old file's `source` WAS the AI image (design §2.1). */
export function pairMetaFromLegacy(raw: Record<string, unknown>): MetaParse {
  const ai = toSide(raw.source);
  if (ai.relPath === "") return { ok: false };
  const dirPath = dirOf(ai.relPath);
  const named = nameParts(ai.relPath);
  const versions = (raw.versions as unknown[]).flatMap((v) => parseVersion(v) ?? []);
  return {
    ok: true,
    meta: {
      v: PAIR_META_VERSION,
      id: pairId(dirPath, named.base, named.suffix),
      ...named, dirPath,
      ai, source: null, decision: null, reviewedAt: null, preferred: null, imageVersions: [], imagePreferred: null,
      review: derivedReview(versions),
      versions,
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
