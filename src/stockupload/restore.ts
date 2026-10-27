import { useEffect, useRef } from "react";
import { loadHandles } from "../batch/store";
import { peekPermission } from "../batch/picker";
import { restoreKnownRoot } from "../lib/knownroots";
import { patchStock, stockState } from "./state";
import { rescanStock, STOCK_ROOT_KEY } from "./actions";
export function useStockRootRestore(active: boolean): void {
  const started = useRef(false);
  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    void restore();
  }, [active]);
}
async function restore(): Promise<void> {
  if (stockState().root) return;
  const root = (await loadHandles(STOCK_ROOT_KEY))?.source;
  if (root?.kind !== "directory" || typeof root.getFileHandle !== "function") return;
  await restoreKnownRoot(root); patchStock({ root });
  if (await peekPermission(root) === "granted") await rescanStock();
  else patchStock({ message: "Saved folder needs permission — press Rescan to restore access" });
}
