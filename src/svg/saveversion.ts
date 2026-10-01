// saveversion.ts — validating, naming and storing ONE generated SVG version
// (prompt §10/§12/§13). Owns the write order that makes a bad result harmless:
// validate first (nothing invalid is ever written), then pick the next version
// from disk + sidecar, then write the new SVG file (never an overwrite), then
// update the sidecar. A validation failure or a write failure leaves the
// previous version and the previous sidecar exactly as they were.

import { probePath, writeFileNew, type DirHandleLike } from "../lib/fs";
import { countIcons } from "../lib/svgicons";
import { parseSvg, validateSvg } from "../lib/svgvalidate";
import {
  newSidecar, nextVersion, sidecarName, svgFileName, svgStem, withVersion,
  type BatchRef, type SvgSidecar, type SvgVersion,
} from "../lib/svgfile";
import type { Usage } from "../lib/svgrequest";
import { listSvgFiles } from "./sidecar";
import type { SvgSource } from "./sources";

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
  sidecar: SvgSidecar | null;
}

export type SaveOut =
  | { ok: true; version: number; svgPath: string; icons: number; warnings: string[]; sidecar: SvgSidecar }
  | { ok: false; error: string };

/** Validates, then writes the SVG and its sidecar record. Never overwrites. */
export async function saveSvgVersion(args: SaveArgs): Promise<SaveOut> {
  const check = validateSvg(args.code);
  if (!check.ok) return { ok: false, error: `invalid SVG: ${check.errors.join("; ")}` };
  const icons = iconCount(args.code);
  const existing = await listSvgFiles(args.root, args.source);
  const sidecar = args.sidecar ?? newSidecar({ relPath: args.source.relPath, name: args.source.name, fingerprint: args.source.fingerprint });
  const version = nextVersion(args.source.stem, existing, sidecar);
  const fileName = svgFileName(args.source.stem, version);
  const dir = await writeSvg(args, fileName);
  if (!dir.ok) return { ok: false, error: dir.error };
  const saved = { version, svgPath: joinPath(args.source.dirPath, fileName), icons, warnings: check.warnings };
  const record = toRecord(args, saved);
  const next = withVersion(sidecar, record);
  return { ok: true, version, svgPath: joinPath(args.source.dirPath, fileName), icons, warnings: check.warnings, sidecar: next };
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

/** The version record stored in the sidecar; `args` carries the request facts. */
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
    cost: { actual: args.usage.cost, estimated: null, currency: args.usage.currency, pricing: null },
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
  sidecar: SvgSidecar | null;
  status?: "failed" | "interrupted";
  usage?: Usage;
  batch?: BatchRef | null;
}

/**
 * Records a failed attempt in the sidecar WITHOUT writing an SVG file, so the
 * failure is visible after a restart while every previous version survives.
 */
export function recordFailure(args: FailArgs): SvgVersion {
  const version = Math.max(0, ...(args.sidecar?.versions ?? []).map((v) => v.version)) + 1;
  return {
    version,
    svgPath: "",
    status: args.status ?? "failed",
    review: "pending",
    prompt: args.prompt,
    provider: args.provider,
    model: args.model,
    requestedAt: args.requestedAt,
    completedAt: new Date().toISOString(),
    usage: args.usage ? { input: args.usage.input, output: args.usage.output, total: args.usage.total } : { input: null, output: null, total: null },
    cost: { actual: args.usage?.cost ?? null, estimated: null, currency: "USD", pricing: null },
    validation: { ok: false, errors: [args.error], warnings: [], icons: 0 },
    batch: args.batch ?? null,
    error: args.error,
    requestId: null,
  };
}

/** Sidecar name helper re-exported for the UI's "open file location" action. */
export function sidecarFileName(source: SvgSource): string {
  return sidecarName(svgStem(source.name));
}

function joinPath(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}

async function dirOf(root: DirHandleLike, dirPath: string): Promise<DirHandleLike | null> {
  return dirPath === "" ? root : probePath(root, dirPath);
}
