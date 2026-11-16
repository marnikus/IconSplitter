// svgimgedit.ts — the image-EDIT wire of AI source regeneration (2026-10-19,
// user request: send the prompt AND the source's current main AI image as the
// reference). Requesty documents POST {base}/images/edits — multipart/form-data
// with `model`, `prompt` and one `image[]` part per reference file, plus the
// usual size/quality/background/output_format (docs.requesty.ai/api-reference/
// endpoint/images-edits-create, read 2026-10-19). It does NOT take `n` or
// `response_format`; the answer is the same `data[]` shape the generation
// endpoint returns. Pure: building the request is a rule, sending it is not.

import { resolveSize, type Connection, type ImageQuality } from "./svgconnections";

/** The reference the request carries: the file's bytes and the name it travels under. */
export interface ReferenceImage {
  blob: Blob;
  fileName: string;
}

/** `…/v1/images/edits` — never a trailing-slash dupe. */
export function imageEditUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/images/edits`;
}

const MIME_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/** The mime type of an image file name (png when the extension says nothing). */
export function mimeForImage(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "image/png";
}

/** The edit endpoint documents auto/low/medium/high only; the richer generation tiers ask for "high". */
export function editQuality(quality: ImageQuality): "auto" | "low" | "medium" | "high" {
  return quality === "xhigh" || quality === "max" ? "high" : quality;
}

/** The multipart body: prompt + the reference as `image[]`, with the connection's output settings. */
export function buildEditForm(conn: Connection, prompt: string, reference: ReferenceImage): FormData {
  const form = new FormData();
  form.append("model", conn.model);
  form.append("prompt", prompt);
  const type = reference.blob.type !== "" ? reference.blob.type : mimeForImage(reference.fileName);
  form.append("image[]", new File([reference.blob], reference.fileName, { type }));
  form.append("size", resolveSize(conn.image));
  form.append("quality", editQuality(conn.image.quality));
  form.append("background", conn.image.background);
  form.append("output_format", conn.image.outputFormat);
  return form;
}
