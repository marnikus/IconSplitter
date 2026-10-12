// ResultGrid.tsx — result squares grid with copy/save actions

type Item = { i: number; n: number };

type Active = { id: string };

type Props = {
  active: Active;
  activeItems: Item[];
  previews: string[];
  checker: string;
  onCopy: (a: Active, it: Item) => void;
  onSave: (a: Active, it: Item) => void;
};

export default function ResultGrid({ active, activeItems, previews, checker, onCopy, onSave }: Props) {
  return (
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
                  <button onClick={() => onCopy(active as never, it as never)} className="btn-mini">Copy</button>
                  <button onClick={() => onSave(active as never, it as never)} className="btn-mini !bg-indigo-500 hover:!bg-indigo-400">Save</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-white/10 p-6 text-center text-slate-400">No icons selected. Click a box above or adjust the merge distance.</p>
      )}
    </section>
  );
}
