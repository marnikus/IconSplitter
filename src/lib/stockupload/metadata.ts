import { writeFileOverwrite, type DirHandleLike } from "../fs";
import { cleanMetadata, metadataFingerprint, validateMetadata, type IconMetadata } from "../upload/meta";
import { embedXmpMetadata, readJpegDimensions, verifyJpeg } from "../upload/jpeg";
import { embedXmpMetadataInEps, verifyEpsMetadata } from "../upload/epsmetadata";
import { embedMetadataInSvg, readEmbeddedMetadata } from "../upload/embed";
import { sameMetadata } from "../upload/rights";
import { sha256Hex } from "../upload/hash";
import { verifiedArtifact } from "./discovery";
import type { StockArtifact, StockPackage } from "./types";
interface PreparedEdit { artifact: StockArtifact; bytes: Uint8Array; original: Uint8Array }

/** Metadata-only refresh. Sources/rendering are never opened. JSON is the last commit marker. */
export async function refreshStockMetadata(root: DirHandleLike, row: StockPackage, input: IconMetadata): Promise<void> {
  const metadata = cleanMetadata(input), validation = validateMetadata(metadata);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  const dir = await exportDirectory(root, row.dir), recordFile = await dir.getFileHandle("export.json");
  const before = await (await recordFile.getFile()).text();
  if (JSON.stringify(JSON.parse(before)) !== JSON.stringify(JSON.parse(row.recordText))) throw new Error("Export record changed; rescan before editing");
  const edits: PreparedEdit[] = [];
  for (const artifact of row.artifacts) edits.push(await prepareEdit(artifact, metadata));
  const raw = JSON.parse(before);
  raw.metadata = { ...raw.metadata, ...metadata, state: "accepted", fingerprint: metadataFingerprint(metadata), validation };
  for (const edit of edits) raw.outputs[edit.artifact.kind] = { path: edit.artifact.path, bytes: edit.bytes.length, hash: `sha256:${await sha256Hex(edit.bytes)}` };
  raw.timestamps.committedAt = new Date().toISOString();
  try {
    for (const edit of edits) await checkedWrite(dir, edit.artifact.name, edit.bytes);
    await checkedWrite(dir, "export.json", new TextEncoder().encode(JSON.stringify(raw, null, 2)));
  } catch (error) {
    for (const edit of edits) await checkedWrite(dir, edit.artifact.name, edit.original);
    await checkedWrite(dir, "export.json", new TextEncoder().encode(before)); throw error;
  }
}
async function exportDirectory(root: DirHandleLike, path: string): Promise<DirHandleLike> {
  let dir = root;
  for (const segment of path.split("/").filter(Boolean)) dir = await dir.getDirectoryHandle(segment);
  return dir;
}
async function prepareEdit(artifact: StockArtifact, metadata: IconMetadata): Promise<PreparedEdit> {
  const file = await verifiedArtifact(artifact), original = new Uint8Array(await file.arrayBuffer());
  if (artifact.kind === "jpg") {
    const dims = readJpegDimensions(original); if (!dims) throw new Error("Invalid exported JPEG");
    const bytes = embedXmpMetadata(original, metadata);
    if (!verifyJpeg(bytes, { ...dims, metadata }).ok) throw new Error("JPEG metadata readback failed");
    return { artifact, original, bytes };
  }
  const text = new TextDecoder().decode(original);
  const embedded = embedVectorMetadata(artifact, text, metadata);
  return { artifact, original, bytes: new TextEncoder().encode(embedded) };
}
function embedVectorMetadata(a: StockArtifact, text: string, metadata: IconMetadata): string {
  if (a.kind === "svg") {
    const embedded = embedMetadataInSvg(text, metadata);
    if (!sameMetadata(readEmbeddedMetadata(embedded), metadata)) throw new Error("SVG metadata readback failed");
    return embedded;
  }
  if (a.kind !== "eps") throw new Error("PNG/ZIP metadata refresh is not supported; use the exporting tab");
  const embedded = embedXmpMetadataInEps(text, metadata);
  if (!verifyEpsMetadata(embedded, metadata)) throw new Error("EPS metadata readback failed");
  return embedded;
}
async function checkedWrite(dir: DirHandleLike, name: string, bytes: Uint8Array): Promise<void> {
  await writeFileOverwrite(dir, `${name}.stock-tmp`, new Blob([bytes as BlobPart]));
  const handle = await dir.getFileHandle(`${name}.stock-tmp`);
  if (await sha256Hex(new Uint8Array(await (await handle.getFile()).arrayBuffer())) !== await sha256Hex(bytes)) throw new Error("Staged metadata readback failed");
  await writeFileOverwrite(dir, name, new Blob([bytes as BlobPart]));
  const saved = await dir.getFileHandle(name);
  if (await sha256Hex(new Uint8Array(await (await saved.getFile()).arrayBuffer())) !== await sha256Hex(bytes)) throw new Error("Saved metadata readback failed");
  await dir.removeEntry?.(`${name}.stock-tmp`);
}
