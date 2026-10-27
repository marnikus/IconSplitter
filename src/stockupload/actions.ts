import { saveHandles } from "../batch/store";
import { ensurePermission } from "../batch/picker";
import { pickFolderFor } from "../ui/pickroot";
import { retryCapture } from "../ui/rootcapture";
import { scanStockExports } from "../lib/stockupload/discovery";
import { pruneRowSelection } from "../lib/reviewselect";
import { patchStock, stockState } from "./state";
import { uploadConfirmed } from "./transfer";
import type { StockArtifact } from "../lib/stockupload/types";
import { startCompletionSound } from "../ui/completionSound";
export const STOCK_ROOT_KEY = "stockUpload.root.v1";
let controller: AbortController | null = null;
export async function chooseStockRoot(): Promise<void> {
  if (stockState().busy || stockState().scanning) return;
  await pickFolderFor(async root => { patchStock({ root, selection: { active: null, checked: [], anchor: null } }); await saveHandles(STOCK_ROOT_KEY, { source: root }); }); await rescanStock();
}
export async function rescanStock(): Promise<void> {
  const state = stockState(); if (!state.root || state.busy || state.scanning) return;
  patchStock({ scanning: true });
  try {
    if (!await ensurePermission(state.root)) { patchStock({ message: "Folder permission denied — choose the folder again" }); return; }
    await retryCapture(state.root);
    const inventory = await scanStockExports(state.root);
    patchStock({ ...inventory, selection: pruneRowSelection(state.selection, new Set(inventory.rows.map(r => r.id))) });
  } catch { patchStock({ rows: [], message: "Cannot read chosen folder; restore folder permission and Rescan" }); }
  finally { patchStock({ scanning: false }); }
}
export async function startStockUpload(files: StockArtifact[], epsReviewed: boolean): Promise<void> {
  if (stockState().busy || files.length === 0) return;
  if (!window.confirm(`Transfer ${files.length} files (${(files.reduce((n, f) => n + f.bytes, 0) / 1e6).toFixed(1)} MB) via explicit TLS to ftps.shutterstock.com:21?\n${files.map(f => f.name).join("\n")}\nTransfer is NOT submission/review. No automatic retries. Continue?`)) return;
  controller = new AbortController(); const finishSound = startCompletionSound();
  patchStock({ busy: true, canCancel: true, receipts: [], message: "Checking confirmed exported files" });
  try {
    await uploadConfirmed({ files, epsReviewed, signal: controller.signal, progress: message => patchStock({ message }), receipt: receipt => patchStock({ receipts: [...stockState().receipts, receipt] }) });
    patchStock({ message: controller.signal.aborted ? "Cancelled — reconcile any in-flight remote file" : "Transferred — finish metadata/categories and submit in Shutterstock's portal" });
  } catch (error) { patchStock({ message: error instanceof Error ? error.message : "Transfer failed; reconcile remote state" }); }
  finally { finishSound(controller.signal.aborted); controller = null; patchStock({ busy: false, canCancel: false }); }
}
export function cancelStockUpload(): void { controller?.abort(); }
