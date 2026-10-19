// pairmeta.ts — one JSON per image pair, in the folder that holds it (I-41/I-42).
// Owns: the pair's identity and both image faces, the pair's own decision ("may
// this AI image be generated from?"), the SVG history, and (since 2026-10-16)
// the additive fields that carry regenerated-AI-source history (parsed here,
// transitioned in lib/aimeta.ts). There is NO global metadata file: the pair's
// record travels with the images, so a copied or renamed folder keeps its
// approvals. Pure: parsing, serializing and the transition rules only (RULE 1/3).

import { isRecord } from "./isrecord";
import { readPreferred } from "./pairpreferred";
import { parseAiName } from "./naming";
import { pairId } from "./pairing";
import type { Decision } from "./reviewfilter";
import type { ReviewRecord } from "./reviewfile";
import { svgStem } from "./svgfile";
import { parseVersion, type SvgVersion } from "./svgmodel";
import { parseAiVersion, type AiVersion } from "./imgmodel";
import type { ReviewPair, SideRef } from "./pairing";

/** Wire version stays at 2 (additive: older readers ignore unknown keys). */
export const PAIR_META_VERSION = 2;
const LEGACY_VERSION = 1;

/** One image face as the pair file records it. */
export interface PairSide {
  relPath: string;
  name: string;
  fingerprint: string;
}

/** Identifies the pair everywhere (stable across moves, design I-42). */
export interface PairIdentity {
  id: string;
  base: string;
  suffix: string;
  dirPath: string;
}

/**
 * Pair file: identity + faces + pair decision + SVG history + additive AI
 * history (2026-10-16). null decision ≠ "pending" (pending is a deliberate
 * reset that must outlive the legacy fallback).
 */
export interface PairMeta extends PairIdentity {
  v: number;
  ai: PairSide;
  source: PairSide | null;
  decision: Decision | null;
  reviewedAt: string | null;
  versions: SvgVersion[];
  /**
   * The version the user chose to show (I-54) — an ADDITIVE field, so `v` stays
   * 2: a build that predates it ignores the key, and a file without the key
   * means "nobody chose" (the newest valid version is shown). Never a delete
   * switch — the history under `versions` is what makes every choice re-choosable.
   */
  preferred: number | null;
  /** Regenerated AI-source versions; v1 is the original file on disk. */
  aiVersions: AiVersion[];
  /** Chosen AI source version to display/use as SVG input — null = newest valid. */
  aiPreferred: number | null;
}

export type MetaParse = { ok: true; meta: PairMeta } | { ok: false };

export interface NewMetaArgs extends PairIdentity {
  ai: PairSide;
  source: PairSide | null;
}

export function newPairMeta(args: NewMetaArgs): PairMeta {
  return {
    v: PAIR_META_VERSION, ...args, decision: null, reviewedAt: null,
    versions: [], preferred: null, aiVersions: [], aiPreferred: null,
  };
}

/** `<AI stem>.svg.json` — the name beside the AI image. */
export function metaFileName(aiName: string): string {
  return `${svgStem(aiName)}.svg.json`;
}

/** meta path from an AI relPath. */
export function metaPathForAi(aiRelPath: string): string {
  if (aiRelPath === "") return "";
  const at = aiRelPath.lastIndexOf("/");
  const dir = at < 0 ? "" : aiRelPath.slice(0, at);
  const name = metaFileName(baseName(aiRelPath));
  return dir === "" ? name : `${dir}/${name}`;
}

/** meta path for a pair: AI side if present, else inferred name. */
export function metaPathFor(pair: ReviewPair): string {
  if (pair.ai === null && pair.source === null) return "";
  if (pair.ai !== null) return metaPathForAi(pair.ai.relPath);
  const aiName = aiSideName(pair);
  if (aiName === "") return "";
  const fileName = metaFileName(aiName);
  return pair.relDir === "" ? fileName : `${pair.relDir}/${fileName}`;
}

/** AI filename a pair without one would have (`fog_AI_9_01.png`). */
function aiSideName(pair: ReviewPair): string {
  const from = pair.source?.relPath ?? pair.base;
  if (from === "") return "";
  return `${pair.base}_AI${pair.suffix}${extOf(from)}`;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : ".png";
}

export function sideOf(relPath: string, fingerprint: string): PairSide {
  return { relPath, name: baseName(relPath), fingerprint };
}

function baseName(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}

export function identityOf(pair: ReviewPair): PairIdentity {
  return { id: pair.pairId, base: pair.base, suffix: pair.suffix, dirPath: pair.relDir };
}

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

function aiSideNameAt(pair: ReviewPair): string { return aiSideName(pair); }

function fingerprintOf(side: SideRef): string { return `${side.size}:${side.mtime}`; }

/** Pair id from a meta path — "" when the path doesn't look like a pair file. */
export function pairIdOfMetaPath(relPath: string): string {
  const at = relPath.lastIndexOf("/");
  const dir = at < 0 ? "" : relPath.slice(0, at);
  const file = relPath.slice(at + 1);
  if (!file.toLowerCase().endsWith(".svg.json")) return "";
  const stem = file.slice(0, -".svg.json".length);
  const parsed = parseAiName(`${stem}.png`);
  return parsed === null ? "" : pairId(dir, parsed.base, parsed.suffix);
}

/** Stored decision as record entry (I-13: pending owns no record). */
export function toRecord(meta: PairMeta, pair: ReviewPair): ReviewRecord | null {
  if (meta.decision === null || meta.decision === "pending") return null;
  if (pair.source === null && pair.ai === null) return null;
  return {
    pair_id: meta.id,
    source: pair.source?.relPath ?? null,
    ai_result: pair.ai?.relPath ?? null,
    decision: meta.decision,
    reviewed_at: meta.reviewedAt ?? new Date(0).toISOString(),
  };
}

/** Apply a pair decision, leaving SVG/AI history intact. */
export function withDecision(meta: PairMeta, decision: Decision, nowIso: string): PairMeta {
  return { ...meta, decision, reviewedAt: nowIso };
}

/** Add or replace one SVG version; pair identity stays intact (I-41). */
export function withVersion(meta: PairMeta, rec: SvgVersion): PairMeta {
  const rest = meta.versions.filter((v) => v.version !== rec.version);
  return { ...meta, versions: [...rest, rec].sort((a, b) => a.version - b.version) };
}

export function serializePairMeta(meta: PairMeta): string {
  return JSON.stringify(toJson(meta), null, 2);
}

function toJson(meta: PairMeta): Record<string, unknown> {
  return {
    v: PAIR_META_VERSION,
    pair: { id: meta.id, base: meta.base, suffix: meta.suffix, dir: meta.dirPath },
    ai: meta.ai, source: meta.source, decision: meta.decision, reviewedAt: meta.reviewedAt,
    preferred: meta.preferred, versions: meta.versions,
    aiVersions: meta.aiVersions, aiPreferred: meta.aiPreferred,
  };
}

/**
 * Parse a pair file: v2 (current), or legacy v1 (source WAS the AI image).
 * Refuses junk; half-damaged version lists keep every record that parses (RULE 13).
 */
export function parsePairMeta(text: string): MetaParse {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false }; }
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
      ai: toSide(raw.ai), source: isRecord(raw.source) ? toSide(raw.source) : null,
      decision: toDecision(raw.decision), reviewedAt: nullableStr(raw.reviewedAt),
      preferred: readPreferred(raw.preferred),
      versions: (raw.versions as unknown[]).flatMap((x) => parseVersion(x) ?? []),
      aiVersions: Array.isArray(raw.aiVersions)
        ? (raw.aiVersions as unknown[]).flatMap((x) => parseAiVersion(x) ?? []) : [],
      aiPreferred: readPreferred(raw.aiPreferred),
    },
  };
}

/** v1 → v2: old `source` was the AI image; AI history defaults empty. */
export function pairMetaFromLegacy(raw: Record<string, unknown>): MetaParse {
  const ai = toSide(raw.source);
  if (ai.relPath === "") return { ok: false };
  const dirPath = dirOf(ai.relPath);
  const named = nameParts(ai.relPath);
  return {
    ok: true,
    meta: {
      v: PAIR_META_VERSION, id: pairId(dirPath, named.base, named.suffix), ...named, dirPath,
      ai, source: null, decision: null, reviewedAt: null, preferred: null,
      versions: (raw.versions as unknown[]).flatMap((x) => parseVersion(x) ?? []),
      aiVersions: [], aiPreferred: null,
    },
  };
}

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

function stem(name: string): string { return svgStem(name); }
function str(value: unknown): string { return typeof value === "string" ? value : ""; }
function nullableStr(value: unknown): string | null { return typeof value === "string" ? value : null; }
