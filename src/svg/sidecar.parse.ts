// sidecar.parse.ts — parse and cross-check one durable SVG sidecar.

import { safeErrorText } from "./security";
import { validEnvelope, uniqueRequests, uniqueVersions, versionsMatchRequests, parseRequest, parseVersion } from "./sidecar.schema";
import type { SvgRequestRecord, SvgSidecar, SvgVersionRecord } from "./types";

export function parseSvgSidecar(raw: string, sourceId: string, sourcePath: string): SvgSidecar | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!validEnvelope(value, sourceId, sourcePath)) return null;
    const requests = (value.requests as unknown[]).map((item) => parseRequest(item, sourcePath));
    const versions = (value.versions as unknown[]).map((item) => parseVersion(item, sourcePath));
    if (requests.some((item) => item === null) || versions.some((item) => item === null)) return null;
    const validRequests = requests as SvgRequestRecord[];
    const validVersions = versions as SvgVersionRecord[];
    if (!uniqueRequests(validRequests) || !uniqueVersions(validVersions)
      || !versionsMatchRequests(validVersions, validRequests, sourceId, sourcePath)) return null;
    return {
      schemaVersion: 1, sourceId, sourcePath, sourceFingerprint: value.sourceFingerprint as string,
      requests: validRequests, versions: validVersions, lastSafeError: safeErrorText(value.lastSafeError),
      updatedAt: value.updatedAt as string,
    };
  } catch {
    return null;
  }
}
