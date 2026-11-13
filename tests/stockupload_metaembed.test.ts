import { describe, expect, it } from "vitest";
import { readBytesAt, readTextAt } from "../src/lib/fs";
import { discoverExportedItems } from "../src/lib/stockupload/discovery";
import { readEmbeddedMetadata } from "../src/lib/upload/embed";
import { verifyEpsMetadata } from "../src/lib/upload/epsmetadata";
import { newExportRecord, parseExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { readXmpMetadata } from "../src/lib/upload/jpeg";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upload/meta";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { saveExportedMetadata } from "../src/stockupload/metaembed";
import { FakeDir, FakeFile } from "./helpers/fakefs";

function minimalJpeg(width = 100, height = 100): Uint8Array {
  const sof = [
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
  ];
  return new Uint8Array([0xff, 0xd8, ...sof, 0xff, 0xd9]);
}

const VALID_META: IconMetadata = {
  title: "Minimal line icon showing sustainable clean energy",
  description: "Minimalist line icon representing renewable solar power and ecological sustainability",
  tags: [...MANDATORY_TAGS, "solar", "energy", "green", "power", "sustainability"],
  creator: "Studio M",
  copyright: "Copyright 2026 Studio M",
};

describe("local metadata editing & in-place carrier re-embedding", () => {
  it("validates fields and refuses invalid metadata without touching exported files", async () => {
    const root = new FakeDir("ws");
    const sub = new FakeDir("export");
    root.children.set("export", sub);

    const rec = newExportRecord({
      pair: { id: "icon-1", base: "solar", suffix: "", dir: "" },
      source: { svgPath: "solar_AI.svg", version: 1, approval: "approved", fingerprint: "10:1" },
      settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "f" },
      svgo: { enabled: true, version: "3", config: "default", beforeBytes: 10, afterBytes: 10, beforeHash: "0", afterHash: "0" },
      epsEnabled: false,
      now: "2026-10-27T10:00:00.000Z",
    });
    rec.stage = "committed";
    rec.status = "processed";
    rec.timestamps.committedAt = "2026-10-27T10:01:00.000Z";
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>';
    rec.outputs = { svg: { path: "export/solar.svg", bytes: svg.length, hash: "sha256:0" }, jpg: null, eps: null };
    const json = serializeExportRecord(rec);
    sub.children.set("export.json", new FakeFile("export.json", json.length, 1000, json));
    sub.children.set("solar.svg", new FakeFile("solar.svg", svg.length, 1000, svg));

    const [item] = (await discoverExportedItems(root)).items;
    const res = await saveExportedMetadata(root, item, { title: "Too short", description: "Short", tags: ["icon"] });
    expect(res.ok).toBe(false);
    expect(await readTextAt(root, "export/solar.svg")).toBe(svg);
  });

  it("re-embeds accepted metadata into JPEG, SVG, and EPS carriers in export/ and updates export.json", async () => {
    const root = new FakeDir("ws");
    const sub = new FakeDir("export");
    root.children.set("export", sub);

    const jpg = minimalJpeg(400, 300);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 12h20"/></svg>';
    const eps = "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n%%EndComments\n0 0 moveto 10 10 lineto stroke\n%%EOF\n";

    const rec = newExportRecord({
      pair: { id: "icon-2", base: "solar_02", suffix: "", dir: "" },
      source: { svgPath: "solar_02_AI.svg", version: 1, approval: "approved", fingerprint: "10:1" },
      settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "f" },
      svgo: { enabled: true, version: "3", config: "default", beforeBytes: 10, afterBytes: 10, beforeHash: "0", afterHash: "0" },
      epsEnabled: true,
      now: "2026-10-27T10:00:00.000Z",
    });
    rec.stage = "committed";
    rec.status = "processed";
    rec.timestamps.committedAt = "2026-10-27T10:01:00.000Z";
    rec.outputs = {
      svg: { path: "export/solar_02.svg", bytes: svg.length, hash: "sha256:s" },
      jpg: { path: "export/solar_02.jpg", bytes: jpg.byteLength, hash: "sha256:j" },
      eps: { path: "export/solar_02.eps", bytes: eps.length, hash: "sha256:e" },
    };
    const json = serializeExportRecord(rec);
    sub.children.set("export.json", new FakeFile("export.json", json.length, 1000, json));
    sub.children.set("solar_02.svg", new FakeFile("solar_02.svg", svg.length, 1000, svg));
    const jpgFile = new FakeFile("solar_02.jpg", jpg.byteLength, 1000);
    jpgFile.data = new Blob([jpg as BlobPart]);
    sub.children.set("solar_02.jpg", jpgFile);
    sub.children.set("solar_02.eps", new FakeFile("solar_02.eps", eps.length, 1000, eps));

    const [item] = (await discoverExportedItems(root)).items;
    const saved = await saveExportedMetadata(root, item, VALID_META, "2026-10-27T12:00:00.000Z");
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const savedSvg = (await readTextAt(root, "export/solar_02.svg"))!;
    expect(readEmbeddedMetadata(savedSvg)).toEqual(saved.metadata);

    const savedJpg = (await readBytesAt(root, "export/solar_02.jpg"))!;
    expect(readXmpMetadata(savedJpg)).toEqual(saved.metadata);

    const savedEps = (await readTextAt(root, "export/solar_02.eps"))!;
    expect(verifyEpsMetadata(savedEps, saved.metadata)).toBe(true);

    const updatedRec = parseExportRecord(JSON.parse((await readTextAt(root, "export/export.json"))!))!;
    expect(updatedRec.metadata?.state).toBe("accepted");
    expect(updatedRec.metadata?.title).toBe(saved.metadata.title);
    expect(updatedRec.metadata?.creator).toBe("Studio M");
    expect(updatedRec.outputs.jpg?.bytes).toBe(savedJpg.byteLength);
  });
});
