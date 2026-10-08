// types.ts — the EPS converter port (I-59…I-61): ids the dropdown stores,
// the convert request/result, and CliHost — the only way Inkscape runs.
// The browser never spawns; a host is injected (loopback helper or a test fake).

import type { EpsBoundingBox, EpsOptions } from "../epsdoc";

export type ConverterId = "builtin" | "inkscape";
export type VerifyProfile = "eps10" | "generic";

export interface ConvertRequest {
  svgText: string;
  background: string;
  opts: EpsOptions;
  signal?: AbortSignal;
}

export type ConvertResult =
  | { ok: true; eps: string; writer: string; boundingBox: EpsBoundingBox | null; shapes: number; fixes: string[]; engine?: string }
  | { ok: false; reason: string; writer: string };

export interface ProbeResult {
  ok: boolean;
  reason: string;
  version?: string;
}

export interface InkscapeJob {
  svgText: string;
  title: string;
}

export type InkscapeRun =
  | { ok: true; eps: string; version: string; argv: string[] }
  | { ok: false; reason: string };

/** The spawn/HTTP seam. Tests inject a fake; production uses loopbackHost. */
export interface CliHost {
  probe(id: ConverterId): Promise<ProbeResult>;
  runInkscape(job: InkscapeJob, signal?: AbortSignal): Promise<InkscapeRun>;
}
