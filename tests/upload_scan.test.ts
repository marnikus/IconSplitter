// RULE 8 — the upload scan orchestration runs for real: one ticket per scan,
// one complete commit, an unchanged snapshot commits nothing, a superseded
// scan commits nothing, and failures report instead of throwing.
import { describe, expect, it } from "vitest";
import { SCAN_IDLE } from "../src/lib/scanseq";
import { scanUpload, auditLine, type UploadScanRefs, type UploadScanSetters } from "../src/upload/scan";
import type { UploadDiscovery } from "../src/upload/discovery";
import type { UploadRowSource } from "../src/upload/discovery";
import { serializePairMeta } from "../src/lib/pairmeta";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";

const OUT = "_split_output/2026-10/2026-10-01_10-24-31";
const DIR = `${OUT}/fog_AI/split_01`;
const AI = "fog_AI.png";
const STEM = "fog_AI";

function rootWith(svgText: string): FakeDir {
  const root = new FakeDir("test_processing");
  let node = root;
  for (const part of DIR.split("/")) {
    const child = node.children.get(part);
    if (child instanceof FakeDir) node = child;
    else {
      const made = new FakeDir(part);
      node.children.set(part, made);
      node = made;
    }
  }
  node.children.set(AI, new FakeFile(AI, 20, 3100, "ai"));
  node.children.set(`${STEM}.svg`, new FakeFile(`${STEM}.svg`, svgText.length, 3400, svgText));
  const meta = pairFile(DIR, AI, {
    versions: [svgVersion(`${DIR}/${STEM}.svg`, { version: 1, review: "approved" })],
  });
  node.children.set(`${STEM}.svg.json`, new FakeFile(`${STEM}.svg.json`, 10, 3300, serializePairMeta(meta)));
  return root;
}

interface Recorder {
  setters: UploadScanSetters;
  rootName: string[];
  rows: UploadRowSource[][];
  discovery: (UploadDiscovery | null)[];
  busy: (string | null)[];
  said: string[];
}

function recorder(): Recorder {
  const rec: Recorder = {
    setters: {
      setRootName: (name) => { rec.rootName.push(name); },
      setRows: (rows) => { rec.rows.push(rows); },
      setDiscovery: (d) => { rec.discovery.push(d); },
      setBusy: (b) => { rec.busy.push(b); },
      say: (msg) => { rec.said.push(msg); },
    },
    rootName: [], rows: [], discovery: [], busy: [], said: [],
  };
  return rec;
}

function refs(): UploadScanRefs {
  return { seq: { ...SCAN_IDLE }, scanKey: { current: null } };
}

describe("scanUpload — one ticket, one complete commit", () => {
  it("commits rows, discovery and the root name exactly once", async () => {
    const rec = recorder();
    const r = refs();
    await scanUpload(r, rootWith("<svg/>"), rec.setters);
    expect(rec.rows).toHaveLength(1);
    expect(rec.rows[0]).toHaveLength(1);
    expect(rec.rows[0][0].svgPath).toBe(`${DIR}/${STEM}.svg`);
    expect(rec.discovery).toHaveLength(1);
    expect(rec.rootName).toEqual(["test_processing"]);
    expect(rec.busy).toEqual(["Scanning approved SVGs…", null]);
    expect(r.scanKey.current).not.toBeNull();
  });

  it("writes the folder's snapshot key and never touches the API key beside it", async () => {
    const rec = recorder();
    const r = refs();
    // The panel hands the scan its whole ref bag, and `key` there is the API
    // key. The reported 400 came from exactly this: a scan that wrote the
    // folder hash into `key` — the saved key was replaced by `6bcab92d` and the
    // provider refused it. One ref, one meaning (SvgRefs.scanKey).
    const apiKey = { current: "the-key-the-user-saved" };
    const panelRefs: UploadScanRefs & { key: { current: string | null } } = { ...r, key: apiKey };
    await scanUpload(panelRefs, rootWith("<svg/>"), rec.setters);
    expect(r.scanKey.current).not.toBeNull();
    expect(apiKey.current).toBe("the-key-the-user-saved");
  });

  it("an unchanged snapshot commits nothing", async () => {
    const rec = recorder();
    const r = refs();
    const root = rootWith("<svg/>");
    await scanUpload(r, root, rec.setters);
    await scanUpload(r, root, rec.setters);
    expect(rec.rows).toHaveLength(1); // only the first scan committed
    expect(rec.discovery).toHaveLength(1);
  });

  it("a changed SVG re-commits", async () => {
    const rec = recorder();
    const r = refs();
    const root = rootWith("<svg/>");
    await scanUpload(r, root, rec.setters);
    const pairNode = (function find(dir: FakeDir, parts: string[]): FakeDir {
      let cur = dir;
      for (const part of parts) cur = cur.children.get(part) as FakeDir;
      return cur;
    })(root, DIR.split("/"));
    pairNode.children.set(`${STEM}.svg`, new FakeFile(`${STEM}.svg`, 99, 9999, "<svg>changed</svg>"));
    await scanUpload(r, root, rec.setters);
    expect(rec.rows).toHaveLength(2);
    expect(rec.rows[1][0].fingerprint).toBe("18:9999");
  });

  it("a superseded scan commits nothing", async () => {
    const rec = recorder();
    const r = refs();
    const root = rootWith("<svg/>");
    const first = scanUpload(r, root, rec.setters);
    const second = scanUpload(r, root, rec.setters); // takes the newer ticket
    await Promise.all([first, second]);
    expect(rec.rows.length).toBeLessThanOrEqual(1); // only the newest may commit
  });

  it("a failing discovery reports instead of throwing", async () => {
    const rec = recorder();
    const r = refs();
    const root = new FakeDir("test_processing");
    root.children.set("boom", {
      kind: "directory",
      name: "boom",
      children: new Map(),
      getDirectoryHandle: async () => { throw new Error("nope"); },
      getFileHandle: async () => { throw new Error("nope"); },
      entries: () => { throw new Error("nope"); },
      removeEntry: async () => { throw new Error("nope"); },
      resolve: async () => null,
    } as unknown as FakeDir);
    await scanUpload(r, root, rec.setters);
    expect(rec.said.some((m) => m.includes("Rescan failed"))).toBe(true);
    expect(rec.rows).toHaveLength(0);
  });
});

describe("auditLine — one wording for the bar and the log", () => {
  it("summarizes the discovery", async () => {
    const rec = recorder();
    const r = refs();
    await scanUpload(r, rootWith("<svg/>"), rec.setters);
    expect(rec.discovery[0]).not.toBeNull();
    expect(auditLine(rec.discovery[0] as UploadDiscovery)).toContain("1 approved SVG(s)");
  });
});
