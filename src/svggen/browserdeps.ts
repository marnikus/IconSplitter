// browserdeps.ts — the browser-side IO for the Generate SVG tab: folder
// traversal, file reads, composite decode/canvas and fetch. Kept out of the
// hook so it stays small and testable (RULE 18).

import type { DirHandleLike } from "../lib/fs";
import { latestValid, type Sidecar } from "../lib/svgsidecar";
import type { ViewPair } from "../lib/reviewfilter";
import { aiName, fingerprintOf } from "./rows";
import { loadSidecar } from "./sidecarstore";

export async function loadAllSidecars(root: DirHandleLike | null, approved: ViewPair[]): Promise<Map<string, Sidecar | null>> {
  const out = new Map<string, Sidecar | null>();
  if (!root) return out;
  for (const p of approved) {
    const load = await loadSidecar({
      dir: await dirFor(root, p.relDir), aiName: aiName(p), sourceId: p.pairId,
      sourcePath: p.ai?.relPath ?? "", fingerprint: fingerprintOf(p),
    });
    out.set(p.pairId, load.sidecar);
  }
  return out;
}

export async function readLatestSvg(root: DirHandleLike | null, p: ViewPair | null, sc: Sidecar | null): Promise<string | null> {
  const valid = sc ? latestValid(sc) : null;
  if (!root || !p?.ai || !valid) return null;
  try {
    const f = await (await (await dirFor(root, p.relDir)).getFileHandle(valid.file)).getFile();
    return await f.text();
  } catch {
    return null;
  }
}

export async function dirFor(root: DirHandleLike, relDir: string): Promise<DirHandleLike> {
  let dir = root;
  for (const part of relDir.split("/").filter(Boolean)) dir = await dir.getDirectoryHandle(part);
  return dir;
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let bin = "";
  for (const byte of new Uint8Array(buf)) bin += String.fromCharCode(byte);
  return `data:${blob.type || "image/png"};base64,${btoa(bin)}`;
}

export function browserComposite() {
  return {
    decode: (f: File) => createImageBitmap(f),
    makeCanvas: (size: number) => {
      const c = new OffscreenCanvas(size, size);
      const g = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
      return {
        width: size, height: size,
        ctx: {
          set fillStyle(v: string) { g.fillStyle = v; },
          fillRect: (x: number, y: number, w: number, h: number) => g.fillRect(x, y, w, h),
          drawImage: (img: { width: number; height: number }, r: { x: number; y: number; w: number; h: number }) => g.drawImage(img as ImageBitmap, r.x, r.y, r.w, r.h),
        },
        toBlob: () => c.convertToBlob({ type: "image/png" }),
      };
    },
  };
}

export async function browserFetch(url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) {
  const r = await fetch(url, init);
  return { status: r.status, text: () => r.text() };
}
