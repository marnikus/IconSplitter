// bridgeconfig.ts — where the Inkscape helper listens (2026-10-09): device
// config beside the Gemini config, never an export setting. Validated on read
// (RULE 13): an http(s) origin without a trailing slash, else the loopback
// default the bat files use.

import { isRecord } from "../../isrecord";

export const DEFAULT_BRIDGE_PORT = 47391;
export const DEFAULT_BRIDGE_URL = `http://127.0.0.1:${DEFAULT_BRIDGE_PORT}`;

export interface BridgeConfig { url: string }

export function parseBridgeConfig(raw: unknown): BridgeConfig {
  if (!isRecord(raw) || typeof raw.url !== "string") return { url: DEFAULT_BRIDGE_URL };
  return { url: readBridgeUrl(raw.url) ?? DEFAULT_BRIDGE_URL };
}

/** A typed URL → its http(s) origin + path without the trailing slash; null when it is not one. */
export function readBridgeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/+$/u, "");
  } catch {
    return null;
  }
}

export function serializeBridgeConfig(config: BridgeConfig): string {
  return JSON.stringify(config);
}
