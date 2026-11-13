import { useCallback, useMemo, useRef, useState } from "react";
import { type ExportOpts } from "./lib/render";
import { exportSheets, exportTotal, mergeTargets } from "./lib/sheetsel";
import { useSheetsEdit } from "./ui/useSheetsEdit";
import SheetsHeader from "./sheets/SheetsHeader";
import DropzoneEmpty from "./sheets/DropzoneEmpty";
import SheetsList from "./sheets/SheetsList";
import ExportSettings from "./sheets/ExportSettings";
import DetectionPanel from "./sheets/DetectionPanel";
import BoundaryPreview from "./sheets/BoundaryPreview";
import ResultGrid from "./sheets/ResultGrid";
import { BusyOverlay, DragOverlay, ToastOverlay } from "./sheets/Overlays";
import { useSheetsModel } from "./sheets/useSheetsModel";
import { activeItems as itemsOf, activePreviews } from "./sheets/activeView";
import { copyIcon, exportFolder, exportZip, saveIcon } from "./sheets/exportActions";
import { useBusyActivity } from "./ui/useBusyActivity";

const checker =
  "bg-[length:16px_16px] bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%,transparent_75%,#e5e7eb_75%),linear-gradient(45deg,#e5e7eb_25%,#fff_25%,#fff_75%,#e5e7eb_75%)] [background-position:0_0,8px_8px]";

export default function App() {
  const [busy, setBusy] = useState<string | null>(null);
  useBusyActivity("sheets", busy);
  const [drag, setDrag] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const sheetsEdit = useSheetsEdit();
  const { padding, size, transparent } = sheetsEdit.opts;
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>(0);

  const opts: ExportOpts = useMemo(() => ({ padding, size, transparent }), [padding, size, transparent]);

  const say = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const m = useSheetsModel(say, setBusy);
  const { sheets, active, addFiles } = m;
  const activeItems = useMemo(() => itemsOf(active, padding), [active, padding]);
  const previews = useMemo(() => activePreviews(active, activeItems, opts), [active, activeItems, opts]);
  const targets = sheets.filter((s) => mergeTargets(sheets, m.sel.checked, m.sel.active).includes(s.id));
  const total = exportTotal(sheets, m.sel.checked);
  const ctx = { sheets: exportSheets(sheets, m.sel.checked), opts, say, busy: setBusy };

  const sqA = activeItems.find((x) => !x.off)?.sq ?? null;

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100"
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      <SheetsHeader total={total} onUpload={() => fileRef.current?.click()} onZip={() => void exportZip(ctx)} onFolder={() => void exportFolder(ctx)} />

      <input
        ref={fileRef}
        data-testid="file-input"
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <main className="w-full px-4 py-6">
        {!sheets.length ? (
          <DropzoneEmpty onPick={() => fileRef.current?.click()} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
              <SheetsList sheets={sheets} sel={m.sel} onGesture={m.gesture} onToggleCheck={m.toggleCheck} onSetCheck={m.setCheck} onRemove={m.removeSheet} onAdd={() => fileRef.current?.click()} />
              <ExportSettings padding={padding} size={size} transparent={transparent} totalPx={sqA?.total ?? null} onPad={sheetsEdit.pad} onSize={sheetsEdit.size} onTransparent={sheetsEdit.transparent} />
              <DetectionPanel active={active} targets={targets.length} found={targets.reduce((a, t) => a + t.boxes.length, 0)} onRedetect={m.redetect} />
            </aside>

            {active && (
              <div className="min-w-0 space-y-6">
                <BoundaryPreview active={active} activeItems={activeItems} padding={padding} onToggle={m.toggleBox} />
                <ResultGrid items={activeItems} previews={previews} checker={checker} onToggle={(i) => m.toggleBox(active.id, i)} onCopy={(i) => void copyIcon(active, i, ctx)} onSave={(i) => void saveIcon(active, i, opts)} />
              </div>
            )}
          </div>
        )}
      </main>

      {drag && <DragOverlay />}
      {busy && <BusyOverlay msg={busy} />}
      {toast && <ToastOverlay msg={toast.msg} err={toast.err} />}
    </div>
  );
}
