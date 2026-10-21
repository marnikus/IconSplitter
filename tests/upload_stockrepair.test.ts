import { expect, it } from "vitest";
import { runExport } from "../src/upload/runexport";
import { readBytesAt } from "../src/lib/fs";
import { embedXmpMetadata } from "../src/lib/upload/jpeg";
import { jpegSegments } from "../src/lib/upload/jpegmarkers";
import { joinBytes } from "../src/lib/upload/metadatabytes";
import { readJpegIptc } from "../src/lib/upload/jpegiptc";
import { stockExportArgs, STOCK_TEST_META, STOCK_TEST_SVGS } from "./helpers/stockexport";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { minimalJpeg } from "./helpers/minijpeg";

it("repairs an XMP-only legacy JPEG without rendering or touching SVG/EPS, then skips unchanged files", async () => {
  const { args, root, renders } = stockExportArgs(STOCK_TEST_SVGS[0]);
  const first = await runExport(args);
  expect(first.status, JSON.stringify(first.error)).toBe("processed");
  const out = root.children.get("export") as BinDir;
  const jpeg = await readBytesAt(root, "export/temporary.jpg") as Uint8Array;
  const iptc = jpegSegments(jpeg).find((s) => s.marker === 237)!;
  out.children.set("temporary.jpg", new BinFile("temporary.jpg", joinBytes(jpeg.slice(0, iptc.start), jpeg.slice(iptc.end))));
  expect(readJpegIptc(await readBytesAt(root, "export/temporary.jpg") as Uint8Array)).toBeNull();
  const svg = await readBytesAt(root, "export/temporary.svg");
  const eps = await readBytesAt(root, "export/temporary.eps");
  const repaired = await runExport({ ...args, record: first.record });
  expect(repaired.status).toBe("processed");
  expect(repaired.stages).toEqual(["embed", "validate", "commit"]);
  expect(renders.count).toBe(1);
  expect(readJpegIptc(await readBytesAt(root, "export/temporary.jpg") as Uint8Array)).toEqual(STOCK_TEST_META);
  expect(await readBytesAt(root, "export/temporary.svg")).toEqual(svg);
  expect(await readBytesAt(root, "export/temporary.eps")).toEqual(eps);
  const skipped = await runExport({ ...args, record: repaired.record });
  expect(skipped.stages).toEqual([]);
  expect(skipped.status).toBe("processed");
});

it("repairs mismatched JPEG fields even when record fingerprints match", async () => {
  const { args, root, renders } = stockExportArgs(STOCK_TEST_SVGS[1]);
  const first = await runExport(args);
  const out = root.children.get("export") as BinDir;
  out.children.set("temporary.jpg", new BinFile("temporary.jpg", embedXmpMetadata(minimalJpeg(100, 100), { ...STOCK_TEST_META, title: "Wrong title" })));
  const second = await runExport({ ...args, record: first.record });
  expect(second.stages).toContain("embed");
  expect(second.stages).not.toContain("render");
  expect(renders.count).toBe(1);
  expect(readJpegIptc(await readBytesAt(root, "export/temporary.jpg") as Uint8Array)).toEqual(STOCK_TEST_META);
});

it("repairs legacy XMP-only EPS without rewriting the intact JPEG or SVG", async () => {
  const { args, root, renders } = stockExportArgs(STOCK_TEST_SVGS[0]);
  const first = await runExport(args);
  const out = root.children.get("export") as BinDir;
  const eps = new TextDecoder().decode(await readBytesAt(root, "export/temporary.eps") as Uint8Array);
  const legacy = eps.replace(/^% IconSplitter IPTC begin\n[\s\S]*?^% IconSplitter IPTC end\n/m, "");
  out.children.set("temporary.eps", new BinFile("temporary.eps", legacy));
  const jpg = await readBytesAt(root, "export/temporary.jpg");
  const repaired = await runExport({ ...args, record: first.record });
  expect(repaired.status).toBe("processed");
  expect(repaired.stages).toEqual(["eps", "validate", "commit"]);
  expect(renders.count).toBe(1);
  expect(await readBytesAt(root, "export/temporary.jpg")).toEqual(jpg);
  expect(new TextDecoder().decode(await readBytesAt(root, "export/temporary.eps") as Uint8Array)).toContain("%%BeginPhotoshop:");
});
