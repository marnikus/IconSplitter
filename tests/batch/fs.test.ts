// RULE 8 — fs helpers run for real against in-memory handles; only the
// browser FS API + Image decoding are faked. Deleting helpers fails here.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canPickFolders,
  ensureDir,
  ensureFirstFreeDir,
  isNotFound,
  loadImageFromFile,
  pickFolder,
  readTextFile,
  tryGetDir,
  tryGetFile,
  writeFile,
  writeFirstFree,
  type FsDirHandle,
} from "../../src/batch/fs";
import { FakeDir, FakeFile, domError, seedDir, seedFile } from "./fakes";

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
});

describe("isNotFound", () => {
  it("narrows NotFoundError only", () => {
    expect(isNotFound(domError("NotFoundError"))).toBe(true);
    expect(isNotFound(domError("SecurityError"))).toBe(false);
    expect(isNotFound(new Error("x"))).toBe(false);
    expect(isNotFound(null)).toBe(false);
  });
});

describe("tryGetFile / tryGetDir", () => {
  it("returns handles, null when missing, rethrows other errors", async () => {
    const root = new FakeDir("root");
    seedFile(root, "a.png", "img");
    seedDir(root, "sub");
    expect(await tryGetFile(root, "a.png")).not.toBeNull();
    expect(await tryGetFile(root, "nope.png")).toBeNull();
    expect(await tryGetDir(root, "sub")).not.toBeNull();
    expect(await tryGetDir(root, "nope")).toBeNull();
    const hostile = {
      kind: "directory",
      name: "x",
      values: async function* () {},
      getFileHandle: async () => {
        throw domError("SecurityError");
      },
      getDirectoryHandle: async () => {
        throw domError("SecurityError");
      },
    } as unknown as FsDirHandle;
    await expect(tryGetFile(hostile, "a")).rejects.toThrow("SecurityError");
    await expect(tryGetDir(hostile, "a")).rejects.toThrow("SecurityError");
  });
});

describe("ensureDir / ensureFirstFreeDir", () => {
  it("opens existing dirs and creates missing ones", async () => {
    const root = new FakeDir("root");
    seedDir(root, "old");
    expect((await ensureDir(root, "old")).name).toBe("old");
    expect((await ensureDir(root, "new")).name).toBe("new");
    expect(root.dirs.has("new")).toBe(true);
  });

  it("picks the first free candidate, never reusing a taken name", async () => {
    const root = new FakeDir("root");
    seedDir(root, "icon_AI");
    const r = await ensureFirstFreeDir(root, ["icon_AI", "icon_AI_v02", "icon_AI_v03"]);
    expect(r.name).toBe("icon_AI_v02");
    expect(root.dirs.has("icon_AI_v02")).toBe(true);
    await expect(ensureFirstFreeDir(root, ["icon_AI", "icon_AI_v02"])).rejects.toThrow("No free folder name");
  });
});

describe("writeFile / writeFirstFree / readTextFile", () => {
  it("writes and reads back; missing files read as null", async () => {
    const root = new FakeDir("root");
    await writeFile(root, "s.json", '{"a":1}');
    expect(await readTextFile(root, "s.json")).toBe('{"a":1}');
    expect(await readTextFile(root, "nope.json")).toBeNull();
    await writeFile(root, "b.bin", new Uint8Array([1, 2]).buffer);
    expect(root.files.get("b.bin")?.bytes).toEqual(new Uint8Array([1, 2]));
  });

  it("writeFirstFree skips taken names and fails closed when exhausted", async () => {
    const root = new FakeDir("root");
    seedFile(root, "a_01.png", "taken");
    expect(await writeFirstFree(root, ["a_01.png", "a_v02_01.png"], "fresh")).toBe("a_v02_01.png");
    expect(await readTextFile(root, "a_01.png")).toBe("taken");
    await expect(writeFirstFree(root, ["a_01.png", "a_v02_01.png"], "x")).rejects.toThrow("No free file name");
  });
});

describe("canPickFolders / pickFolder", () => {
  it("fails open when the picker API is missing (RULE 9)", async () => {
    expect(canPickFolders()).toBe(false);
    await expect(pickFolder()).resolves.toBeNull();
  });

  it("returns the picked handle, null on abort, rethrows denial", async () => {
    const w = window as unknown as Record<string, unknown>;
    const picked = new FakeDir("src");
    w.showDirectoryPicker = async () => picked;
    expect(canPickFolders()).toBe(true);
    await expect(pickFolder()).resolves.toBe(picked);
    w.showDirectoryPicker = async () => {
      throw domError("AbortError");
    };
    await expect(pickFolder()).resolves.toBeNull();
    w.showDirectoryPicker = async () => {
      throw domError("SecurityError");
    };
    await expect(pickFolder()).rejects.toThrow("SecurityError");
  });
});

describe("loadImageFromFile", () => {
  const okImage = () => {
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 40;
        naturalHeight = 30;
        onload: (() => void) | null = null;
        set src(_u: string) {
          this.onload?.();
        }
      },
    );
  };

  it("decodes bytes into an image element", async () => {
    okImage();
    const img = await loadImageFromFile(new FakeFile("a.png", "image/png", new Uint8Array([1]), 7));
    expect(img.naturalWidth).toBe(40);
    expect(img.naturalHeight).toBe(30);
  });

  it("fails closed with an honest message when decoding breaks", async () => {
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_u: string) {
          this.onerror?.();
        }
      },
    );
    await expect(loadImageFromFile(new FakeFile("a.png", "image/png", new Uint8Array([1]), 7))).rejects.toThrow(
      "Could not read image",
    );
  });
});
