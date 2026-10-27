import { mkdir, readFile, rename, open, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { isRecord } from "../../src/lib/isrecord";
import { safeMediaName } from "../../src/lib/stockupload/safety";
import type { TransferManifest, TransferReceipt } from "../../src/lib/stockupload/types";
export function dataDirectory(): string {
  const base = process.platform === "win32" ? process.env.LOCALAPPDATA || homedir() : process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(base, "iconsplitter-stock");
}
export class ReceiptJournal {
  constructor(readonly directory = dataDirectory()) {}
  async read(): Promise<TransferReceipt[]> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const path = join(this.directory, "receipts.json");
      if ((await stat(path)).size > 20_000_000) throw new Error("Receipt journal requires maintenance");
      const raw: unknown = JSON.parse(await readFile(path, "utf8"));
      if (!Array.isArray(raw) || !raw.every(validReceipt)) throw new Error("Invalid receipt journal");
      return raw;
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw Object.assign(new Error("Unreadable receipt journal; reconcile before uploading"), { cause: error }); }
  }
  async assertFresh(manifest: TransferManifest): Promise<void> {
    const previous = await this.read();
    const blocked = new Set(previous.filter(r => r.state !== "failed" && r.state !== "cancelled").map(r => r.hash));
    if (manifest.files.some(f => blocked.has(f.hash))) throw new Error("Recorded transfer requires reconciliation");
  }
  async write(receipt: TransferReceipt): Promise<void> {
    const previous = (await this.read()).filter(r => r.hash !== receipt.hash);
    await this.replace([...previous, receipt]);
  }
  async replace(receipts: TransferReceipt[]): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const target = join(this.directory, "receipts.json");
    const file = await open(`${target}.tmp`, "w", 0o600);
    try { await file.writeFile(JSON.stringify(receipts)); await file.sync(); } finally { await file.close(); }
    await rename(`${target}.tmp`, target);
    if (process.platform !== "win32") { const directory = await open(this.directory, "r"); try { await directory.sync(); } finally { await directory.close(); } }
  }
}

function validReceipt(raw: unknown): raw is TransferReceipt {
  if (!isRecord(raw) || typeof raw.name !== "string" || !safeMediaName(raw.name)) return false;
  if (typeof raw.hash !== "string" || !/^[a-f0-9]{64}$/.test(raw.hash)) return false;
  return ["transferred", "failed", "uncertain", "cancelled"].includes(String(raw.state));
}
