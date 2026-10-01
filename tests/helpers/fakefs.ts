// Shared in-memory fakes implementing the fs.ts handle interfaces (RULE 8).
import type { DirHandleLike, FileHandleLike, WritableLike } from "../../src/lib/fs";

export class FakeFile implements FileHandleLike {
  kind = "file" as const;
  constructor(public name: string, public size = 10, public mtime = 1000, public text = "data") {}
  async getFile(): Promise<File> {
    const f = new File([this.text], this.name);
    Object.defineProperty(f, "lastModified", { value: this.mtime });
    return f;
  }
  async createWritable(): Promise<WritableLike> {
    const chunks: Blob[] = [];
    return {
      write: async (d: Blob) => { chunks.push(d); },
      // commit on close, like the real writable (RULE 23 atomic delivery)
      close: async () => {
        const merged = new Blob(chunks);
        this.text = await merged.text();
        this.size = merged.size;
      },
    };
  }
}

export class FakeDir implements DirHandleLike {
  kind = "directory" as const;
  children = new Map<string, FakeDir | FakeFile>();
  constructor(public name: string) {}
  async getDirectoryHandle(n: string, opts?: { create?: boolean }): Promise<FakeDir> {
    const c = this.children.get(n);
    if (c instanceof FakeDir) return c;
    if (!opts?.create) throw new DOMException("Not found", "NotFoundError");
    const d = new FakeDir(n);
    this.children.set(n, d);
    return d;
  }
  async getFileHandle(n: string, opts?: { create?: boolean }): Promise<FakeFile> {
    const c = this.children.get(n);
    if (c instanceof FakeFile) return c;
    if (!opts?.create) throw new DOMException("Not found", "NotFoundError");
    const f = new FakeFile(n);
    this.children.set(n, f);
    return f;
  }
  async *entries(): AsyncIterableIterator<[string, FakeDir | FakeFile]> {
    for (const [k, v] of this.children) yield [k, v] as [string, FakeDir | FakeFile];
  }
  /** Real browsers expose removeEntry; the review writer cleans its temp file with it. */
  async removeEntry(name: string): Promise<void> {
    if (!this.children.has(name)) throw new DOMException("Not found", "NotFoundError");
    this.children.delete(name);
  }
}
