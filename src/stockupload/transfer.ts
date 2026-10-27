import { sha256Hex } from "../lib/upload/hash";
import { verifiedArtifact } from "../lib/stockupload/discovery";
import { checkStockMedia } from "../lib/stockupload/preflight";
import { CHUNK_BYTES, validManifest } from "../lib/stockupload/protocol";
import { connectCompanion, type NativeClient } from "../lib/stockupload/native";
import type { StockArtifact, TransferManifest, TransferReceipt } from "../lib/stockupload/types";
import { isRecord } from "../lib/isrecord";
export interface TransferRun {
  files: StockArtifact[]; epsReviewed: boolean; signal: AbortSignal;
  progress: (message: string) => void;
  receipt: (receipt: TransferReceipt) => void;
}
export async function uploadConfirmed(run: TransferRun): Promise<void> {
  const manifest = manifestFor(run);
  if (!validManifest(manifest)) throw new Error("Batch exceeds companion limits or includes incompatible output");
  const snapshots = await prepareFiles(run);
  if (run.signal.aborted) return;
  const client = connectCompanion(bytes => run.progress(`Transferring ${Math.round(bytes / 1024)} KiB`));
  const cancel = () => { void client.call("cancel").catch(() => undefined).finally(() => client.close()); };
  run.signal.addEventListener("abort", cancel, { once: true });
  try {
    await client.hello();
    const begin = await client.call("begin", { manifest });
    if (!isRecord(begin) || begin.digest !== await sha256Hex(new TextEncoder().encode(JSON.stringify(manifest)))) throw new Error("Confirmed manifest mismatch");
    for (let i = 0; i < run.files.length; i++) {
      if (run.signal.aborted) break;
      run.progress(`${i + 1}/${run.files.length}: ${run.files[i].name}`);
      await sendFile(client, manifest.files[i].id, snapshots[i]);
      const receipt = await client.call("send") as TransferReceipt;
      run.receipt(receipt);
      if (receipt.state !== "transferred") throw new Error("Batch stopped; reconcile failed/uncertain file before another upload");
    }
    if (!run.signal.aborted) { await client.call("finish"); await client.call("ack"); }
  } finally { run.signal.removeEventListener("abort", cancel); client.close(); }
}
function manifestFor(run: TransferRun): TransferManifest {
  return { v: 1, job: crypto.randomUUID(), account: "shutterstock", epsReviewed: run.epsReviewed,
    files: run.files.map(a => ({ id: a.path, name: a.name, bytes: a.bytes, hash: a.hash, kind: a.kind as "jpg" | "eps" })) };
}
async function prepareFiles(run: TransferRun): Promise<File[]> {
  const files: File[] = [];
  for (const a of run.files) {
    if (run.signal.aborted) break;
    run.progress(`Checking ${a.name}`);
    const file = await verifiedArtifact(a); await checkStockMedia(a, file); files.push(file);
  }
  return files;
}
async function sendFile(client: NativeClient, id: string, file: File): Promise<void> {
  await client.call("file", { file: id });
  for (let at = 0, seq = 0; at < file.size; at += CHUNK_BYTES, seq++) {
    const bytes = new Uint8Array(await file.slice(at, at + CHUNK_BYTES).arrayBuffer());
    let text = ""; for (const b of bytes) text += String.fromCharCode(b);
    const ack = await client.call("chunk", { seq, data: btoa(text) });
    if (!isRecord(ack) || ack.seq !== seq) throw new Error("Invalid chunk acknowledgment");
  }
}
