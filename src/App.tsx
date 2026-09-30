import { useCallback, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { analyze, detect, type Analysis, type Box } from "./lib/detect";
import { canvasToBlob, cropRect, renderIcon, squareInfo, type ExportOpts } from "./lib/render";
import { download, loadImage } from "./lib/dom";

interface Sheet {
  id: string;
  name: string;
  base: string;
  url: string;
  img: HTMLImageElement;
  an: Analysis;
  boxes: Box[];
  autoFrac: number;
  usedFrac: number;
  manual: boolean;
  excluded: number[];
}

const SIZES = [
  { v: 0, l: "Native (auto)" },
  { v: 128, l: "128 × 128" },
  { v: 256, l: "256 × 256" },
  { v: 512, l: "512 × 512" },
  { v: 1024, l: "1024 × 1024" },
  { v: 2048, l: "2048 × 2048" },
];

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
  const [padding, setPadding] = useState(6);
  const [size, setSize] = useState(512);
  const [transparent, setTransparent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>(0);

  const opts: ExportOpts = useMemo(() => ({ padding, size, transparent }), [padding, size, transparent]);

  const say = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const active = sheets.find((s) => s.id === activeId) ?? null;

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (!list.length) return say("Please choose image files (PNG, JPG, WEBP…)", true);
      let lastId: string | null = null;
      for (const f of list) {
        setBusy(`Detecting icons in ${f.name}…`);
        await sleep(30);
        try {
          const url = URL.createObjectURL(f);
          const img = await loadImage(url);
          const an = analyze(img);
          const det = detect(an, null);
          const id = crypto.randomUUID();
          const base = f.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || "sheet";
          const sheet: Sheet = {
            id,
            name: f.name,
            base,
            url,
            img,
            an,
            boxes: det.boxes,
            autoFrac: det.autoFrac,
            usedFrac: det.usedFrac,
            manual: false,
            excluded: [],
          };
          setSheets((p) => [...p, sheet]);
          lastId = id;
        } catch (e) {
          say(`${f.name}: ${(e as Error).message}`, true);
        }
      }
      setBusy(null);
      if (lastId) setActiveId(lastId);
    },
    [say],
  );

  const redetect = useCallback(async (id: string, frac: number | null) => {
    setSheets((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const d = detect(s.an, frac);
        return { ...s, boxes: d.boxes, usedFrac: d.usedFrac, autoFrac: d.autoFrac, manual: frac != null, excluded: [] };
      }),
    );
  }, []);

  const toggleBox = (id: string, idx: number) =>
    setSheets((prev) =>
      prev.map((s) =>
        s.id !== id
          ? s
          : { ...s, excluded: s.excluded.includes(idx) ? s.excluded.filter((i) => i !== idx) : [...s.excluded, idx] },
      ),
    );

  const removeSheet = (id: string) => {
    setSheets((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeId === id) setActiveId(next[next.length - 1]?.id ?? null);
      return next;
    });
  };

  // included icons + shared square for the active sheet
  const activeItems = useMemo(() => {
    if (!active) return [];
    const inc = active.boxes.map((b, i) => ({ b, i })).filter((x) => !active.excluded.includes(x.i));
    const sq = squareInfo(inc.map((x) => x.b), padding);
    return inc.map((x, n) => ({ ...x, n, sq }));
  }, [active, padding]);

  const previews = useMemo(() => {
    if (!active) return [];
    return activeItems.map((it) =>
      renderIcon(active.img, active.an, active.boxes, it.b, it.sq, opts, 260).toDataURL("image/png"),
    );
  }, [active, activeItems, opts]);

  const renderBlob = async (s: Sheet, box: Box, sq: ReturnType<typeof squareInfo>) =>
    canvasToBlob(renderIcon(s.img, s.an, s.boxes, box, sq, opts));

  const fileName = (s: Sheet, n: number) => `${s.base}-icon-${pad2(n + 1)}.png`;

  const copyIcon = async (s: Sheet, it: (typeof activeItems)[number]) => {
    try {
      const blob = await renderBlob(s, it.b, it.sq);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      say(`Icon ${it.n + 1} copied to clipboard`);
    } catch {
      say("Clipboard is blocked by the browser – use Download instead", true);
    }
  };

  const saveIcon = async (s: Sheet, it: (typeof activeItems)[number]) => {
    download(await renderBlob(s, it.b, it.sq), fileName(s, it.n));
  };

  /** every included icon of every sheet */
  const collect = async (onProgress?: (d: number, t: number) => void) => {
    const multi = sheets.length > 1;
    const out: { path: string; blob: Blob }[] = [];
    const total = sheets.reduce((a, s) => a + s.boxes.length - s.excluded.length, 0);
    let done = 0;
    for (const s of sheets) {
      const inc = s.boxes.map((b, i) => ({ b, i })).filter((x) => !s.excluded.includes(x.i));
      const sq = squareInfo(inc.map((x) => x.b), padding);
      for (let n = 0; n < inc.length; n++) {
        const blob = await renderBlob(s, inc[n].b, sq);
        out.push({ path: (multi ? `${s.base}/` : "") + fileName(s, n), blob });
        onProgress?.(++done, total);
        await sleep();
      }
    }
    return out;
  };

  const total = sheets.reduce((a, s) => a + s.boxes.length - s.excluded.length, 0);

  const run = async (label: string, fn: () => Promise<void>) => {
    if (!total) return say("No icons to export", true);
    try {
      setBusy(label);
      await sleep(20);
      await fn();
    } catch (e) {
      if ((e as Error).name !== "AbortError") say((e as Error).message || "Export failed", true);
    } finally {
      setBusy(null);
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
      const w = window as any;
      if (!w.showDirectoryPicker) {
        say("Folder saving needs Chrome/Edge. Use “ZIP” instead.", true);
        return;
      }
      let dir: any;
      try {
        dir = await w.showDirectoryPicker({ mode: "readwrite" });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        say("Folder access isn't allowed here. Use “ZIP” instead.", true);
        return;
      }
      const files = await collect((d, t) => setBusy(`Saving ${d}/${t}…`));
      for (const f of files) {
        const parts = f.path.split("/");
        let cur = dir;
        for (const p of parts.slice(0, -1)) cur = await cur.getDirectoryHandle(p, { create: true });
        const fh = await cur.getFileHandle(parts[parts.length - 1], { create: true });
        const wr = await fh.createWritable();
        await wr.write(f.blob);
        await wr.close();
      }
      say(`Saved ${files.length} icons to “${dir.name}”`);
    });

  const sqA = activeItems[0]?.sq;

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
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
                <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
                <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
                <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">Icon Splitter</h1>
              <p className="text-xs text-slate-400">Detect icons on a sheet → equal squares with padding</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button data-testid="upload-button" onClick={() => fileRef.current?.click()} className="btn-ghost">
              + Upload images
            </button>
            <button data-testid="export-zip" disabled={!total} onClick={downloadZip} className="btn-primary">
              ⬇ ZIP ({total})
            </button>
            <button data-testid="export-folder" disabled={!total} onClick={saveFolder} className="btn-ghost">
              📁 Save to folder
            </button>
            <button data-testid="export-download" disabled={!total} onClick={downloadAll} className="btn-ghost">
              Download files
            </button>
          </div>
        </div>
      </header>

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

      <main className="mx-auto max-w-7xl px-4 py-6">
        {!sheets.length ? (
          <div
            data-testid="dropzone"
            onClick={() => fileRef.current?.click()}
            className="mx-auto mt-10 flex max-w-2xl cursor-pointer flex-col items-center rounded-3xl border-2 border-dashed border-white/15 bg-white/[0.03] px-6 py-20 text-center transition hover:border-indigo-400/60 hover:bg-white/[0.06]"
          >
            <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-indigo-500/15 text-3xl">🖼️</div>
            <h2 className="text-2xl font-semibold">Drop your icon sheets here</h2>
            <p className="mt-2 max-w-md text-slate-400">
              Upload one or many images that contain several icons. Every icon is found automatically, cropped exactly
              and exported as a same-size square with small padding.
            </p>
            <span className="btn-primary mt-6">Choose images</span>
            <p className="mt-4 text-xs text-slate-500">PNG · JPG · WEBP — processed locally, nothing is uploaded</p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            {/* sidebar */}
            <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
              <section className="panel">
                <h3 className="panel-title">Sheets ({sheets.length})</h3>
                <div className="space-y-2">
                  {sheets.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => setActiveId(s.id)}
                      className={`group flex cursor-pointer items-center gap-3 rounded-xl border p-2 transition ${
                        s.id === activeId
                          ? "border-indigo-400/70 bg-indigo-500/10"
                          : "border-white/10 hover:border-white/25"
                      }`}
                    >
                      <img src={s.url} alt="" className="h-12 w-12 rounded-lg bg-white object-contain" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-slate-400">
                          {s.boxes.length - s.excluded.length} icons · {s.img.naturalWidth}×{s.img.naturalHeight}
                        </p>
                      </div>
                      <button
                        data-testid={`sheet-remove-${s.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSheet(s.id);
                        }}
                        className="rounded-md px-2 py-1 text-slate-500 hover:bg-white/10 hover:text-white"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => fileRef.current?.click()} className="btn-ghost mt-3 w-full">
                  + Add more sheets
                </button>
              </section>

              <section className="panel">
                <h3 className="panel-title">Export settings</h3>
                <label className="block text-sm">
                  <div className="mb-1 flex justify-between">
                    <span>Padding on each side</span>
                    <span className="text-slate-400">{padding}%</span>
                  </div>
                  <input
                    data-testid="padding-slider"
                    type="range"
                    min={0}
                    max={25}
                    value={padding}
                    onChange={(e) => setPadding(+e.target.value)}
                    className="w-full accent-indigo-500"
                  />
                </label>
                <label className="mt-4 block text-sm">
                  <span className="mb-1 block">Square size</span>
                  <select
                    data-testid="size-select"
                    value={size}
                    onChange={(e) => setSize(+e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"
                  >
                    {SIZES.map((s) => (
                      <option key={s.v} value={s.v}>
                        {s.l}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    data-testid="transparent-checkbox"
                    type="checkbox"
                    checked={transparent}
                    onChange={(e) => setTransparent(e.target.checked)}
                    className="h-4 w-4 accent-indigo-500"
                  />
                  Transparent background
                </label>
                {sqA && (
                  <p className="mt-4 rounded-lg bg-white/5 p-2 text-xs text-slate-400">
                    Every icon is centered in one shared square of{" "}
                    <b className="text-slate-200">{size || Math.round(sqA.total)} px</b>.
                  </p>
                )}
              </section>

              {active && (
                <section className="panel">
                  <h3 className="panel-title">Detection</h3>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>Merge distance</span>
                    <span className="text-slate-400">{active.manual ? "manual" : "auto"}</span>
                  </div>
                  <input
                    data-testid="merge-slider"
                    type="range"
                    min={0}
                    max={0.15}
                    step={0.0025}
                    value={active.usedFrac}
                    onChange={(e) => redetect(active.id, +e.target.value)}
                    className="w-full accent-indigo-500"
                  />
                  <p className="mt-2 text-xs text-slate-400">
                    Lower = split loose parts into separate icons. Higher = merge parts that are further apart.
                    Found <b className="text-slate-200">{active.boxes.length}</b> icon
                    {active.boxes.length === 1 ? "" : "s"}.
                  </p>
                  <button
                    data-testid="merge-reset"
                    disabled={!active.manual}
                    onClick={() => redetect(active.id, null)}
                    className="btn-ghost mt-3 w-full"
                  >
                    ↺ Reset to auto
                  </button>
                </section>
              )}
            </aside>

            {/* content */}
            {active && (
              <div className="min-w-0 space-y-6">
                <section className="panel">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="panel-title !mb-0">Detected boundaries — {active.name}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <i className="inline-block h-2.5 w-4 rounded-sm border-2 border-emerald-400" /> icon
                      </span>
                      <span className="flex items-center gap-1">
                        <i className="inline-block h-2.5 w-4 rounded-sm border-2 border-dashed border-indigo-400" /> export square
                      </span>
                      <span>Click a box to include / exclude</span>
                    </div>
                  </div>
                  <div className="relative mx-auto max-w-2xl overflow-hidden rounded-xl bg-white">
                    <img src={active.url} alt="sheet" className="block w-full" draggable={false} />
                    <svg
                      viewBox={`0 0 ${active.img.naturalWidth} ${active.img.naturalHeight}`}
                      className="absolute inset-0 h-full w-full"
                    >
                      {active.boxes.map((b, i) => {
                        const off = active.excluded.includes(i);
                        const sw = active.img.naturalWidth / 380;
                        const it = activeItems.find((x) => x.i === i);
                        const sqi = it ? it.sq : squareInfo(active.boxes, padding);
                        const cr = cropRect(b, sqi.total);
                        return (
                          <g key={i} data-testid={`box-toggle-${i}`} onClick={() => toggleBox(active.id, i)} className="cursor-pointer">
                            {!off && (
                              <rect
                                x={cr.x}
                                y={cr.y}
                                width={cr.size}
                                height={cr.size}
                                fill="none"
                                stroke="#6366f1"
                                strokeWidth={sw}
                                strokeDasharray={`${sw * 4} ${sw * 3}`}
                              />
                            )}
                            <rect
                              x={b.x}
                              y={b.y}
                              width={b.w}
                              height={b.h}
                              fill={off ? "rgba(100,116,139,.35)" : "rgba(16,185,129,.10)"}
                              stroke={off ? "#94a3b8" : "#10b981"}
                              strokeWidth={sw * 1.4}
                              strokeDasharray={off ? `${sw * 3} ${sw * 3}` : undefined}
                            />
                            <circle cx={b.x + 14 * sw} cy={b.y + 14 * sw} r={11 * sw} fill={off ? "#64748b" : "#10b981"} />
                            <text
                              x={b.x + 14 * sw}
                              y={b.y + 14 * sw}
                              fontSize={13 * sw}
                              fontWeight={700}
                              fill="white"
                              textAnchor="middle"
                              dominantBaseline="central"
                            >
                              {i + 1}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="panel-title !mb-0">Result — {activeItems.length} icons</h3>
                    <span className="text-xs text-slate-400">Same-size squares</span>
                  </div>
                  {activeItems.length ? (
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                      {activeItems.map((it, k) => (
                        <div key={it.i} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                          <div className={`aspect-square ${checker}`}>
                            <img src={previews[k]} alt={`icon ${it.n + 1}`} className="h-full w-full" />
                          </div>
                          <div className="flex items-center gap-2 p-2">
                            <span className="text-xs text-slate-400">#{it.n + 1}</span>
                            <div className="ml-auto flex gap-1.5">
                              <button onClick={() => copyIcon(active, it)} className="btn-mini">
                                Copy
                              </button>
                              <button onClick={() => saveIcon(active, it)} className="btn-mini !bg-indigo-500 hover:!bg-indigo-400">
                                Save
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-white/10 p-6 text-center text-slate-400">
                      No icons selected. Click a box above or adjust the merge distance.
                    </p>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </main>

      {drag && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-indigo-600/30 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-white px-10 py-8 text-xl font-semibold">
            Drop images to detect icons
          </div>
        </div>
      )}

      {busy && (
        <div data-testid="busy-overlay" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900 px-6 py-4 shadow-2xl">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
            <span data-testid="busy-message" className="text-sm">{busy}</span>
          </div>
        </div>
      )}

      {toast && (
        <div
          data-testid="toast"
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-medium shadow-xl ${
            toast.err ? "bg-rose-600" : "bg-emerald-600"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
