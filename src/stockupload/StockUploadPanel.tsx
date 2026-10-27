// StockUploadPanel.tsx — the "Upload" (stockUpload) tab: discovers exported
// packages (`export/` + committed `export.json`) and uploads them to stock FTPS.

import { useEffect, type CSSProperties } from "react";
import { useSelectShortcuts } from "../lib/selectshortcuts";
import { OpenFolderButton } from "../ui/FolderBar";
import StockUploadBulkBar from "./StockUploadBulkBar";
import StockUploadControls from "./StockUploadControls";
import StockUploadDialogs from "./StockUploadDialogs";
import StockUploadList from "./StockUploadList";
import { useStockUpload, type StockUploadApi } from "./useStockUpload";

function useArrowKeys(g: StockUploadApi, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (g.visible.length === 0) return;
      e.preventDefault();
      const idx = g.visible.findIndex((r) => r.id === g.activeId);
      const next = e.key === "ArrowDown"
        ? Math.min(g.visible.length - 1, idx + 1)
        : Math.max(0, idx <= 0 ? 0 : idx - 1);
      g.setActive(g.visible[next].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, g]);
}

function thumbCss(px: number): CSSProperties {
  return { ["--svg-thumb" as string]: `${px}px` };
}

export default function StockUploadPanel({ active = true }: { active?: boolean }) {
  const g = useStockUpload();
  const keysEnabled = active && g.model.dialog === null;
  useSelectShortcuts({
    activeId: g.activeId, selectActive: g.checkActive, deselectActive: g.uncheckActive,
    selectVisible: g.selectVisible, deselectAll: g.deselectAll,
  }, keysEnabled);
  useArrowKeys(g, keysEnabled);

  if (!g.supported) {
    return (
      <div className="svg-empty-root" data-testid="stock-upload-unsupported">
        <p>Direct folder reading requires a Chromium-based browser (Chrome or Edge).</p>
        <OpenFolderButton testid="stock-open-folder-unsupported" onClick={g.chooseRoot} />
      </div>
    );
  }
  return <MountedPanel g={g} />;
}

function MountedPanel({ g }: { g: StockUploadApi }) {
  return (
    <div className="svg up" data-testid="stock-upload-panel" style={thumbCss(g.model.prefs.thumb)}>
      <StockUploadControls g={g} />
      <DiscoveryWarnings g={g} />
      {g.model.rootName === "" ? (
        <div className="svg-empty-root" data-testid="stock-pick-root">
          <p>Choose a workspace root folder to list exported stock packages (`export/` + `export.json`).</p>
          <OpenFolderButton testid="stock-pick-root-btn" onClick={g.chooseRoot} />
        </div>
      ) : (
        <>
          <StockUploadBulkBar g={g} />
          <StockUploadList g={g} />
        </>
      )}
      <StockUploadDialogs g={g} />
      {g.model.toast && (
        <div className={`svg-toast${g.model.toast.err ? " error" : ""}`} role="status" data-testid="stock-toast">
          {g.model.toast.text}
        </div>
      )}
    </div>
  );
}

function DiscoveryWarnings({ g }: { g: StockUploadApi }) {
  const d = g.model.discovery;
  if (!d) return null;
  return (
    <>
      {d.corruptRecords.length > 0 && (
        <p className="svg-warning" data-testid="stock-warn-corrupt">
          ⚠ <strong>{d.corruptRecords.length} corrupt export.json file(s)</strong> were skipped.
        </p>
      )}
      {d.unreadable.length > 0 && (
        <p className="svg-warning" data-testid="stock-warn-unreadable">
          ⚠ <strong>{d.unreadable.length} unreadable export.json file(s)</strong> could not be opened.
        </p>
      )}
    </>
  );
}
