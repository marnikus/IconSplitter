// Existing SVG metadata copy action, shared with the committed-file editor.
import type { IconMetadata } from "../lib/upload/meta";
export async function copyMetadataField(meta: IconMetadata, field: "title" | "description" | "tags", say: (message: string, error?: boolean) => void): Promise<void> {
  const text = field === "tags" ? meta.tags.join(", ") : meta[field];
  try { await navigator.clipboard.writeText(text); say(`${field === "tags" ? "Tags" : field === "title" ? "Title" : "Description"} copied`); }
  catch { say("The clipboard is blocked — select the text and copy it by hand", true); }
}
