// upload_download_run.test.ts — the I/O of "Download all" over real export bytes
// (RULE 8). A committed package is read from a fake picked root, the copies land
// in a fake folder the user chose, and every claim the summary makes is checked
// on that folder: byte-identical copies under one stem; no overwrite (a clash
// moves the whole trio to _v02); a changed or missing file is never delivered
// while its siblings are; one icon's refused write is isolated; a short or
// half-written copy is removed and reported; a cancel stops between icons; and
// the package folder is never changed by a download.
import { describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../src/lib/upload/hash";
import {
  planDownload, type DownloadRunResult, type DownloadSubject, type PlannedIcon,
} from "../src/lib/upload/download";
import { newExportRecord, type ExportRecord } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS, settingsFingerprint } from "../src/lib/upload/settings";
import { runDownload } from "../src/upload/downloadrun";
import { BinDir, BinFile } from "./helpers/binfakefs";

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
/** A JPEG-like binary body: not valid UTF-8, so any text round-trip would corrupt it. */
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const FOG = { svg: "<svg>fog</svg>", jpg: JPG, eps: "%!PS-Adobe-3.0 EPSF-3.0 fog" };
const ARCH = { svg: "<svg>arch</svg>", jpg: Uint8Array.from([0xff, 0xd8, 0xaa, 0xbb, 0xff, 0xd9]), eps: "%!PS arch" };

interface Package { svg: string; jpg: Uint8Array; eps: string | null }

/** Walks (and creates) a folder path under a fake root. */
function dirOf(root: BinDir, path: string): BinDir {
  let cur = root;
  for (const seg of path.split("/")) {
    const next = cur.children.get(seg);
    if (next instanceof BinDir) {
      cur = next;
    } else {
      const made = new BinDir(seg);
      cur.children.set(seg, made);
      cur = made;
    }
  }
  return cur;
}

/** A committed record as the export writes it: outputs with size and sha256, EPS switch. */
async function committedRecord(dirPath: string, stem: string, pkg: Package, epsOn: boolean): Promise<ExportRecord> {
  const put = async (ext: "svg" | "jpg" | "eps", body: Uint8Array): Promise<{ path: string; bytes: number; hash: string }> => ({
    path: `${dirPath}/export/${stem}.${ext}`, bytes: body.length, hash: `sha256:${await sha256Hex(body)}`,
  });
  const eps = pkg.eps === null || !epsOn ? null : await put("eps", enc(pkg.eps));
  const base = newExportRecord({
    pair: { id: `${dirPath}/${stem}`, base: stem, suffix: "", dir: dirPath },
    source: { svgPath: `${dirPath}/${stem}_AI.svg`, version: 1, approval: "approved", fingerprint: "sha256:src" },
    settings: {
      defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS,
      fingerprint: settingsFingerprint(DEFAULT_UPLOAD_SETTINGS),
    },
    svgo: { enabled: false, version: "", config: "", beforeBytes: 0, afterBytes: 0, beforeHash: "", afterHash: "" },
    epsEnabled: epsOn,
    now: "2026-10-08T10:00:00.000Z",
  });
  const status = epsOn && pkg.eps === null ? "partial" : "processed";
  return {
    ...base, status,
    outputs: { svg: await put("svg", enc(pkg.svg)), jpg: await put("jpg", pkg.jpg), eps },
  };
}

/** Writes one package into the root (its files and its record) and plans it as a finished row would be. */
async function commitPackage(root: BinDir, dirPath: string, stem: string, pkg: Package, epsOn = true): Promise<PlannedIcon> {
  const folder = dirOf(root, `${dirPath}/export`);
  folder.children.set(`${stem}.svg`, new BinFile(`${stem}.svg`, enc(pkg.svg)));
  folder.children.set(`${stem}.jpg`, new BinFile(`${stem}.jpg`, pkg.jpg));
  if (pkg.eps !== null) folder.children.set(`${stem}.eps`, new BinFile(`${stem}.eps`, enc(pkg.eps)));
  const record = await committedRecord(dirPath, stem, pkg, epsOn);
  const subject: DownloadSubject = {
    id: `${dirPath}/${stem}`, svgName: `${stem}_AI.svg`, status: record.status,
    stale: false, running: false, record,
  };
  const plan = planDownload([subject], [subject.id]);
  if (plan.icons.length !== 1) throw new Error("the fixture package is not ready to download");
  return plan.icons[0];
}

/** A destination whose files can be made to refuse, land short, or fail midway (RULE 15). */
type WriteMode = "ok" | "refuse" | "short" | "fail-write";

class ScriptedFile extends BinFile {
  constructor(name: string, private readonly mode: WriteMode, private readonly onClosed: (name: string) => void) {
    super(name);
  }
  override async createWritable() {
    if (this.mode === "refuse") throw new DOMException("Denied", "NotAllowedError");
    const real = await super.createWritable();
    return {
      write: async (d: Blob) => {
        if (this.mode === "short") return real.write(d.slice(0, Math.floor(d.size / 2)));
        if (this.mode === "fail-write") {
          await real.write(d.slice(0, 3));
          throw new Error("disk full");
        }
        return real.write(d);
      },
      close: async () => {
        await real.close();
        this.onClosed(this.name);
      },
    };
  }
}

class ScriptedDir extends BinDir {
  constructor(name: string, private readonly modeOf: (name: string) => WriteMode = () => "ok",
    private readonly onClosed: (name: string) => void = () => undefined) {
    super(name);
  }
  override async getFileHandle(n: string, opts?: { create?: boolean }) {
    if (!opts?.create || this.children.has(n)) return super.getFileHandle(n, opts);
    const made = new ScriptedFile(n, this.modeOf(n), this.onClosed);
    this.children.set(n, made);
    return made;
  }
}

function namesOf(dir: BinDir): string[] {
  return [...dir.children.keys()].sort();
}

function textOf(dir: BinDir, name: string): string {
  return (dir.children.get(name) as BinFile).text;
}

function bytesOf(dir: BinDir, name: string): number[] {
  return Array.from((dir.children.get(name) as BinFile).bytes);
}

/** Every file under a root, as hex, so a before/after comparison sees each byte. */
function snapshotOf(dir: BinDir, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, child] of dir.children) {
    const path = `${prefix}${name}`;
    if (child instanceof BinDir) Object.assign(out, snapshotOf(child, `${path}/`));
    else out[path] = Buffer.from((child as BinFile).bytes).toString("hex");
  }
  return out;
}

async function runInto(dest: BinDir, icons: PlannedIcon[], root: BinDir, over: { signal?: AbortSignal; onProgress?: (i: number, total: number, name: string) => void } = {}): Promise<DownloadRunResult> {
  return runDownload({
    root, dest, icons, signal: over.signal ?? new AbortController().signal,
    onProgress: over.onProgress ?? (() => undefined),
  });
}

describe("runDownload — the folder gets the verified bytes, never an overwrite", () => {
  it("saves each file under the icon's stem, byte-identical to its package", async () => {
    const root = new BinDir("architecture");
    const icon = await commitPackage(root, "cat/split_01", "fog", FOG);
    const dest = new BinDir("Stock");
    const result = await runInto(dest, [icon], root);
    expect(result).toEqual({ done: 1, stopped: false, saved: 3, savedIcons: 1, missing: 0, renamed: 0, failures: [] });
    expect(namesOf(dest)).toEqual(["fog.eps", "fog.jpg", "fog.svg"]);
    expect(textOf(dest, "fog.svg")).toBe(FOG.svg);
    expect(textOf(dest, "fog.eps")).toBe(FOG.eps);
    expect(bytesOf(dest, "fog.jpg")).toEqual(Array.from(FOG.jpg));
  });

  it("never overwrites a file the folder already holds: the whole trio moves to _v02", async () => {
    const root = new BinDir("architecture");
    const icon = await commitPackage(root, "cat/split_01", "fog", FOG);
    const dest = new BinDir("Stock");
    dest.children.set("fog.svg", new BinFile("fog.svg", "my own drawing"));
    const result = await runInto(dest, [icon], root);
    expect(textOf(dest, "fog.svg")).toBe("my own drawing");
    expect(namesOf(dest)).toEqual(["fog.svg", "fog_v02.eps", "fog_v02.jpg", "fog_v02.svg"]);
    expect(result).toMatchObject({ saved: 3, savedIcons: 1, renamed: 1, failures: [] });
  });

  it("a clash on any one name moves the trio, so the three files stay together", async () => {
    const root = new BinDir("architecture");
    const icon = await commitPackage(root, "cat/split_01", "fog", FOG);
    const dest = new BinDir("Stock");
    dest.children.set("fog.jpg", new BinFile("fog.jpg", "their jpg"));
    await runInto(dest, [icon], root);
    expect(namesOf(dest)).toEqual(["fog.jpg", "fog_v02.eps", "fog_v02.jpg", "fog_v02.svg"]);
    expect(textOf(dest, "fog.jpg")).toBe("their jpg");
  });

  it("two icons with the same stem in one run never share a name", async () => {
    const root = new BinDir("architecture");
    const first = await commitPackage(root, "cat/a", "fog", FOG);
    const second = await commitPackage(root, "cat/b", "fog", ARCH);
    const dest = new BinDir("Stock");
    const result = await runInto(dest, [first, second], root);
    expect(namesOf(dest)).toEqual(["fog.eps", "fog.jpg", "fog.svg", "fog_v02.eps", "fog_v02.jpg", "fog_v02.svg"]);
    expect(textOf(dest, "fog_v02.svg")).toBe(ARCH.svg);
    expect(result).toMatchObject({ saved: 6, savedIcons: 2, renamed: 1 });
  });

  it("reads the folder again on every run, so a second run never overwrites the first", async () => {
    const root = new BinDir("architecture");
    const icon = await commitPackage(root, "cat/split_01", "fog", FOG);
    const dest = new BinDir("Stock");
    await runInto(dest, [icon], root);
    const again = await runInto(dest, [icon], root);
    expect(again).toMatchObject({ saved: 3, renamed: 1 });
    expect(namesOf(dest)).toHaveLength(6);
    expect(textOf(dest, "fog.svg")).toBe(FOG.svg);
  });

  it("a file changed on disk since its export is not delivered; its siblings are", async () => {
    const root = new BinDir("architecture");
    const icon = await commitPackage(root, "cat/split_01", "fog", FOG);
    dirOf(root, "cat/split_01/export").children.set("fog.jpg", new BinFile("fog.jpg", enc("edited after export")));
    const dest = new BinDir("Stock");
    const result = await runInto(dest, [icon], root);
    expect(result).toMatchObject({ saved: 2, savedIcons: 1, missing: 1, failures: [] });
    expect(namesOf(dest)).toEqual(["fog.eps", "fog.svg"]);
  });

  it("a file gone from the package is reported as missing, and the rest are delivered", async () => {
    const root = new BinDir("architecture");
    const icon = await commitPackage(root, "cat/split_01", "fog", FOG);
    dirOf(root, "cat/split_01/export").children.delete("fog.eps");
    const dest = new BinDir("Stock");
    const result = await runInto(dest, [icon], root);
    expect(result).toMatchObject({ saved: 2, missing: 1 });
    expect(namesOf(dest)).toEqual(["fog.jpg", "fog.svg"]);
  });

  it("a partial package (its EPS stage failed) delivers SVG and JPG and counts the EPS as missing", async () => {
    const root = new BinDir("architecture");
    const icon = await commitPackage(root, "cat/split_01", "fog", { ...FOG, eps: null }, true);
    expect(icon.absent).toEqual(["eps"]);
    const dest = new BinDir("Stock");
    const result = await runInto(dest, [icon], root);
    expect(result).toMatchObject({ saved: 2, savedIcons: 1, missing: 1 });
    expect(namesOf(dest)).toEqual(["fog.jpg", "fog.svg"]);
  });

  it("a package exported without EPS is not counted as missing an EPS", async () => {
    const root = new BinDir("architecture");
    const icon = await commitPackage(root, "cat/split_01", "fog", { ...FOG, eps: null }, false);
    const result = await runInto(new BinDir("Stock"), [icon], root);
    expect(result).toMatchObject({ saved: 2, missing: 0 });
  });

  it("one icon's refused write is isolated: its other files and the other icons still land", async () => {
    const root = new BinDir("architecture");
    const fog = await commitPackage(root, "cat/a", "fog", FOG);
    const arch = await commitPackage(root, "cat/b", "arch", ARCH);
    const dest = new ScriptedDir("Stock", (n) => (n === "fog.jpg" ? "refuse" : "ok"));
    const result = await runInto(dest, [fog, arch], root);
    expect(result.saved).toBe(5);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ name: "fog.jpg" });
    expect(result.failures[0].why.startsWith("could not be written")).toBe(true);
    expect(namesOf(dest)).toEqual(["arch.eps", "arch.jpg", "arch.svg", "fog.eps", "fog.svg"]);
  });

  it("a copy that does not read back the same bytes is removed and reported", async () => {
    const root = new BinDir("architecture");
    const icon = await commitPackage(root, "cat/split_01", "fog", FOG);
    const dest = new ScriptedDir("Stock", (n) => (n === "fog.eps" ? "short" : "ok"));
    const result = await runInto(dest, [icon], root);
    expect(result.failures).toEqual([{ name: "fog.eps", why: "the copy did not read back the same bytes" }]);
    expect(result.saved).toBe(2);
    expect(namesOf(dest)).toEqual(["fog.jpg", "fog.svg"]);
  });

  it("a write that fails midway leaves no partial file behind", async () => {
    const root = new BinDir("architecture");
    const icon = await commitPackage(root, "cat/split_01", "fog", FOG);
    const dest = new ScriptedDir("Stock", (n) => (n === "fog.svg" ? "fail-write" : "ok"));
    const result = await runInto(dest, [icon], root);
    expect(result.failures).toEqual([{ name: "fog.svg", why: "could not be written (disk full)" }]);
    expect(namesOf(dest)).toEqual(["fog.eps", "fog.jpg"]);
  });

  it("a cancel between icons keeps what was saved and never starts the next icon", async () => {
    const root = new BinDir("architecture");
    const fog = await commitPackage(root, "cat/a", "fog", FOG);
    const arch = await commitPackage(root, "cat/b", "arch", ARCH);
    const abort = new AbortController();
    const dest = new ScriptedDir("Stock", () => "ok", (name) => { if (name === "fog.eps") abort.abort(); });
    const result = await runInto(dest, [fog, arch], root, { signal: abort.signal });
    expect(result).toMatchObject({ done: 1, stopped: true, saved: 3, savedIcons: 1 });
    expect(namesOf(dest)).toEqual(["fog.eps", "fog.jpg", "fog.svg"]);
  });

  it("reports progress once per icon, before that icon is written", async () => {
    const root = new BinDir("architecture");
    const fog = await commitPackage(root, "cat/a", "fog", FOG);
    const arch = await commitPackage(root, "cat/b", "arch", ARCH);
    const dest = new BinDir("Stock");
    const steps: [number, number, string][] = [];
    await runInto(dest, [fog, arch], root, { onProgress: (i, total, name) => steps.push([i, total, name]) });
    expect(steps).toEqual([[0, 2, "fog_AI.svg"], [1, 2, "arch_AI.svg"]]);
  });

  it("when nothing verifies, the folder gets no file and nothing is reported saved", async () => {
    const root = new BinDir("architecture");
    const icon = await commitPackage(root, "cat/split_01", "fog", FOG);
    const folder = dirOf(root, "cat/split_01/export");
    folder.children.clear();
    const dest = new BinDir("Stock");
    const result = await runInto(dest, [icon], root);
    expect(result).toMatchObject({ done: 1, stopped: false, saved: 0, savedIcons: 0, missing: 3 });
    expect(namesOf(dest)).toEqual([]);
  });

  it("a folder that cannot be listed saves nothing, names the folder, and is not called stopped", async () => {
    const root = new BinDir("architecture");
    const icon = await commitPackage(root, "cat/split_01", "fog", FOG);
    const dest = new BinDir("Stock");
    // a listing that fails on its first step, the way a folder the browser denies does
    dest.entries = async function* () { yield* []; throw new DOMException("denied", "NotAllowedError"); };
    const result = await runInto(dest, [icon], root);
    expect(result).toEqual({
      done: 0, stopped: false, saved: 0, savedIcons: 0, missing: 0, renamed: 0,
      failures: [{ name: "Stock", why: "the folder could not be listed" }],
    });
  });

  it("an unexpected error while one icon is proven costs that icon only: it is named, and the next icon still lands", async () => {
    const root = new BinDir("architecture");
    const fog = await commitPackage(root, "cat/split_01", "fog", FOG);
    const arch = await commitPackage(root, "cat/split_02", "arch", ARCH);
    const dest = new BinDir("Stock");
    const hash = vi.spyOn(crypto.subtle, "digest").mockRejectedValueOnce(new Error("the hash engine stopped"));
    const result = await runInto(dest, [fog, arch], root).finally(() => hash.mockRestore());
    expect(result).toMatchObject({
      done: 2, saved: 3, savedIcons: 1, missing: 0,
      failures: [{ name: fog.name, why: "could not be saved (the hash engine stopped)" }],
    });
    expect(namesOf(dest)).toEqual(["arch.eps", "arch.jpg", "arch.svg"]);
  });

  it("the package folder and its records are never changed by a download", async () => {
    const root = new BinDir("architecture");
    const icon = await commitPackage(root, "cat/split_01", "fog", FOG);
    const before = snapshotOf(root);
    await runInto(new BinDir("Stock"), [icon], root);
    expect(snapshotOf(root)).toEqual(before);
  });
});
