import { DEFAULT_PROMPT } from "../../src/svg/prefs";
import { stableSvgSourceId } from "../../src/svg/prompt";
import type { SvgRequestRecord, SvgSidecar, SvgSourceRow, SvgVersionRecord } from "../../src/svg/types";

export const SVG_SOURCE_PATH = "folder/leaf_AI.png";
export const SVG_FINGERPRINT = "a".repeat(64);
export const SVG_HASH = "b".repeat(64);
export const SVG_TIME = "2026-10-01T12:00:00.000Z";
export const SVG_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>leaf_AI.png</title><path d="M1 1h8v8H1z"/></svg>`;

export function manifestItem(positionId = 1, relativePath = SVG_SOURCE_PATH) {
  const filename = relativePath.split("/").at(-1) ?? "leaf_AI.png";
  return { positionId, sourceId: stableSvgSourceId(relativePath), filename, relativePath, fingerprint: SVG_FINGERPRINT };
}

export function requestRecord(status: SvgRequestRecord["status"] = "complete"): SvgRequestRecord {
  return {
    clientRequestId: "request-1", providerRequestId: "provider-1", batchId: "batch-1", status,
    positionId: 1, compositeHash: SVG_HASH, manifest: [manifestItem()], prompt: DEFAULT_PROMPT,
    provider: "Requesty", model: "azure/gpt-6.1-sol@eastus2", startedAt: SVG_TIME,
    finishedAt: status === "in-progress" ? null : SVG_TIME,
    usage: { inputTokens: 120, outputTokens: 40, totalTokens: 160, actualCostUsd: 0.0012 },
    costAllocation: "shared-batch-not-allocated", safeError: null,
  };
}

export function versionRecord(version = 1, review: SvgVersionRecord["review"] = "pending"): SvgVersionRecord {
  return {
    version, path: `folder/leaf_AI${version === 1 ? "" : `-v${version}`}.svg`, sourceFingerprint: SVG_FINGERPRINT,
    prompt: DEFAULT_PROMPT, provider: "Requesty", model: "azure/gpt-6.1-sol@eastus2", createdAt: SVG_TIME,
    review, reviewedAt: review === "pending" ? null : SVG_TIME, requestId: "request-1", batchId: "batch-1",
    positionId: 1, compositeHash: SVG_HASH, manifest: [manifestItem()], usage: requestRecord().usage,
    costAllocation: "shared-batch-not-allocated", contentHash: SVG_HASH,
    validation: { valid: true, visible: true, viewBox: "0 0 10 10", warnings: [], safeError: null },
  };
}

export function sidecarFixture(): SvgSidecar {
  const sourceId = stableSvgSourceId(SVG_SOURCE_PATH);
  return {
    schemaVersion: 1, sourceId, sourcePath: SVG_SOURCE_PATH, sourceFingerprint: SVG_FINGERPRINT,
    requests: [requestRecord()], versions: [versionRecord()], lastSafeError: null, updatedAt: SVG_TIME,
  };
}

export function sourceRowFixture(overrides: Partial<SvgSourceRow> = {}): SvgSourceRow {
  const item = versionRecord();
  return {
    sourceId: stableSvgSourceId(SVG_SOURCE_PATH), pairId: "pair-leaf", filename: "leaf_AI.png",
    relativePath: SVG_SOURCE_PATH, sourceFingerprint: SVG_FINGERPRINT, sidecarPath: "folder/leaf_AI.png.svg.json",
    sidecarState: "ok", generation: "generated", review: "pending", requests: [requestRecord()],
    versions: [{ ...item, svg: SVG_MARKUP, available: true, recovered: false, sourceCurrent: true }],
    newestSvg: SVG_MARKUP, newestPath: item.path, newestVersion: item.version, safeError: null,
    recoverableTempPath: null, ...overrides,
  };
}
