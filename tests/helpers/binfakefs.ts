// binfakefs.ts — binary-safe fakes implementing the fs.ts handle interfaces
// (RULE 8). FakeFile/FakeFile are TEXT-only: writing JPEG bytes through their
// writable corrupts them (UTF-8 decode), so any test whose production path
// writes BINARY files (the export package's JPEG) must build its tree from
// these. BinDir overrides BOTH handle getters so directories created mid-run
// (ensureDirPath's `export` folder) stay binary-safe too.

import { FakeDir, FakeFile } from "./fakefs";
import type { WritableLike } from "../../src/lib/fs";

/** A binary-safe fake file: bytes round-trip exactly (the real FS API is binary). */
export class BinFile extends FakeFile {
  bytes: Uint8Array;
  constructor(name: string, content: string | Uint8Array = "", mtime = 1000) {
    super(name, 0, mtime, typeof content === "string" ? content : "");
    this.bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
    this.size = this.bytes.length;
  }
  override async getFile(): Promise<File> {
    const f = new File([this.bytes as BlobPart], this.name);
    Object.defineProperty(f, "lastModified", { value: this.mtime });
    return f;
  }
  override async createWritable(): Promise<WritableLike> {
    const chunks: Blob[] = [];
    return {
      write: async (d: Blob) => { chunks.push(d); },
      close: async () => {
        this.bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
        this.size = this.bytes.length;
        this.text = new TextDecoder().decode(this.bytes);
      },
    };
  }
}

/** A fake directory whose created files AND subdirectories are binary-safe. */
export class BinDir extends FakeDir {
  override async getFileHandle(n: string, opts?: { create?: boolean }): Promise<FakeFile> {
    const c = this.children.get(n);
    if (c instanceof FakeFile) return c;
    if (!opts?.create) throw new DOMException("Not found", "NotFoundError");
    const f = new BinFile(n);
    this.children.set(n, f);
    return f;
  }
  override async getDirectoryHandle(n: string, opts?: { create?: boolean }): Promise<FakeDir> {
    const c = this.children.get(n);
    if (c instanceof FakeDir) return c;
    if (!opts?.create) throw new DOMException("Not found", "NotFoundError");
    const d = new BinDir(n);
    this.children.set(n, d);
    return d;
  }
}
