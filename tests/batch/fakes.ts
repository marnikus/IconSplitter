// Shared in-memory File System Access fakes for batch tests. Real batch
// logic runs; only the browser FS API is faked (RULE 8 shim style).
import { vi } from "vitest";
import type { FileData, FsDirHandle, FsFile, FsFileHandle, FsWritable } from "../../src/batch/fs";

export function domError(name: "NotFoundError" | "AbortError" | "SecurityError"): DOMException {
  return new DOMException(`fake ${name}`, name);
}

export class FakeFile implements FsFile {
  constructor(
    readonly name: string,
    readonly type: string,
    private readonly bytes: Uint8Array,
    readonly lastModified: number,
  ) {}
  get size(): number {
    return this.bytes.length;
  }
  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.bytes.slice().buffer as ArrayBuffer;
  }
  async text(): Promise<string> {
    return new TextDecoder().decode(this.bytes);
  }
}

export class FakeFileHandle implements FsFileHandle {
  readonly kind = "file" as const;
  bytes = new Uint8Array([]);
  lastModified = 7;
  mime = "image/png";
  constructor(
    readonly name: string,
    readonly parent: FakeDir | null,
  ) {}
  async getFile(): Promise<FsFile> {
    if (this.parent && !this.parent.files.has(this.name)) throw domError("NotFoundError");
    return new FakeFile(this.name, this.mime, this.bytes, this.lastModified);
  }
  async createWritable(): Promise<FsWritable> {
    return {
      write: async (data: FileData): Promise<void> => {
        if (typeof data === "string") this.bytes = new TextEncoder().encode(data);
        else if (data instanceof ArrayBuffer) this.bytes = new Uint8Array(data);
        else this.bytes = new Uint8Array(await data.arrayBuffer());
      },
      close: async (): Promise<void> => {},
    };
  }
}

export class FakeDir implements FsDirHandle {
  readonly kind = "directory" as const;
  readonly files = new Map<string, FakeFileHandle>();
  readonly dirs = new Map<string, FakeDir>();
  constructor(readonly name: string) {}
  async *values(): AsyncIterable<FsFileHandle | FsDirHandle> {
    yield* this.dirs.values();
    yield* this.files.values();
  }
  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle> {
    const hit = this.files.get(name);
    if (hit) return hit;
    if (opts?.create !== true) throw domError("NotFoundError");
    const h = new FakeFileHandle(name, this);
    this.files.set(name, h);
    return h;
  }
  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsDirHandle> {
    const hit = this.dirs.get(name);
    if (hit) return hit;
    if (opts?.create !== true) throw domError("NotFoundError");
    const d = new FakeDir(name);
    this.dirs.set(name, d);
    return d;
  }
}

export function seedFile(dir: FakeDir, name: string, text: string, mime = "image/png", lastModified = 7): FakeFileHandle {
  const h = new FakeFileHandle(name, dir);
  h.bytes = new TextEncoder().encode(text);
  h.mime = mime;
  h.lastModified = lastModified;
  dir.files.set(name, h);
  return h;
}

export function seedDir(parent: FakeDir, name: string): FakeDir {
  const d = new FakeDir(name);
  parent.dirs.set(name, d);
  return d;
}

export async function treeOf(dir: FakeDir, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const [name, sub] of dir.dirs) out.push(...(await treeOf(sub, `${prefix}${name}/`)));
  for (const name of dir.files.keys()) out.push(`${prefix}${name}`);
  return out.sort();
}

class RealHandle extends FakeFileHandle {
  private blob = new Blob([]);
  override async getFile(): Promise<FsFile> {
    if (this.parent && !this.parent.files.has(this.name)) throw domError("NotFoundError");
    return new File([this.blob], this.name, { type: this.mime, lastModified: this.lastModified });
  }
  setBlob(blob: Blob): void {
    this.blob = blob;
  }
}

/** Seeds a handle whose getFile() returns a REAL File (a Blob) for thumbnail URLs. */
export function seedRealFile(dir: FakeDir, name: string, text: string, mime = "image/png", lastModified = 7): FakeFileHandle {
  const h = new RealHandle(name, dir);
  h.mime = mime;
  h.lastModified = lastModified;
  h.setBlob(new Blob([text], { type: mime }));
  dir.files.set(name, h);
  return h;
}

export type RgbaPaint = (x: number, y: number) => [number, number, number, number];

export const paintSquare: RgbaPaint = (x, y) =>
  x >= 10 && x < 18 && y >= 10 && y < 18 ? [0, 0, 0, 255] : [255, 255, 255, 255];

export const paintBlank: RgbaPaint = () => [255, 255, 255, 255];

/** getContext shim serving synthetic pixels (same justification as tests/analyze.test.ts). */
export function stubCanvasPaint(paint: RgbaPaint) {
  return vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
              const [r, g, b, a] = paint(x, y);
              const i = (y * w + x) * 4;
              data[i] = r;
              data[i + 1] = g;
              data[i + 2] = b;
              data[i + 3] = a;
            }
          return { data };
        },
        putImageData: vi.fn(),
      }) as unknown as CanvasRenderingContext2D,
  );
}

const REAL_TO_BLOB = HTMLCanvasElement.prototype.toBlob;

export function stubToBlobValue(blob: Blob | null): void {
  HTMLCanvasElement.prototype.toBlob = ((cb: (b: Blob | null) => void) => cb(blob)) as unknown as typeof REAL_TO_BLOB;
}

export function restoreCanvas(): void {
  vi.restoreAllMocks();
  HTMLCanvasElement.prototype.toBlob = REAL_TO_BLOB;
}
