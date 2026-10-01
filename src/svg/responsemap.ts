// responsemap.ts — strict structured/numbered SVG extraction. Missing, duplicate,
// unknown or mismatched IDs are rejected; no mapping ever falls back to order.

import { extractSvgDocuments, sanitizeSvg } from "../lib/svgvalidate";
import type { SvgManifestItem, SvgOutput } from "./types";

interface MappingIssue {
  positionId: number | null;
  kind: "missing" | "duplicate" | "unknown" | "out-of-range" | "invalid";
  message: string;
}

export interface MappingResult {
  outputs: SvgOutput[];
  issues: MappingIssue[];
  missing: number[];
}

interface Candidate {
  positionId: number;
  title: string;
  svg: string;
}

interface CandidateState {
  expected: Map<number, SvgManifestItem>;
  seen: Map<number, Candidate>;
  duplicate: Set<number>;
  issues: MappingIssue[];
}

export function mapSvgResponse(text: string, manifest: SvgManifestItem[]): MappingResult {
  const parsed = structuredCandidates(text) ?? numberedCandidates(text);
  if (!parsed) return noContract(manifest);
  return validateCandidates(parsed, manifest);
}

function structuredCandidates(text: string): Candidate[] | null {
  const raw = stripJsonFence(text);
  try {
    const body: unknown = JSON.parse(raw);
    if (!isRecord(body) || !Array.isArray(body.icons)) return null;
    return body.icons.map(toCandidate).filter((candidate): candidate is Candidate => candidate !== null);
  } catch {
    return null;
  }
}

function numberedCandidates(text: string): Candidate[] | null {
  const pattern = /^\s*(?:#{1,3}\s*)?Position ID:\s*(\d+)\s*[—:-]\s*(.+?)\s*\r?\n```(?:svg)?\s*\r?\n([\s\S]*?)```/gim;
  const found: Candidate[] = [];
  for (const match of text.matchAll(pattern)) {
    found.push({ positionId: Number(match[1]), title: match[2].trim(), svg: match[3].trim() });
  }
  return found.length ? found : null;
}

function validateCandidates(candidates: Candidate[], manifest: SvgManifestItem[]): MappingResult {
  const state: CandidateState = {
    expected: new Map(manifest.map((item) => [item.positionId, item])),
    seen: new Map(), duplicate: new Set(), issues: [],
  };
  for (const candidate of candidates) classifyCandidate(candidate, state);
  const outputs = validatedOutputs(manifest, state.seen, state.duplicate, state.issues);
  const mapped = new Set(outputs.map((output) => output.positionId));
  const missing = manifest.filter((item) => !mapped.has(item.positionId)).map((item) => item.positionId);
  addMissingIssues(missing, state.duplicate, state.issues);
  return { outputs, issues: state.issues, missing };
}

function classifyCandidate(candidate: Candidate, state: CandidateState): void {
  const source = state.expected.get(candidate.positionId);
  if (!validPositionId(candidate.positionId)) return report(state, candidate, "out-of-range", "Position ID is invalid.");
  if (!source) return report(state, candidate, "unknown", "Position ID is not in this batch.");
  if (state.seen.has(candidate.positionId)) return reportDuplicate(state, candidate);
  if (candidate.title !== source.filename) return report(state, candidate, "invalid", "Declared title does not exactly match the source filename.");
  state.seen.set(candidate.positionId, candidate);
}

function validPositionId(positionId: number): boolean {
  return Number.isInteger(positionId) && positionId >= 1;
}

function reportDuplicate(state: CandidateState, candidate: Candidate): void {
  state.duplicate.add(candidate.positionId);
  report(state, candidate, "duplicate", "Duplicate position ID; neither result was assigned.");
}

function report(state: CandidateState, candidate: Candidate, kind: MappingIssue["kind"], message: string): void {
  state.issues.push({ positionId: candidate.positionId, kind, message });
}

function validatedOutputs(
  manifest: SvgManifestItem[], seen: Map<number, Candidate>, duplicate: Set<number>, issues: MappingIssue[],
): SvgOutput[] {
  const outputs: SvgOutput[] = [];
  for (const item of manifest) {
    const candidate = seen.get(item.positionId);
    if (!candidate || duplicate.has(item.positionId)) continue;
    const roots = extractSvgDocuments(candidate.svg);
    const checked = roots.length === 1 ? sanitizeSvg(roots[0], item.filename) : null;
    if (!checked?.ok) {
      issues.push({ positionId: item.positionId, kind: "invalid", message: checked?.error ?? "Expected exactly one SVG root." });
      continue;
    }
    outputs.push({ positionId: item.positionId, declaredTitle: candidate.title, svg: checked.svg });
  }
  return outputs;
}

function addMissingIssues(missing: number[], duplicate: Set<number>, issues: MappingIssue[]): void {
  for (const positionId of missing) {
    if (duplicate.has(positionId)) continue;
    issues.push({ positionId, kind: "missing", message: "No valid mapped SVG was returned for this position." });
  }
}

function toCandidate(raw: unknown): Candidate | null {
  if (!isRecord(raw) || typeof raw.position_id !== "number" || typeof raw.title !== "string" || typeof raw.svg !== "string") return null;
  return { positionId: raw.position_id, title: raw.title, svg: raw.svg };
}

function stripJsonFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

function noContract(manifest: SvgManifestItem[]): MappingResult {
  const missing = manifest.map((item) => item.positionId);
  return { outputs: [], missing, issues: [{ positionId: null, kind: "invalid", message: "Response had no explicit position IDs or structured SVG list." }] };
}
