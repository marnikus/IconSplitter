// svgconnections.ts — connection profiles of the Generate SVG tab (RULE 3/13):
// the quick-switch list of provider setups. One connection = one switchable
// identity (name, kind, base URL, model) plus, for image connections, the full
// documented image-parameter set. Verified 2026-10-16 against Requesty's docs
// (docs.requesty.ai llms.txt + api-reference/endpoint/images-generations-create)
// and OpenAI's image guide (developers.openai.com/api/docs/guides/image-prompting):
//   * POST {base}/images/generations, Bearer key, OpenAI-compatible body
//   * ids are "provider/model" -> GPT-Image-2.5 Sunburst is
//     "openai/gpt-image-2.5-sunburst" (released 2026-09-08)
//   * quality auto|low|medium|high|xhigh|max; size auto | WxH; background
//     auto|opaque|transparent; output_format png|jpeg|webp
// Requesty's docs index has NO image-edit endpoint — generation only (honest
// scope; the doc in archive/2026-10-16-connections records the decision).

export type ConnectionKind = "text" | "image";

export type SizePreset = "auto" | "1024x1024" | "1536x1024" | "1024x1536" | "2048x2048" | "2048x1152" | "3840x2160" | "2160x3840" | "custom";
export type ImageQuality = "auto" | "low" | "medium" | "high" | "xhigh" | "max";
export type ImageBackground = "auto" | "transparent" | "opaque";
export type ImageFormat = "png" | "jpeg" | "webp";
export type ResponseFormat = "b64_json" | "url";

export interface ImageSettings {
  sizePreset: SizePreset;
  customW: number;
  customH: number;
  quality: ImageQuality;
  /** Images per request, 1..10 (the Images API's n). */
  n: number;
  background: ImageBackground;
  outputFormat: ImageFormat;
  /** b64_json survives a browser fetch without image CORS; url is the docs example. */
  responseFormat: ResponseFormat;
}

export interface Connection {
  id: string;
  name: string;
  kind: ConnectionKind;
  baseUrl: string;
  model: string;
  /** Used only when kind === "image". */
  image: ImageSettings;
}

export const SUNBURST_MODEL = "openai/gpt-image-2.5-sunburst";
export const SUNBURST_LABEL = "Sunburst Image";
export const IMAGE_N_MIN = 1;
export const IMAGE_N_MAX = 10;
export const CUSTOM_DIM_MIN = 256;
export const CUSTOM_DIM_MAX = 4096;

export const SIZE_PRESETS: readonly SizePreset[] = ["auto", "1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "3840x2160", "2160x3840", "custom"];
export const QUALITIES: readonly ImageQuality[] = ["auto", "low", "medium", "high", "xhigh", "max"];
export const BACKGROUNDS: readonly ImageBackground[] = ["auto", "transparent", "opaque"];
export const IMAGE_FORMATS: readonly ImageFormat[] = ["png", "jpeg", "webp"];
export const RESPONSE_FORMATS: readonly ResponseFormat[] = ["b64_json", "url"];

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  sizePreset: "1024x1024", customW: 1024, customH: 1024,
  quality: "auto", n: 1, background: "auto", outputFormat: "png", responseFormat: "b64_json",
};

/** `newConnectionId` — stable per connection while it lives in the list. */
export function newConnectionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `conn-${Date.now()}-${Math.random()}`;
}

/** The shipped second connection: Requesty image generation via Sunburst. */
export const DEFAULT_IMAGE_CONNECTION: Connection = {
  id: "conn-sunburst-image", name: SUNBURST_LABEL, kind: "image",
  baseUrl: "https://router.requesty.ai/v1", model: SUNBURST_MODEL, image: { ...DEFAULT_IMAGE_SETTINGS },
};

export function defaultImageConnection(baseUrl: string): Connection {
  return { ...DEFAULT_IMAGE_CONNECTION, id: newConnectionId(), baseUrl };
}

/** The shipped list: the user's live text setup first, Sunburst Image second. */
export function defaultConnections(textModel: string, textBaseUrl: string): Connection[] {
  return [
    { id: newConnectionId(), name: "GPT 6.1 Sol", kind: "text", baseUrl: textBaseUrl, model: textModel, image: { ...DEFAULT_IMAGE_SETTINGS } },
    defaultImageConnection(textBaseUrl),
  ];
}

/** Migration: seed from the CURRENT config so an existing setup is never clobbered. */
export function seedConnections(config: { baseUrl: string; model: string }): Connection[] {
  return defaultConnections(config.model, config.baseUrl);
}

/** Every listed size; the UI offers exactly these plus the custom WxH inputs. */
export function isSizePreset(v: unknown): v is SizePreset {
  return typeof v === "string" && (SIZE_PRESETS as readonly string[]).includes(v);
}

export function clampImageN(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return IMAGE_N_MIN;
  return Math.min(IMAGE_N_MAX, Math.max(IMAGE_N_MIN, Math.round(n)));
}

export function clampCustomDim(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1024;
  return Math.min(CUSTOM_DIM_MAX, Math.max(CUSTOM_DIM_MIN, Math.round(n)));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** A stored image-settings payload -> the safe set (RULE 13, field by field). */
export function sanitizeImage(raw: unknown): ImageSettings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    sizePreset: isSizePreset(r.sizePreset) ? r.sizePreset : "auto",
    customW: clampCustomDim(r.customW),
    customH: clampCustomDim(r.customH),
    quality: oneOf(r.quality, QUALITIES, "auto"),
    n: clampImageN(r.n),
    background: oneOf(r.background, BACKGROUNDS, "auto"),
    outputFormat: oneOf(r.outputFormat, IMAGE_FORMATS, "png"),
    responseFormat: oneOf(r.responseFormat, RESPONSE_FORMATS, "b64_json"),
  };
}

/** A stored connection record -> the safe shape; junk kind falls back to text. */
export function sanitizeConnection(raw: unknown): Connection {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const kind: ConnectionKind = r.kind === "image" ? "image" : "text";
  const { baseUrl, model } = endpointsOf(r, kind);
  return {
    id: typeof r.id === "string" && r.id !== "" ? r.id : newConnectionId(),
    name: textOr(r.name, kind === "image" ? SUNBURST_LABEL : "Connection"),
    kind,
    baseUrl,
    model,
    image: sanitizeImage(r.image),
  };
}

/** The stored base+model when honest; the kind's documented pair otherwise. */
function endpointsOf(r: Record<string, unknown>, kind: ConnectionKind): { baseUrl: string; model: string } {
  const fallbackBase = "https://router.requesty.ai/v1";
  const fallbackModel = kind === "image" ? SUNBURST_MODEL : "openai/gpt-6.1-sol";
  return {
    baseUrl: typeof r.baseUrl === "string" && /^https?:\/\//i.test(r.baseUrl) ? r.baseUrl : fallbackBase,
    model: textOr(r.model, fallbackModel),
  };
}

function textOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

export interface ConnectionsStore {
  list: Connection[];
  activeId: string;
}

/** The stored payload -> the safe store; a broken activeId lands on the first. */
export function parseConnectionsStore(raw: unknown): ConnectionsStore {
  const list = Array.isArray((raw as { list?: unknown } | null)?.list)
    ? (raw as { list: unknown[] }).list.map(sanitizeConnection)
    : defaultConnections("openai/gpt-6.1-sol", "https://router.requesty.ai/v1");
  const finalList = list.length > 0 ? list : defaultConnections("openai/gpt-6.1-sol", "https://router.requesty.ai/v1");
  const stored = typeof (raw as { activeId?: unknown } | null)?.activeId === "string" ? (raw as { activeId: string }).activeId : "";
  const active = finalList.find((c) => c.id === stored) ?? finalList[0];
  return { list: finalList, activeId: (active as Connection).id };
}

export function serializeConnectionsStore(store: ConnectionsStore): string {
  return JSON.stringify({ v: 1, activeId: store.activeId, list: store.list });
}

/** `…/v1/images/generations` — never a trailing-slash dupe. */
export function imageUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/images/generations`;
}

/** The size actually sent: the preset, or the custom WxH pair. */
export function resolveSize(image: ImageSettings): string {
  if (image.sizePreset === "auto") return "auto";
  if (image.sizePreset === "custom") return `${image.customW}x${image.customH}`;
  return image.sizePreset;
}

/** The exact Create Image body (Requesty api-reference, 2026-10-16). */
export function buildImageBody(conn: Connection, prompt: string): Record<string, unknown> {
  return {
    model: conn.model,
    prompt,
    n: conn.image.n,
    size: resolveSize(conn.image),
    quality: conn.image.quality,
    response_format: conn.image.responseFormat,
    background: conn.image.background,
    output_format: conn.image.outputFormat,
  };
}

/** "GPT Image 2.5 Sunburst (image)" — dropdown/confirm copy, display only. */
export function connectionLabel(conn: Connection): string {
  const words = (conn.model.split("/").pop() ?? conn.model).split("-").filter(Boolean)
    .map((w) => (w.toUpperCase() === "GPT" ? "GPT" : w.charAt(0).toUpperCase() + w.slice(1)));
  return `${words.join(" ")}${conn.kind === "image" ? " (image)" : ""}`;
}
