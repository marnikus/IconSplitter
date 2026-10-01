// TDD cycle R5 — reviewio: reading, atomic writing and corrupt handling of
// review-decisions.json against in-memory FS fakes (RULE 8, RULE 13, RULE 23).
import { describe, expect, it } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import {
  backupReviewFile, loadReviewFile, saveReviewFile, REVIEW_FILE, tmpName,
} from "../src/lib/reviewio";
import { blankReviewFile, parseReviewFile, upsertRecord, type DecisionRecord } from "../src/lib/reviewfile";

const rec = (id: string, decision: DecisionRecord["decision"] = "approved"): DecisionRecord => ({
  pair_id: id, source: `${id}.png`, ai_result: `${id}_AI.png`, decision, reviewed_at: "2026-10-01T10:00:00.000Z",
});

function fileWith(text: string): { dir: FakeDir; file: FakeFile } {
  const dir = new FakeDir("root");
  const file = new FakeFile(REVIEW_FILE, text.length, 1000, text);
  dir.children.set(REVIEW_FILE, file);
  return { dir, file };
}

/** Directory whose files support `move()` — the atomic rename lane. */
class MovingDir extends FakeDir {
  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FakeFile> {
    const found = await super.getFileHandle(name, opts);
    if (found instanceof MovingFile) return found;
    const moved = new MovingFile(name, this, found.size, found.mtime, found.text);
    this.children.set(name, moved);
    return moved;
  }
}

class MovingFile extends FakeFile {
  constructor(name: string, private parent: FakeDir, size = 0, mtime = 0, text = "") {
    super(name, size, mtime, text);
  }
  async move(newName: string): Promise<void> {
    this.parent.children.delete(this.name);
    this.parent.children.set(newName, this);
    this.name = newName;
  }
}

/** Directory whose file handle refuses to be renamed — the fallback lane. */
class StubbornDir extends FakeDir {
  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FakeFile> {
    const found = await super.getFileHandle(name, opts);
    if (found instanceof StubbornFile) return found;
    const stubborn = new StubbornFile(name, found.size, found.mtime, found.text);
    this.children.set(name, stubborn);
    return stubborn;
  }
}

class StubbornFile extends FakeFile {
  async move(): Promise<void> {
    throw new DOMException("move not allowed", "NotAllowedError");
  }
}

/** Directory whose temp-file writes cannot be closed — the save must fail loudly. */
class FailTmpDir extends FakeDir {
  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FakeFile> {
    if (name === tmpName()) {
      const sealed = new SealedFile(name);
      this.children.set(name, sealed);
      return sealed;
    }
    return super.getFileHandle(name, opts);
  }
}

class SealedFile extends FakeFile {
  async createWritable() {
    return {
      write: async () => {},
      close: async () => { throw new DOMException("disk full", "NotReadableError"); },
    };
  }
}

describe("loadReviewFile (spec §8, §10)", () => {
  it("reports a missing file and yields a blank, pending model", async () => {
    const loaded = await loadReviewFile(new FakeDir("root"));
    expect(loaded.status).toBe("missing");
    expect(loaded.file).toEqual(blankReviewFile());
  });

  it("reads stored decisions", async () => {
    const stored = upsertRecord(blankReviewFile(), rec("star"));
    const { dir } = fileWith(JSON.stringify(stored));
    const loaded = await loadReviewFile(dir);
    expect(loaded.status).toBe("ok");
    expect(loaded.file.records[0].pair_id).toBe("star");
  });

  it("reports a corrupt file with a reason and leaves it untouched on disk", async () => {
    const { dir, file } = fileWith("{oops");
    const loaded = await loadReviewFile(dir);
    expect(loaded.status).toBe("corrupt");
    expect(loaded.reason).toMatch(/json/i);
    expect(file.text).toBe("{oops");
    expect(loaded.file.records).toEqual([]);
  });

  it("treats an empty file as missing rather than corrupt", async () => {
    const loaded = await loadReviewFile(fileWith("").dir);
    expect(loaded.status).toBe("missing");
  });
});

describe("saveReviewFile — atomic delivery (RULE 23)", () => {
  it("writes the JSON so it can be read back after a restart", async () => {
    const dir = new FakeDir("root");
    const model = upsertRecord(blankReviewFile(), rec("star", "declined"));
    const strategy = await saveReviewFile(dir, model);
    const reloaded = await loadReviewFile(dir);
    expect(strategy).toBe("written");
    expect(reloaded.status).toBe("ok");
    expect(reloaded.file.records[0].decision).toBe("declined");
  });

  it("renames a temp file onto the target when the browser supports move()", async () => {
    const dir = new MovingDir("root");
    const strategy = await saveReviewFile(dir, upsertRecord(blankReviewFile(), rec("a")));
    expect(strategy).toBe("moved");
    expect(dir.children.has(tmpName())).toBe(false);
    const text = (dir.children.get(REVIEW_FILE) as FakeFile).text;
    expect(parseReviewFile(text).ok).toBe(true);
  });

  it("keeps the previous file intact when the write fails (never a partial file)", async () => {
    const dir = new FailTmpDir("root");
    const previous = new FakeFile(REVIEW_FILE, 24, 1000, '{"version":1,"records":[]}');
    dir.children.set(REVIEW_FILE, previous);
    await expect(saveReviewFile(dir, upsertRecord(blankReviewFile(), rec("a")))).rejects.toThrow(/disk full/i);
    expect(dir.children.get(REVIEW_FILE)).toBe(previous);
    expect(previous.text).toBe('{"version":1,"records":[]}');
  });
});

describe("backupReviewFile (spec §8 — never silently lose decisions)", () => {
  it("copies the corrupt payload aside under a timestamped name", async () => {
    const { dir } = fileWith("{oops");
    const name = await backupReviewFile(dir, "{oops", "2026-10-01T12-00-00");
    expect(name).toBe("review-decisions.corrupt-2026-10-01T12-00-00.json");
    expect((dir.children.get(name) as FakeFile).text).toBe("{oops");
    expect((dir.children.get(REVIEW_FILE) as FakeFile).text).toBe("{oops");
  });

  it("never overwrites an existing backup name", async () => {
    const { dir } = fileWith("{oops");
    const first = await backupReviewFile(dir, "{oops", "stamp");
    const second = await backupReviewFile(dir, "{oops2", "stamp");
    expect(second).not.toBe(first);
    expect((dir.children.get(first) as FakeFile).text).toBe("{oops");
    expect((dir.children.get(second) as FakeFile).text).toBe("{oops2");
  });
});
describe("atomic write fallbacks (RULE 23)", () => {
  it("falls back to createWritable when the browser refuses move()", async () => {
    const dir = new StubbornDir("root");
    const strategy = await saveReviewFile(dir, upsertRecord(blankReviewFile(), rec("a")));
    expect(strategy).toBe("written");
    expect(dir.children.has(tmpName())).toBe(false);
    expect(parseReviewFile((dir.children.get(REVIEW_FILE) as FakeFile).text).ok).toBe(true);
  });

  it("reports an unreadable file as missing instead of throwing", async () => {
    class UnreadableFile extends FakeFile {
      async getFile(): Promise<File> {
        throw new DOMException("gone", "NotFoundError");
      }
    }
    const dir = new FakeDir("root");
    dir.children.set(REVIEW_FILE, new UnreadableFile(REVIEW_FILE));
    const loaded = await loadReviewFile(dir);
    expect(loaded.status).toBe("missing");
    expect(loaded.file.records).toEqual([]);
  });
});
