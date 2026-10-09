// Shared in-memory fakes implementing the fs.ts handle interfaces (RULE 8).
import type { DirHandleLike, FileHandleLike, WritableLike } from "../../src/lib/fs";

export class FakeFile implements FileHandleLike {
  kind = "file" as const;
  /** The exact bytes written, once anything has been written (JPEG-safe). */
  data: Blob | null = null;
  constructor(public name: string, public size = 10, public mtime = 1000, public text = "data") {}
  async getFile(): Promise<File> {
    const f = new File([this.data ?? (this.text as unknown as BlobPart)], this.name);
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
        this.data = merged; // byte-exact: a written JPEG must read back as a JPEG
        this.size = merged.size;
        this.text = await merged.text();
      },
    };
  }
}

export class FakeDir implements DirHandleLike {
  kind = "directory" as const;
  children = new Map<string, FakeDir | FakeFile>();
  /** Other handles that name THIS folder (another pick session, a restore). */
  private aliases = new Set<unknown>();
  constructor(public name: string) {}

  /**
   * A SECOND handle for this same folder — what another pick session, or a
   * restore from IndexedDB, hands back. Both handles answer `isSameEntry` for
   * each other, as the platform does for one entry (I-63: a handle, not a name,
   * is what proves a captured path belongs to the folder on screen).
   */
  alias(): DirHandleLike {
    const twin = {
      kind: "directory", name: this.name,
      resolve: async () => null,
      // an arrow keeps `this` the folder, so the twin and the folder answer for
      // each other exactly as two handles of one entry do
      isSameEntry: async (other: unknown) => other === twin || other === (this as unknown),
    };
    this.aliases.add(twin);
    return twin as unknown as DirHandleLike;
  }
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
  async removeEntry(n: string, opts?: { recursive?: boolean }): Promise<void> {
    const child = this.children.get(n);
    if (child instanceof FakeDir && opts?.recursive === true) {
      this.children.delete(n);
      return;
    }
    if (!this.children.delete(n)) throw new DOMException("Not found", "NotFoundError");
  }
  /**
   * The real `FileSystemDirectoryHandle.resolve`: the segments from HERE to the
   * given descendant, `[]` for this folder itself, `null` when it is not below
   * (I-51 — the app's second source for a picked folder's full path).
   */
  async resolve(possible: DirHandleLike): Promise<string[] | null> {
    const hit = walkTo(this, possible as unknown as FakeDir | FakeFile, []);
    return hit;
  }
  /**
   * The real `isSameEntry`: two handles name the same folder. For a fake the
   * object IS the folder, so identity is the answer (I-63 — a handle, not a
   * name, is what proves a captured full path belongs to the folder on screen).
   */
  async isSameEntry(other: DirHandleLike): Promise<boolean> {
    return (other as unknown) === (this as unknown) || this.aliases.has(other);
  }
}

/** The segment list from `from` down to `target`, or null when not below it. */
function walkTo(from: FakeDir, target: FakeDir | FakeFile, trail: string[]): string[] | null {
  if ((from as unknown) === (target as unknown)) return trail;
  for (const [name, child] of from.children) {
    if (!(child instanceof FakeDir)) {
      if ((child as unknown) === (target as unknown)) return [...trail, name];
      continue;
    }
    const hit = walkTo(child, target, [...trail, name]);
    if (hit !== null) return hit;
  }
  return null;
}

/** FakeFile whose read fails the first n times — a file being replaced mid-scan. */
export class FlakyFile extends FakeFile {
  constructor(name: string, private failures = 1) {
    super(name);
  }
  async getFile(): Promise<File> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new DOMException("file changed on disk", "NotReadableError");
    }
    return super.getFile();
  }
}

/** FakeFile that can never be read — a locked file. */
export class LockedFile extends FakeFile {
  async getFile(): Promise<never> {
    throw new DOMException("locked", "NotReadableError");
  }
}

/** FakeFile whose createWritable rejects — for failure-path tests. */
export class BrokenFile extends FakeFile {
  async createWritable(): Promise<never> {
    throw new Error("disk full");
  }
}
