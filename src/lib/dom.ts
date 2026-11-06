// dom.ts — tiny browser helpers shared by the sheets tool and the batch tool.
// Extracted from App.tsx (RULE 16.5: legacy hotspot shrinks, never grows).

import type { SheetSource } from "./detect";

export function download(blob: Blob, name: string): void {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}

/** Blob -> data URL (used for the composite image sent to the provider). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read image bytes"));
    r.readAsDataURL(blob);
  });
}

/** Loads a File into an HTMLImageElement via a short-lived object URL. */
export async function loadImageFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decodes a sheet for the split pipeline: `createImageBitmap` decodes off the
 * main thread and skips the element round-trip; the element path stays as the
 * fallback (and for engines without the API). Never throws past the fallback.
 */
export async function loadSheet(file: File): Promise<SheetSource> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch { /* junk or unsupported → element path below (RULE 4: honest error there) */ }
  }
  return loadImageFile(file);
}


/**
 * A decode that never completes is a failed read (RULE 4/7), never an endless
 * wait: a row that cannot decode must surface "Could not read image" so the
 * preview queue finishes, reports and stores — a hung Image (a broken file, a
 * lost blob URL, a suspended tab) must not freeze a whole batch forever.
 * The default is generous for large files on slow disks; tests shorten it.
 */
const DEFAULT_DECODE_TIMEOUT_MS = 8000;
let decodeTimeoutMs = DEFAULT_DECODE_TIMEOUT_MS;

/** Test hook: the sandbox DOM never answers an image load at all. */
export function setImageDecodeTimeout(ms: number): void {
  decodeTimeoutMs = ms;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    const timer = setTimeout(() => fail(new Error("Could not read image")), decodeTimeoutMs);
    const fail = (err: Error): void => {
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      rej(err);
    };
    img.onload = () => { clearTimeout(timer); res(img); };
    img.onerror = () => fail(new Error("Could not read image"));
    img.src = url;
  });
}
