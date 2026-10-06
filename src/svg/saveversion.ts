// saveversion.ts — validating, naming and storing ONE generated SVG version
// (prompt §10/§12/§13). Owns the order that makes a bad result harmless:
// validate first (nothing invalid is ever written), then pick the next version
// from disk + the pair file's history, then write the new SVG file (never an
// overwrite) and hand back the pair's updated record — which keeps its identity,
// both faces and its own decision (I-41). Persisting that record is the caller's
// step, so a metadata write failure is reported without hiding the saved SVG.

import { probePath, writeFileNew, type DirHandleLike } from "../lib/fs";
import { countIcons } from "../lib/svgicons";
import { parseSvg, validateSvg } from "../lib/svgvalidate";
import { nextVersion, svgFileName } from "../lib/svgfile";
import type { BatchRef, SvgVersion } from "../lib/svgmodel";
import { withVersion, type PairMeta } from "../lib/pairmeta";
import { NO_USAGE, type Usage } from "../lib/svgrequest";
import { costInfoFor } from "../lib/svgpricing";
import { listSvgFiles } from "./svgfiles";
import { metaForSource, type SvgSource } from "./sources";

export interface SaveArgs {
  root: DirHandleLike;
  source: SvgSource;
  code: string;
  prompt: string;
  provider: string;
  model: string;
  requestedAt: string;
  usage: Usage;
  batch: BatchRef | null;
  requestId: string | null;
  /** The pair's own file content as read on this scan; null when there is none. */
  meta: PairMeta | null;
}

export type SaveOut =
  | { ok: true; version: number; svgPath: string; icons: number; warnings: string[]; meta: PairMeta }
  | { ok: false; error: string };

/** Validates, writes the SVG file, and returns the pair's record with it added. */
export async function saveSvgVersion(args: SaveArgs): Promise<SaveOut> {
  const check = validateSvg(args.code);
  if (!check.ok) return { ok: false, error: `invalid SVG: ${check.errors.join("; ")}` };
  const icons = iconCount(args.code);
  const existing = await listSvgFiles(args.root, args.source);
  const meta = args.meta ?? metaForSource(args.source, null);
  const version = nextVersion(args.source.stem, existing, meta.versions);
  const fileName = svgFileName(args.source.stem, version);
  const dir = await writeSvg(args, fileName);
  if (!dir.ok) return { ok: false, error: dir.error };
  const saved = { version, svgPath: joinPath(args.source.dirPath, fileName), icons, warnings: check.warnings };
  return {
    ok: true, ...saved,
    meta: withVersion(meta, toRecord(args, saved)),
  };
}

async function writeSvg(args: SaveArgs, fileName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const dir = await dirOf(args.root, args.source.dirPath);
  if (!dir) return { ok: false, error: "source folder is gone" };
  try {
    await writeFileNew(dir, fileName, new Blob([args.code], { type: "image/svg+xml" }));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "could not write the SVG file" };
  }
}

function iconCount(code: string): number {
  const doc = parseSvg(code).doc;
  return doc ? countIcons(doc).icons : 0;
}

/** The version record stored in the pair file; `args` carries the request facts. */
function toRecord(args: SaveArgs, saved: { version: number; svgPath: string; icons: number; warnings: string[] }): SvgVersion {
  return {
    version: saved.version,
    svgPath: saved.svgPath,
    status: "generated",
    review: "pending",
    prompt: args.prompt,
    provider: args.provider,
    model: args.model,
    requestedAt: args.requestedAt,
    completedAt: new Date().toISOString(),
    usage: { input: args.usage.input, output: args.usage.output, total: args.usage.total },
    cost: costInfoFor(args.model, args.usage),
    validation: { ok: true, errors: [], warnings: saved.warnings, icons: saved.icons },
    batch: args.batch,
    error: null,
    requestId: args.requestId,
  };
}

export interface FailArgs {
  source: SvgSource;
  prompt: string;
  provider: string;
  model: string;
  requestedAt: string;
  /** Redacted, human-safe reason — never a key, never a raw provider dump. */
  error: string;
  /** The pair's record, so the failure does not overwrite its decision or cost. */
  meta: PairMeta | null;
  status?: "failed" | "interrupted";
  usage?: Usage;
  batch?: BatchRef | null;
}

/**
 * The pair's record with a failed attempt added — WITHOUT writing an SVG file,
 * so the failure is visible after a restart while every previous version and the
 * pair's own decision survive.
 */
export function metaAfterFailure(args: FailArgs): PairMeta {
  return withVersion(args.meta ?? metaForSource(args.source, null), failureRecord(args));
}

function failureRecord(args: FailArgs): SvgVersion {
  const versions = args.meta?.versions ?? [];
  return {
    version: Math.max(0, ...versions.map((v) => v.version)) + 1,
    svgPath: "",
    status: args.status ?? "failed",
    review: "pending",
    prompt: args.prompt,
    provider: args.provider,
    model: args.model,
    requestedAt: args.requestedAt,
    completedAt: new Date().toISOString(),
    usage: args.usage ? { input: args.usage.input, output: args.usage.output, total: args.usage.total } : { input: null, output: null, total: null },
    cost: costInfoFor(args.model, args.usage ?? NO_USAGE),
    validation: { ok: false, errors: [args.error], warnings: [], icons: 0 },
    batch: args.batch ?? null,
    error: args.error,
    requestId: null,
  };
}

function joinPath(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}

async function dirOf(root: DirHandleLike, dirPath: string): Promise<DirHandleLike | null> {
  return dirPath === "" ? root : probePath(root, dirPath);
}
