// dom.ts — tiny browser helpers shared by the sheets tool and the batch tool.
// Extracted from App.tsx (RULE 16.5: legacy hotspot shrinks, never grows).

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Could not read image"));
    i.src = url;
  });
}

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
