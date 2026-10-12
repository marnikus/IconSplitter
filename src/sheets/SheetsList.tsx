// SheetsList.tsx — list of loaded sheets with active selection
// One responsibility: render sheet rows and the add-more button.

type SheetLite = { id: string; name: string; url: string; boxes: unknown[]; excluded: number[]; img: { naturalWidth: number; naturalHeight: number } };

type Props = {
  sheets: SheetLite[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
};

export default function SheetsList({ sheets, activeId, onSelect, onRemove, onAdd }: Props) {
  return (
    <section className="panel">
      <h3 className="panel-title">Sheets ({sheets.length})</h3>
      <div className="space-y-2">
        {sheets.map((s) => (
          <SheetRow key={s.id} sheet={s} active={s.id === activeId} onSelect={onSelect} onRemove={onRemove} />
        ))}
      </div>
      <button onClick={onAdd} className="btn-ghost mt-3 w-full">+ Add more sheets</button>
    </section>
  );
}

function SheetRow({ sheet, active, onSelect, onRemove }: { sheet: SheetLite; active: boolean; onSelect: Props["onSelect"]; onRemove: Props["onRemove"] }) {
  return (
    <div onClick={() => onSelect(sheet.id)} className={`group flex cursor-pointer items-center gap-3 rounded-xl border p-2 transition ${active ? "border-indigo-400/70 bg-indigo-500/10" : "border-white/10 hover:border-white/25"}`}>
      <img src={sheet.url} alt="" className="h-12 w-12 rounded-lg bg-white object-contain" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{sheet.name}</p>
        <p className="text-xs text-slate-400">{sheet.boxes.length - sheet.excluded.length} icons · {sheet.img.naturalWidth}×{sheet.img.naturalHeight}</p>
      </div>
      <button data-testid={`sheet-remove-${sheet.id}`} onClick={(e) => { e.stopPropagation(); onRemove(sheet.id); }} className="rounded-md px-2 py-1 text-slate-500 hover:bg-white/10 hover:text-white" title="Remove">✕</button>
    </div>
  );
}
