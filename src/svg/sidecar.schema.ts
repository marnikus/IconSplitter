// sidecar.schema.ts — runtime validation for the persisted SVG sidecar schema.

import { isRecord } from "../lib/isrecord";
import { safeErrorText } from "./security";
import { containsCredential } from "./prefs";
import { stableSvgSourceId } from "./prompt";
import type { SvgManifestItem, SvgRequestRecord, SvgUsage, SvgValidationRecord, SvgVersionRecord } from "./types";

export function validEnvelope(raw: unknown, sourceId: string, sourcePath: string): raw is Record<string, unknown> {
  return matchesEnvelopeIdentity(raw, sourceId, sourcePath)
    && hasBoundedRecords(raw) && isHash(raw.sourceFingerprint) && isIso(raw.updatedAt);
}

function matchesEnvelopeIdentity(raw: unknown, sourceId: string, sourcePath: string): raw is Record<string, unknown> {
  return isRecord(raw) && raw.schemaVersion === 1 && raw.sourceId === sourceId
    && sourceId === stableSvgSourceId(sourcePath) && raw.sourcePath === sourcePath && safeRelativePath(sourcePath);
}

function hasBoundedRecords(raw: Record<string, unknown>): boolean {
  return Array.isArray(raw.requests) && raw.requests.length <= 1000
    && Array.isArray(raw.versions) && raw.versions.length <= 1000;
}

export function uniqueRequests(requests: SvgRequestRecord[]): boolean {
  return new Set(requests.map((item) => item.clientRequestId)).size === requests.length;
}

export function uniqueVersions(versions: SvgVersionRecord[]): boolean {
  return new Set(versions.map((item) => item.version)).size === versions.length;
}

export function versionsMatchRequests(versions: SvgVersionRecord[], requests: SvgRequestRecord[], sourceId: string, sourcePath: string): boolean {
  return versions.every((version) => version.requestId === "recovered" || requests.some((request) =>
    request.clientRequestId === version.requestId && request.manifest.some((item) => item.sourceId === sourceId
      && item.relativePath === sourcePath && item.fingerprint === version.sourceFingerprint
      && item.positionId === version.positionId)));
}


interface RequestFields {
  manifest: SvgManifestItem[] | null;
  usage: SvgUsage | null;
  clientRequestId: string | null;
  batchId: string | null;
  positionId: number | null;
  prompt: string | null;
  model: string | null;
  startedAt: string | null;
  finishedAt: string | null | undefined;
}

export function parseRequest(raw: unknown, sourcePath: string): SvgRequestRecord | null {
  if (!isRequestEnvelope(raw)) return null;
  const fields = readRequestFields(raw);
  if (!validRequestFields(fields, raw.status, sourcePath)) return null;
  return {
    clientRequestId: fields.clientRequestId!, providerRequestId: nonEmpty(raw.providerRequestId, 200),
    batchId: fields.batchId!, status: raw.status, positionId: fields.positionId!,
    compositeHash: string(raw.compositeHash, 200) ?? "", manifest: fields.manifest!, prompt: fields.prompt!,
    provider: "Requesty", model: fields.model!, startedAt: fields.startedAt!, finishedAt: fields.finishedAt!,
    usage: fields.usage!, costAllocation: "shared-batch-not-allocated", safeError: safeErrorText(raw.safeError),
  };
}

function isRequestEnvelope(raw: unknown): raw is Record<string, unknown> & { status: SvgRequestRecord["status"] } {
  return isRecord(raw) && status(raw.status) && raw.provider === "Requesty"
    && raw.costAllocation === "shared-batch-not-allocated";
}

function readRequestFields(raw: Record<string, unknown>): RequestFields {
  return {
    manifest: parseManifest(raw.manifest), usage: parseUsage(raw.usage),
    clientRequestId: nonEmpty(raw.clientRequestId, 200), batchId: nonEmpty(raw.batchId, 200),
    positionId: positiveInt(raw.positionId), prompt: string(raw.prompt, 12_000),
    model: nonEmpty(raw.model, 200), startedAt: isoString(raw.startedAt),
    finishedAt: nullableIsoString(raw.finishedAt),
  };
}

function validRequestFields(fields: RequestFields, state: SvgRequestRecord["status"], sourcePath: string): boolean {
  return hasRequestRecords(fields) && hasRequestIdentity(fields) && hasSafePrompt(fields)
    && requestMatchesSource(fields, sourcePath) && requestTimesMatchState(fields, state);
}

function hasRequestRecords(fields: RequestFields): boolean {
  return fields.manifest !== null && fields.usage !== null;
}

function hasRequestIdentity(fields: RequestFields): boolean {
  return Boolean(fields.clientRequestId && fields.batchId && fields.positionId && fields.model && fields.startedAt)
    && !containsCredential(fields.model ?? "");
}

function hasSafePrompt(fields: RequestFields): boolean {
  return fields.prompt !== null && !containsCredential(fields.prompt);
}

function requestMatchesSource(fields: RequestFields, sourcePath: string): boolean {
  return Boolean(fields.manifest?.some((item) => item.positionId === fields.positionId && item.relativePath === sourcePath));
}

function requestTimesMatchState(fields: RequestFields, state: SvgRequestRecord["status"]): boolean {
  if (!fields.startedAt || fields.finishedAt === undefined) return false;
  return state === "in-progress" ? fields.finishedAt === null : fields.finishedAt !== null;
}

interface VersionFields {
  requestId: string | null;
  manifest: SvgManifestItem[] | null;
  usage: SvgUsage | null;
  validation: SvgValidationRecord | null;
  path: string | null;
  version: number | null;
  sourceFingerprint: string | null;
  prompt: string | null;
  model: string | null;
  batchId: string | null;
  contentHash: string | null;
  createdAt: string | null;
  reviewedAt: string | null | undefined;
  positionId: number | null;
}

export function parseVersion(raw: unknown, sourcePath: string): SvgVersionRecord | null {
  if (!isVersionEnvelope(raw)) return null;
  const fields = readVersionFields(raw);
  if (!validVersionFields(fields, raw.review, sourcePath)) return null;
  return buildVersionRecord(fields, raw.review, raw);
}

function isVersionEnvelope(raw: unknown): raw is Record<string, unknown> & { review: SvgVersionRecord["review"] } {
  return isRecord(raw) && decision(raw.review) && raw.provider === "Requesty"
    && raw.costAllocation === "shared-batch-not-allocated";
}

function readVersionFields(raw: Record<string, unknown>): VersionFields {
  const requestId = nonEmpty(raw.requestId, 200);
  return {
    requestId, manifest: parseManifest(raw.manifest, requestId === "recovered"), usage: parseUsage(raw.usage),
    validation: parseValidation(raw.validation), path: nonEmpty(raw.path, 1000), version: positiveInt(raw.version),
    sourceFingerprint: string(raw.sourceFingerprint, 200), prompt: string(raw.prompt, 12_000),
    model: string(raw.model, 200), batchId: nonEmpty(raw.batchId, 200), contentHash: string(raw.contentHash, 200),
    createdAt: isoString(raw.createdAt), reviewedAt: nullableIsoString(raw.reviewedAt), positionId: positiveInt(raw.positionId),
  };
}

function validVersionFields(fields: VersionFields, review: SvgVersionRecord["review"], sourcePath: string): boolean {
  return hasVersionMetadata(fields) && hasVersionHashes(fields) && hasValidVersionPath(fields, sourcePath)
    && hasValidReviewTime(fields, review) && versionMatchesRequest(fields, sourcePath);
}

function hasVersionMetadata(fields: VersionFields): boolean {
  return hasVersionIdentity(fields) && hasVersionPayload(fields) && hasVersionText(fields);
}

function hasVersionIdentity(fields: VersionFields): boolean {
  return Boolean(fields.requestId && fields.batchId && fields.version && fields.positionId && fields.createdAt);
}

function hasVersionPayload(fields: VersionFields): boolean {
  return Boolean(fields.manifest && fields.usage && fields.validation && fields.path);
}

function hasVersionText(fields: VersionFields): boolean {
  return fields.sourceFingerprint !== null && fields.prompt !== null && fields.model !== null
    && fields.contentHash !== null && !containsCredential(fields.prompt) && !containsCredential(fields.model);
}

function hasVersionHashes(fields: VersionFields): boolean {
  return isHash(fields.sourceFingerprint) && isHash(fields.contentHash);
}

function hasValidVersionPath(fields: VersionFields, sourcePath: string): boolean {
  return Boolean(fields.path && fields.version && safeSvgPath(fields.path, sourcePath, fields.version)
    && fields.validation?.valid && fields.validation.visible);
}

function hasValidReviewTime(fields: VersionFields, review: SvgVersionRecord["review"]): boolean {
  if (fields.reviewedAt === undefined) return false;
  return review === "pending" ? fields.reviewedAt === null : fields.reviewedAt !== null;
}

function versionMatchesRequest(fields: VersionFields, sourcePath: string): boolean {
  if (fields.requestId === "recovered") return true;
  const source = fields.manifest?.find((item) => item.relativePath === sourcePath);
  return Boolean(source && source.fingerprint === fields.sourceFingerprint && source.positionId === fields.positionId);
}

function buildVersionRecord(
  fields: VersionFields, review: SvgVersionRecord["review"], raw: Record<string, unknown>,
): SvgVersionRecord {
  return {
    version: fields.version!, path: fields.path!, sourceFingerprint: fields.sourceFingerprint!, prompt: fields.prompt!,
    provider: "Requesty", model: fields.model!, createdAt: fields.createdAt!, review, reviewedAt: fields.reviewedAt!,
    requestId: fields.requestId!, batchId: fields.batchId!, positionId: fields.positionId!,
    compositeHash: string(raw.compositeHash, 200) ?? "", manifest: fields.manifest!, usage: fields.usage!,
    costAllocation: "shared-batch-not-allocated", contentHash: fields.contentHash!, validation: fields.validation!,
  };
}

function parseManifest(raw: unknown, allowEmpty = false): SvgManifestItem[] | null {
  if (!Array.isArray(raw) || (!allowEmpty && raw.length < 1) || raw.length > 9) return null;
  const items = raw.map((entry) => parseManifestItem(entry));
  if (items.some((item) => item === null)) return null;
  const valid = items as SvgManifestItem[];
  return new Set(valid.map((item) => item.positionId)).size === valid.length
    && new Set(valid.map((item) => item.sourceId)).size === valid.length ? valid : null;
}

function parseManifestItem(raw: unknown): SvgManifestItem | null {
  if (!isRecord(raw)) return null;
  const positionId = positiveInt(raw.positionId);
  const sourceId = nonEmpty(raw.sourceId, 1000);
  const filename = nonEmpty(raw.filename, 255);
  const relativePath = nonEmpty(raw.relativePath, 1000);
  const fingerprint = string(raw.fingerprint, 200);
  if (!positionId || !sourceId || !filename || !relativePath || !safeRelativePath(relativePath)
    || relativePath.split("/").pop() !== filename || !fingerprint || !isHash(fingerprint)) return null;
  return { positionId, sourceId, filename, relativePath, fingerprint };
}

function parseUsage(raw: unknown): SvgUsage | null {
  if (!isRecord(raw)) return null;
  const fields = [raw.inputTokens, raw.outputTokens, raw.totalTokens, raw.actualCostUsd];
  if (!fields.every(isNullableNumber) || fields.slice(0, 3).some((item) => item !== null && !Number.isInteger(item))) return null;
  return { inputTokens: fields[0] as number | null, outputTokens: fields[1] as number | null,
    totalTokens: fields[2] as number | null, actualCostUsd: fields[3] as number | null };
}

function parseValidation(raw: unknown): SvgValidationRecord | null {
  if (!isRecord(raw) || typeof raw.valid !== "boolean" || typeof raw.visible !== "boolean" || !Array.isArray(raw.warnings)) return null;
  if (raw.warnings.length > 100 || !raw.warnings.every((item) => typeof item === "string" && item.length <= 300)) return null;
  const viewBox = string(raw.viewBox, 100);
  if (raw.valid && (!viewBox || !isViewBox(viewBox))) return null;
  return { valid: raw.valid, visible: raw.visible, viewBox, warnings: raw.warnings as string[], safeError: safeErrorText(raw.safeError) };
}

function safeSvgPath(path: string, sourcePath: string, version: number): boolean {
  const parentOf = (value: string) => value.split("/").slice(0, -1).join("/");
  const sourceName = sourcePath.split("/").pop() ?? "";
  const dot = sourceName.lastIndexOf(".");
  const base = dot > 0 ? sourceName.slice(0, dot) : sourceName;
  const expectedName = `${base}${version === 1 ? "" : `-v${version}`}.svg`;
  return safeRelativePath(path) && parentOf(path) === parentOf(sourcePath) && path.split("/").pop() === expectedName;
}

function safeRelativePath(path: string): boolean {
  return !path.startsWith("/") && !path.includes("\\") && path.split("/").every((part) => part && part !== "." && part !== "..");
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isoString(value: unknown): string | null {
  return isIso(value) ? value : null;
}

function nullableIsoString(value: unknown): string | null | undefined {
  return value === null ? null : isIso(value) ? value : undefined;
}

function isViewBox(value: string): boolean {
  const values = value.split(" ").map(Number);
  return values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0;
}

function isNullableNumber(value: unknown): boolean {
  return value === null || typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nonEmpty(value: unknown, max: number): string | null {
  const parsed = string(value, max);
  return parsed && parsed.trim() ? parsed : null;
}

function status(value: unknown): value is SvgRequestRecord["status"] {
  return ["in-progress", "complete", "partial", "failed", "unknown"].includes(String(value));
}

function decision(value: unknown): value is SvgVersionRecord["review"] {
  return ["pending", "approved", "declined"].includes(String(value));
}

function positiveInt(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function string(value: unknown, max: number): string | null {
  return value === null ? null : typeof value === "string" && value.length <= max ? value : null;
}
