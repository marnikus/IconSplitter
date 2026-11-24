// @vitest-environment happy-dom
// export_eps_identity.test.ts — no programmatic naming, no hashes and no fake
// Illustrator comments in a shipped EPS or SVG (2026-11-24, RULE 26; design
// docs/archive/2026-11-24-eps-identity-scrub/design.md). A reviewer read
// `%%Title: icon-sheet_sheet_14_icons_…_id48996_v1.eps`, `%AI5_ArtSize` with
// height/width "swapped" and `/MetadataDict_dd3a80ee4442f029` as the output of a
// batch script; none of it may reach a file again — and older files are cleaned
// on rename and on upload, while they keep verifying.
import { afterEach, describe, expect, it } from "vitest";
import { writeEps, verifyEps, verifyEpsDocument } from "../src/lib/upload/eps";
import { cleanEpsDocument, stripEpsIdentity } from "../src/lib/upload/epsclean";
import { embedXmpMetadataInEps, readXmpMetadataFromEps, verifiedEpsArtwork, verifyEpsMetadata } from "../src/lib/upload/epsmetadata";
import { prepareMetadataCopy } from "../src/lib/stockupload/sendmeta";
import type { ExportedItem } from "../src/lib/stockupload/types";
import type { IconMetadata } from "../src/lib/upload/meta";
import { validateMetadata } from "../src/lib/upload/meta";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { CONVERTERS } from "../src/lib/upload/epsconv/registry";
import { buildSheetPackage } from "../src/svgBuilder/sheetpackage";
import { writeSheetExport } from "../src/svgBuilder/sheetwriter";
import { renameExportPackage } from "../src/upload/renameexport";
import { parseExportRecord } from "../src/lib/upload/export";
import { sha256Hex } from "../src/lib/upload/hash";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import { ICON_ASSET } from "./helpers/sheetpackage";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const ICON = `<svg ${NS} viewBox="0 0 24 24" width="24" height="24"><rect x="0" y="0" width="24" height="24" fill="#ffffff"/><path d="M2 2h20v20H2z" fill="#112233"/></svg>`;
const META: IconMetadata = { title: "Food icons", description: "Kitchen set", tags: ["food", "kitchen", "cook"] };
const WORK = "icon-sheet_sheet_14_icons_orange_black_palette_id48996_v1";
/** Any identifier with a hex hash glued on (`MetadataDict_dd3a80ee4442f029`, `b1f2e3d4-…`). */
const HASHED = /(?:MetadataDict|MetadataStream|EndPacket)_[0-9a-f]+/;

function built(): string {
  const out = writeEps(ICON, "#ffffff");
  if (!out.ok) throw new Error(out.reason);
  return out.eps;
}

/** What an EPS exported before 2026-11-24 looked like: work-name title, AI5/AI3, hashed envelope. */
function legacyEps(clean: boolean): string {
  const current = embedXmpMetadataInEps(built(), META, clean ? { clean: true } : {});
  const hashed = current
    .replace(/\bMetadataDict\b/g, "MetadataDict_dd3a80ee4442f029")
    .replace(/\bMetadataStream\b/g, "MetadataStream_dd3a80ee4442f029")
    .replace(/%EndPacket\b/g, "%EndPacket_dd3a80ee4442f029");
  return hashed.replace("%%BoundingBox:", `%%Title: ${WORK}.eps\n%%BoundingBox:`)
    .replace("%%EndComments", "%AI5_ArtSize: 18 18\n%AI3_TemplateBox: 9 9 9 9\n%%EndComments");
}

afterEach(() => setTextOutliner(null));

describe("the built-in writer does not fake Illustrator or name the file", () => {
  it("writes no %%Title and no %AI comment — only the EPS 10 DSC block", () => {
    const eps = built();
    const head = eps.split("%%EndComments")[0];
    expect(head).not.toContain("%%Title");
    expect(head).not.toMatch(/^%AI/m);
    expect(eps).not.toContain("AI5_ArtSize");
    expect(eps).not.toContain("AI3_TemplateBox");
    for (const marker of ["%%BoundingBox: 0 0 18 18", "%%HiResBoundingBox: 0 0 18 18", "%%DocumentData: Clean7Bit", "%%LanguageLevel: 3"]) {
      expect(head).toContain(marker);
    }
    expect(verifyEps(eps).ok).toBe(true);
  });

  it("is a new writer id, so the planner rebuilds older EPS files", async () => {
    expect(await CONVERTERS.builtin.probe({ bridgeUrl: "", fetch: globalThis.fetch })).toEqual({ ok: true, version: "builtin-vector-5" });
  });
});

describe("the metadata envelope carries no hash", () => {
  it.each([["clean", true], ["legacy two-carrier", false]])("%s: fixed neutral names, still verified", (_label, clean) => {
    const eps = embedXmpMetadataInEps(built(), META, clean ? { clean: true } : {});
    expect(eps).not.toMatch(HASHED);
    expect(eps).toContain("/MetadataDict 8 dict def");
    expect(eps).toContain("[/_objdef {MetadataStream} /type /stream /OBJ pdfmark");
    expect(eps).toMatch(/^%EndPacket$/m);
    expect(verifyEpsMetadata(eps, META)).toBe(true);
    expect(verifyEpsDocument(eps).ok).toBe(true);
    expect(verifiedEpsArtwork(eps)).not.toContain("<?xpacket");
  });

  it("two different files carry the identical envelope program — nothing ties a file to a batch", () => {
    const a = embedXmpMetadataInEps(built(), META, { clean: true });
    const other = writeEps(ICON.replace("#112233", "#445566"), "#ffffff");
    if (!other.ok) throw new Error(other.reason);
    const b = embedXmpMetadataInEps(other.eps, META, { clean: true });
    const envelope = (t: string) => t.slice(t.indexOf("%BeginDocumentMetadata"), t.indexOf("%EndDocumentMetadata"));
    expect(envelope(a)).toBe(envelope(b));
  });
});

describe("stripEpsIdentity — the always-on scrub before any EPS leaves the app", () => {
  const converter = "%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: cairo 1.18.0 (https://cairographics.org)\n%%CreationDate: Mon Nov 24 10:00:00 2026\n"
    + `%%Title: ${WORK}.eps\n%%For: marni\n%%Copyright: someone\n%%LanguageLevel: 3\n%%BoundingBox: 0 0 20 20\n`
    + "%%HiResBoundingBox: 0 0 20 20\n%AI5_ArtSize: 20 20\n%AI3_TemplateBox: 10 10 10 10\n%AI9_ColorModel: 1\n%AI7_Thumbnail: 1 1 8\n%%EndComments\n"
    + "0 0 moveto 20 0 lineto 20 20 lineto closepath fill\n%%EOF\n";

  it("drops the title, producer lines and every Illustrator private comment, keeps the EPS", () => {
    const out = stripEpsIdentity(converter);
    for (const gone of ["%%Title", "%%Creator", "%%CreationDate", "%%For", "%%Copyright", "%AI", WORK]) expect(out).not.toContain(gone);
    for (const kept of ["%!PS-Adobe-3.0 EPSF-3.0", "%%LanguageLevel: 3", "%%BoundingBox: 0 0 20 20", "%%HiResBoundingBox: 0 0 20 20", "%%EndComments", "%%EOF"]) {
      expect(out).toContain(kept);
    }
    expect(verifyEpsDocument(out).ok).toBe(true);
    expect(stripEpsIdentity(out)).toBe(out); // idempotent
  });

  it("leaves text that is not PostScript alone", () => {
    expect(stripEpsIdentity(`%%Title: ${WORK}`)).toBe(`%%Title: ${WORK}`);
  });

  it.each([["clean", true], ["legacy", false]])("an older %s export still verifies, and the scrub makes it identical to a fresh one", (_label, clean) => {
    const old = legacyEps(clean);
    expect(old).toMatch(HASHED);
    expect(verifyEpsDocument(old).ok).toBe(true); // packages on disk do not break
    const scrubbed = stripEpsIdentity(old);
    expect(scrubbed).not.toMatch(HASHED);
    expect(scrubbed).not.toContain(WORK);
    expect(scrubbed).not.toMatch(/^%AI/m);
    expect(scrubbed).toBe(embedXmpMetadataInEps(built(), META, clean ? { clean: true } : {}));
    expect(verifyEpsMetadata(scrubbed, META)).toBe(true);
  });

  it("a legacy envelope whose hashed names disagree is still refused by the audit", () => {
    const broken = legacyEps(true).replace("MetadataDict_dd3a80ee4442f029 begin\n[/EMC", "MetadataDict_0000000000000000 begin\n[/EMC");
    expect(broken).not.toBe(legacyEps(true));
    expect(verifyEpsDocument(broken).ok).toBe(false);
  });

  it("the clean pass re-derives one neutral carrier from an older file", () => {
    const out = cleanEpsDocument(legacyEps(false), META);
    expect(out).not.toMatch(HASHED);
    expect(out).not.toContain(WORK);
    expect(out).not.toMatch(/^%AI|^%ADO_|^%%BeginPhotoshop/m);
    expect(readXmpMetadataFromEps(out)).toMatchObject(META);
  });
});

describe("packages and copies never carry the work name, a hash or a fake Illustrator line", () => {
  const sheetMeta = { ...META, state: "accepted" as const, validation: validateMetadata(META), fingerprint: "fp" };
  const epsDep = { eps: (inp: Parameters<typeof CONVERTERS.builtin.convert>[0]) => CONVERTERS.builtin.convert(inp, { bridgeUrl: "", fetch: globalThis.fetch }), pngBlob: async () => new Blob(["png"]) };

  it.each([["clean on", true], ["clean off", false]])("SVG builder sheet package, %s", async (_label, cleanExport) => {
    const pkg = await buildSheetPackage({
      svg: ICON, metadata: sheetMeta, folder: "_artboard_sheets/x/a", workName: WORK, stem: WORK, pairId: "a1",
      now: "2026-11-24T00:00:00.000Z", prompt: "", model: "",
      settings: { ...DEFAULT_UPLOAD_SETTINGS, optimizeSvg: false, includeEps: true, includeJpeg: false, cleanExport },
    }, epsDep);
    expect(pkg.problems).toEqual([]);
    const dec = new TextDecoder();
    for (const ext of [".eps", ".svg"]) {
      const file = pkg.files.find((f) => f.name.endsWith(ext));
      expect(file, ext).toBeDefined();
      const text = dec.decode(file!.bytes);
      expect(text, ext).not.toContain(WORK);
      expect(text, ext).not.toMatch(HASHED);
      expect(text, ext).not.toMatch(/%%Title|^%AI/m);
    }
  });

  it("SVG builder with clean off ships no hash-scoped ids", async () => {
    const icon = `<svg ${NS} viewBox="0 0 24 24"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#111"/></linearGradient></defs><path d="M2 2h20v20H2z" stroke="url(#g)"/></svg>`;
    const config = parseSheetConfig(DEFAULT_CONFIG);
    const svg = composeSheet({ config, layout: computeLayout(config), assets: [ICON_ASSET], placedIds: ["a"], svgTexts: { a: icon } }).svg;
    expect(svg).toMatch(/id="b[0-9a-f]+-g"/); // the builder scopes ids by a hash while composing
    setTextOutliner(() => ({ d: "M0 0 L10 0", width: 10 }));
    const pkg = await buildSheetPackage({
      svg, metadata: null, folder: "_artboard_sheets/x/a", workName: WORK, stem: WORK, pairId: "a1",
      now: "2026-11-24T00:00:00.000Z", prompt: "", model: "",
      settings: { ...DEFAULT_UPLOAD_SETTINGS, optimizeSvg: false, includeEps: false, includeJpeg: false, cleanExport: false, expandText: true },
    }, epsDep);
    const out = new TextDecoder().decode(pkg.files.find((f) => f.name.endsWith(".svg"))!.bytes);
    expect(out).not.toMatch(/id="b[0-9a-f]+-/);
    expect(out).not.toMatch(/url\(#b[0-9a-f]+-/);
  });

  it("renaming an older exported package scrubs its EPS and records the new bytes", async () => {
    const root = new FakeDir("workspace");
    const folder = `_artboard_sheets/2026-11/2026-11-24/${WORK}/artboard_01`;
    const pkg = await buildSheetPackage({
      svg: ICON, metadata: sheetMeta, folder, workName: WORK, stem: WORK, pairId: "ab-1",
      now: "2026-11-24T00:00:00.000Z", prompt: "", model: "",
      settings: { ...DEFAULT_UPLOAD_SETTINGS, optimizeSvg: false, includeEps: true, includeJpeg: false },
    }, epsDep);
    await writeSheetExport(root, folder, pkg.files);
    let dir: FakeDir | undefined = root;
    for (const part of `${folder}/export`.split("/")) dir = dir?.children.get(part) as FakeDir | undefined;
    const old = legacyEps(true);
    dir!.children.set(`${WORK}.eps`, new FakeFile(`${WORK}.eps`, old.length, 1, old));

    const res = await renameExportPackage({ root, exportDir: `${folder}/export`, workName: WORK, nextUploadName: "Food icons kitchen set" });
    expect(res.ok).toBe(true);
    const renamed = (dir!.children.get("Food_icons_kitchen_set.eps") as FakeFile).text;
    expect(renamed).not.toContain(WORK);
    expect(renamed).not.toMatch(HASHED);
    expect(renamed).not.toMatch(/%%Title|^%AI/m);
    expect(verifyEpsMetadata(renamed, META)).toBe(true);
    const record = parseExportRecord(JSON.parse((dir!.children.get("export.json") as FakeFile).text));
    const bytes = new TextEncoder().encode(renamed);
    expect(record?.outputs.eps?.bytes).toBe(bytes.byteLength);
    expect(record?.outputs.eps?.hash.replace(/^sha256:/, "")).toBe(await sha256Hex(bytes));
  });

  it("the stock-upload metadata copy of an older EPS ships scrubbed", async () => {
    const item = { record: { metadata: { title: "Food icons", description: "Kitchen set", tags: META.tags } } } as unknown as ExportedItem;
    const out = new TextDecoder().decode(await prepareMetadataCopy(item, "a.eps", new TextEncoder().encode(legacyEps(false))));
    expect(out).not.toContain(WORK);
    expect(out).not.toMatch(HASHED);
    expect(out).not.toMatch(/%%Title|^%AI/m);
    expect(verifyEpsDocument(out).ok).toBe(true);
  });
});
