import { useCallback, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { detectAsync, type Box } from "./lib/detect";
import { canvasToBlob, renderIcon, renderIconAsync, squareInfo, type ExportOpts } from "./lib/render";
import { download } from "./lib/dom";
import { useSheetsEdit } from "./ui/useSheetsEdit";
import SheetsHeader from "./sheets/SheetsHeader";
import DropzoneEmpty from "./sheets/DropzoneEmpty";
import SheetsList from "./sheets/SheetsList";
import ExportSettings from "./sheets/ExportSettings";
import DetectionPanel from "./sheets/DetectionPanel";
import BoundaryPreview from "./sheets/BoundaryPreview";
import ResultGrid from "./sheets/ResultGrid";
import { BusyOverlay, DragOverlay, ToastOverlay } from "./sheets/Overlays";

import { importSheets, type Sheet } from "./sheets/importSheets";
import { startCompletionSound, withCompletionSound } from "./ui/completionSound";

const checker =
  "bg-[length:16px_16px] bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%,transparent_75%,#e5e7eb_75%),linear-gradient(45deg,#e5e7eb_25%,#fff_25%,#fff_75%,#e5e7eb_75%)] [background-position:0_0,8px_8px]";

const pad2 = (n: number) => String(n).padStart(2, "0");
const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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

  const active = sheets.find((s) => s.id === activeId) ?? null;

  const addFiles = useCallback((files: FileList | File[]) => importSheets(files, {
    busy: setBusy, add: (sheet) => setSheets((p) => [...p, sheet]), select: setActiveId, say,
  }), [say]);

  const redetect = useCallback(async (id: string, frac: number | null) => {
    const sheet = sheets.find((s) => s.id === id);
    if (!sheet) return;
    const d = await detectAsync(sheet.an, frac);
    setSheets((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        return { ...s, boxes: d.boxes, usedFrac: d.usedFrac, autoFrac: d.autoFrac, manual: frac != null, excluded: [] };
      }),
    );
  }, [sheets]);

  const toggleBox = (id: string, idx: number) =>
    setSheets((prev) => prev.map((s) => (s.id !== id ? s : { ...s, excluded: s.excluded.includes(idx) ? s.excluded.filter((i) => i !== idx) : [...s.excluded, idx] })));

  const removeSheet = (id: string) => {
    setSheets((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeId === id) setActiveId(next[next.length - 1]?.id ?? null);
      return next;
    });
  };

  const activeItems = useMemo(() => {
    if (!active) return [];
    const inc = active.boxes.map((b, i) => ({ b, i })).filter((x) => !active.excluded.includes(x.i));
    const sq = squareInfo(inc.map((x) => x.b), padding);
    return inc.map((x, n) => ({ ...x, n, sq }));
  }, [active, padding]);

  const previews = useMemo(() => {
    if (!active) return [];
    return activeItems.map((it) => renderIcon(active.img, active.an, active.boxes, it.b, it.sq, opts, 260).toDataURL("image/png"));
  }, [active, activeItems, opts]);

  const renderBlob = async (s: Sheet, box: Box, sq: ReturnType<typeof squareInfo>) => canvasToBlob(await renderIconAsync(s.img, s.an, s.boxes, box, sq, opts));
  const fileName = (s: Sheet, n: number) => `${s.base}-icon-${pad2(n + 1)}.png`;

  const copyIcon = async (s: Sheet, it: (typeof activeItems)[number]) => {
    try {
      await withCompletionSound(async () => {
        const blob = await renderBlob(s, it.b, it.sq);
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        say(`Icon ${it.n + 1} copied to clipboard`);
      });
    } catch {
      say("Clipboard is blocked by the browser – use Download instead", true);
    }
  };

  const saveIcon = async (s: Sheet, it: (typeof activeItems)[number]) => {
    await withCompletionSound(async () => { download(await renderBlob(s, it.b, it.sq), fileName(s, it.n)); });
  };

  const collect = async (onProgress?: (d: number, t: number) => void) => {
    const multi = sheets.length > 1;
    const out: { path: string; blob: Blob }[] = [];
    const totalIcons = sheets.reduce((a, s) => a + s.boxes.length - s.excluded.length, 0);
    let done = 0;
    for (const s of sheets) {
      const inc = s.boxes.map((b, i) => ({ b, i })).filter((x) => !s.excluded.includes(x.i));
      const sq = squareInfo(inc.map((x) => x.b), padding);
      for (let n = 0; n < inc.length; n++) {
        const blob = await renderBlob(s, inc[n].b, sq);
        out.push({ path: (multi ? `${s.base}/` : "") + fileName(s, n), blob });
        onProgress?.(++done, totalIcons);
        await sleep();
      }
    }
    return out;
  };

  const total = sheets.reduce((a, s) => a + s.boxes.length - s.excluded.length, 0);

  const run = async (label: string, fn: () => Promise<void | false>) => {
    if (!total) return say("No icons to export", true);
    const finish = startCompletionSound();
    let cancelled = false;
    try {
      setBusy(label);
      await sleep(20);
      cancelled = (await fn()) === false;
    } catch (e) {
      cancelled = (e as Error).name === "AbortError";
      if (!cancelled) say((e as Error).message || "Export failed", true);
    } finally {
      setBusy(null);
      finish(cancelled);
    }
  };

  const downloadZip = () =>
    run("Building ZIP…", async () => {
      const files = await collect((d, t) => setBusy(`Rendering ${d}/${t}…`));
      const zip = new JSZip();
      files.forEach((f) => zip.file(f.path, f.blob));
      const blob = await zip.generateAsync({ type: "blob" });
      download(blob, sheets.length === 1 ? `${sheets[0].base}-icons.zip` : "icons.zip");
      say(`ZIP with ${files.length} icons downloaded`);
    });

  const downloadAll = () =>
    run("Downloading…", async () => {
      const files = await collect();
      for (const f of files) {
        download(f.blob, f.path.split("/").pop()!);
        await sleep(150);
      }
      say(`${files.length} icons downloaded`);
    });

  const saveFolder = () =>
    run("Saving to folder…", async () => {
      const w = window as never as { showDirectoryPicker?: (o: { mode: string }) => Promise<never> };
      if (!w.showDirectoryPicker) { say("Folder saving needs Chrome/Edge. Use “ZIP” instead.", true); return false; }
      let dir: { name: string; getDirectoryHandle: (n: string, o: { create: boolean }) => Promise<never>; getFileHandle: (n: string, o: { create: boolean }) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> } & { name: string };
      try {
        dir = (await (w.showDirectoryPicker as (o: { mode: string }) => Promise<unknown>)({ mode: "readwrite" })) as never;
      } catch (e) {
        if ((e as Error).name === "AbortError") return false;
        say("Folder access isn't allowed here. Use “ZIP” instead.", true); return false;
      }
      const files = await collect((d, t) => setBusy(`Saving ${d}/${t}…`));
      for (const f of files) {
        const parts = f.path.split("/");
        let cur = dir as never as { getDirectoryHandle: (n: string, o: { create: boolean }) => Promise<never> };
        for (const p of parts.slice(0, -1)) cur = (await cur.getDirectoryHandle(p, { create: true })) as never;
        const fh = await (cur as unknown as { getFileHandle: (n: string, o: { create: boolean }) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> }).getFileHandle(parts[parts.length - 1], { create: true });
        const wr = await fh.createWritable();
        await wr.write(f.blob);
        await wr.close();
      }
      say(`Saved ${files.length} icons to “${(dir as { name: string }).name}”`);
    });

  const sqA = activeItems[0]?.sq ?? null;

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
      <SheetsHeader total={total} onUpload={() => fileRef.current?.click()} onZip={downloadZip} onFolder={saveFolder} onDownload={downloadAll} />

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
              <SheetsList sheets={sheets as never} activeId={activeId} onSelect={setActiveId} onRemove={removeSheet} onAdd={() => fileRef.current?.click()} />
              <ExportSettings padding={padding} size={size} transparent={transparent} totalPx={sqA?.total ?? null} onPad={sheetsEdit.pad} onSize={sheetsEdit.size} onTransparent={sheetsEdit.transparent} />
              <DetectionPanel active={active as never} onRedetect={redetect} />
            </aside>

            {active && (
              <div className="min-w-0 space-y-6">
                <BoundaryPreview active={active as never} activeItems={activeItems as never} padding={padding} onToggle={toggleBox} />
                <ResultGrid active={active as never} activeItems={activeItems as never} previews={previews} checker={checker} onCopy={copyIcon as never} onSave={saveIcon as never} />
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
