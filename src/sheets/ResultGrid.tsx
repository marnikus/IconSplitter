// ResultGrid.tsx — every detected icon of the active sheet as a result square.
// Clicking the image or its checkbox includes / excludes it from export; the
// excluded icon stays visible, dimmed, so it can be brought back (I-3).

export interface ResultItem { i: number; off: boolean }

export interface ResultGridProps {
  items: ResultItem[];
  previews: string[];
  checker: string;
  onToggle: (i: number) => void;
  onCopy: (i: number) => void;
  onSave: (i: number) => void;
}

export default function ResultGrid({ items, previews, checker, onToggle, onCopy, onSave }: ResultGridProps) {
  const on = items.filter((x) => !x.off).length;
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="panel-title !mb-0">Result — {on} of {items.length} icons</h3>
        <span className="text-xs text-slate-400">Click an icon to include / exclude it</span>
      </div>
      {items.length ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {items.map((it, k) => <ResultCard key={it.i} it={it} src={previews[k]} checker={checker} p={{ onToggle, onCopy, onSave }} />)}
        </div>
      ) : (
        <p className="rounded-xl border border-white/10 p-6 text-center text-slate-400">No icons detected. Adjust the merge distance.</p>
      )}
    </section>
  );
}

type Actions = Pick<ResultGridProps, "onToggle" | "onCopy" | "onSave">;

function ResultCard({ it, src, checker, p }: { it: ResultItem; src: string; checker: string; p: Actions }) {
  return (
    <div className={`overflow-hidden rounded-2xl border transition ${it.off ? "border-white/5 bg-white/[0.02]" : "border-white/10 bg-white/[0.04]"}`}>
      <button type="button" data-testid={`result-image-${it.i}`} aria-pressed={!it.off} title={it.off ? "Excluded — click to include" : "Click to exclude"}
        onClick={() => p.onToggle(it.i)} className={`relative block aspect-square w-full cursor-pointer ${checker} ${it.off ? "opacity-30 grayscale" : ""}`}>
        <img src={src} alt={`icon ${it.i + 1}`} className="h-full w-full" draggable={false} />
        {it.off && <span className="absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-slate-900/90 px-2 py-0.5 text-xs text-slate-200">excluded</span>}
      </button>
      <div className="flex items-center gap-2 p-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
          <input type="checkbox" data-testid={`result-check-${it.i}`} aria-label={`Export icon ${it.i + 1}`} checked={!it.off}
            onChange={() => p.onToggle(it.i)} className="h-4 w-4 accent-indigo-500" />
          #{it.i + 1}
        </label>
        <div className="ml-auto flex gap-1.5">
          <button onClick={() => p.onCopy(it.i)} className="btn-mini">Copy</button>
          <button onClick={() => p.onSave(it.i)} className="btn-mini !bg-indigo-500 hover:!bg-indigo-400">Save</button>
        </div>
      </div>
    </div>
  );
}
