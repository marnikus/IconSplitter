import type { DirHandleLike } from "../fs";
import { sha256Hex } from "../upload/hash";
import { readStockRecord } from "./record";
import type { StockArtifact, StockPackage } from "./types";
export interface StockInventory { rows: StockPackage[]; errors: string[] }

/** Independent of approved SVG discovery; no outside-export media is read. */
export async function scanStockExports(root: DirHandleLike): Promise<StockInventory> {
  const result: StockInventory = { rows: [], errors: [] };
  await visit(root, "", { result, inside: root.name === "export" });
  result.rows.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}
async function visit(dir: DirHandleLike, path: string, context: { result: StockInventory; inside: boolean }): Promise<void> {
  if (context.inside) { await readPackage(dir, path, context.result); return; }
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== "directory") continue;
    await visit(handle, path === "" ? name : `${path}/${name}`, { result: context.result, inside: name === "export" })
      .catch(() => context.result.errors.push(`${path}/${name}: directory unreadable`));
  }
}
async function readPackage(dir: DirHandleLike, path: string, result: StockInventory): Promise<void> {
  try {
    const record = await (await dir.getFileHandle("export.json")).getFile();
    if (record.size > 2_000_000) throw new Error("Export record too large");
    const row = readStockRecord(JSON.parse(await record.text()), path);
    if (!row) throw new Error("Invalid or uncommitted export record");
    const available: StockArtifact[] = [];
    for (const artifact of row.artifacts) {
      try { artifact.handle = await dir.getFileHandle(artifact.name); await verifiedArtifact(artifact); available.push(artifact); }
      catch { result.errors.push(`${artifact.path}: missing or changed declared output`); }
    }
    row.artifacts = available;
    if (available.length === 0) throw new Error("No verified physical outputs");
    result.rows.push(row);
  } catch { result.errors.push(`${path || "export"}: missing, invalid or changed committed package`); }
}
/** Return an immutable checked snapshot; callers must not reread another filename. */
export async function verifiedArtifact(a: StockArtifact): Promise<File> {
  if (!a.handle) throw new Error("Missing exported file handle");
  const file = await a.handle.getFile();
  if (file.size !== a.bytes || await sha256Hex(new Uint8Array(await file.arrayBuffer())) !== a.hash) throw new Error("Exported file changed; rescan/re-export required");
  return file;
}
