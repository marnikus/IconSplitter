// record.ts — one icon's vector-index file. It lives NEXT TO the approved SVG
// as `<svg>.index.json` (never a .png / .svg / .svg.json name, so no other
// scanner can mistake it for a pair, an image or a sidecar). It holds the image
// vector (from an in-memory PNG render of the approved SVG) and the text vector
// (from title + description + tags), plus the fingerprints that say when either
// must be rebuilt. Validated field by field on read (RULE 13).
import { fnv1a32 } from "../pairing";
import { isRecord } from "../isrecord";

export const INDEX_VERSION = 1;
export const IMAGE_MODEL = "Xenova/clip-vit-base-patch32";
export const TEXT_MODEL = "Xenova/all-MiniLM-L6-v2";
export const RENDER_SIZE = 224;
export const RENDER_BACKGROUND = "#FFFFFF";

export interface IconVectors { image: Float32Array; text: Float32Array | null }

export interface IconIndexRecord {
  v: 1;
  id: string;
  svgPath: string;
  svgFingerprint: string;
  version: number;
  /** Fingerprint of the text the text vector was made from; null = no metadata, no text vector. */
  textFingerprint: string | null;
  models: { image: string; text: string };
  render: { size: number; background: string };
  vectors: IconVectors;
  createdAt: string;
}

/** What freshness needs to know about an icon (a BuilderIconAsset satisfies it). */
export interface IndexableIcon {
  id: string; svgPath?: string; fingerprint?: string; version?: number;
  title?: string; description?: string; keywords?: readonly string[];
}

export type IndexState = "ok" | "stale" | "missing";

export function indexPathOf(svgPath: string): string {
  return `${svgPath}.index.json`;
}

/** "title. description. tags" — the meaning the text vector encodes; "" without metadata. */
export function iconText(icon: IndexableIcon): string {
  const tags = (icon.keywords ?? []).map((t) => t.trim()).filter((t) => t !== "").join(", ");
  return [icon.title ?? "", icon.description ?? "", tags].map((s) => s.trim()).filter((s) => s !== "").join(". ");
}

export function textFingerprintOf(text: string): string | null {
  return text === "" ? null : fnv1a32(text).toString(16);
}

/** The image vector is reused unless the SVG (fingerprint / version) or the image model changed. */
export function needsImageVector(icon: IndexableIcon, record: IconIndexRecord | undefined): boolean {
  return record === undefined || record.svgFingerprint !== icon.fingerprint || record.version !== icon.version
    || record.models.image !== IMAGE_MODEL;
}

export function indexStateOf(icon: IndexableIcon, record: IconIndexRecord | undefined): IndexState {
  if (record === undefined) return "missing";
  if (needsImageVector(icon, record)) return "stale";
  const text = textFingerprintOf(iconText(icon));
  if (text !== record.textFingerprint) return "stale";
  return text !== null && record.models.text !== TEXT_MODEL ? "stale" : "ok";
}

export function serializeIndexRecord(r: IconIndexRecord): string {
  const { vectors, ...rest } = r;
  return JSON.stringify({ ...rest, kind: "icon-vector-index", dims: { image: vectors.image.length, text: vectors.text?.length ?? 0 },
    image: encodeVector(vectors.image), text: vectors.text === null ? null : encodeVector(vectors.text) }, null, 1);
}

export function parseIndexRecord(raw: unknown): IconIndexRecord | null {
  if (!isRecord(raw) || raw.v !== INDEX_VERSION || !isRecord(raw.models) || !isRecord(raw.render)) return null;
  const vectors = parseVectors(raw);
  if (vectors === null || !hasIdentity(raw, raw.models)) return null;
  return {
    v: 1, id: raw.id as string, svgPath: raw.svgPath as string, svgFingerprint: raw.svgFingerprint as string, version: raw.version as number,
    textFingerprint: typeof raw.textFingerprint === "string" ? raw.textFingerprint : null,
    models: { image: raw.models.image as string, text: raw.models.text as string },
    render: renderOf(raw.render), vectors, createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
  };
}

/** Both vectors decode to finite floats; a text vector is either absent (null) or valid. */
function parseVectors(raw: Record<string, unknown>): IconVectors | null {
  const image = decodeVector(raw.image);
  const text = raw.text === null ? null : decodeVector(raw.text);
  if (image === null || image.length === 0 || (raw.text !== null && text === null)) return null;
  return { image, text };
}

function renderOf(r: Record<string, unknown>): IconIndexRecord["render"] {
  return { size: Number(r.size) || RENDER_SIZE, background: typeof r.background === "string" ? r.background : RENDER_BACKGROUND };
}

function hasIdentity(raw: Record<string, unknown>, models: Record<string, unknown>): boolean {
  return allStrings(raw.id, raw.svgPath, raw.svgFingerprint, models.image, models.text) && typeof raw.version === "number";
}

function allStrings(...values: unknown[]): boolean {
  return values.every((v) => typeof v === "string" && v !== "");
}

/** Float32 → base64 (compact, exact). */
export function encodeVector(v: Float32Array): string {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function decodeVector(raw: unknown): Float32Array | null {
  if (typeof raw !== "string") return null;
  try {
    const bin = atob(raw);
    if (bin.length % 4 !== 0) return null;
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const v = new Float32Array(bytes.buffer);
    return v.every(Number.isFinite) ? v : null;
  } catch {
    return null;
  }
}
