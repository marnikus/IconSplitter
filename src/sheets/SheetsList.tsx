// SheetsList.tsx — loaded sheets with RULE 25 checks: a checked sheet is
// exported and receives merge-distance changes; the active row is shown.
import type { KeyboardEvent, MouseEvent } from "react";
import { checkState, nextVisibleId, selectIntent, type RowSelection, type SelectIntent } from "../lib/reviewselect";
import { includedBoxes } from "../lib/sheetsel";
import { isNativeListKeyTarget, isRowGestureClick } from "../ui/rowgesture";
import type { Sheet } from "./importSheets";

type SheetLite = Pick<Sheet, "id" | "name" | "url" | "boxes" | "excluded"> & { img: { naturalWidth: number; naturalHeight: number } };

export interface SheetsListProps {
  sheets: SheetLite[];
  sel: RowSelection;
  onGesture: (id: string, intent: SelectIntent) => void;
  onToggleCheck: (id: string) => void;
  onSetCheck: (ids: readonly string[], on: boolean) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}

import GetDataButton from "../ui/GetDataButton";
import { sheetDataRows } from "./getdatarows";

export default function SheetsList(p: SheetsListProps) {
  const ids = p.sheets.map((s) => s.id);
  return (
    <section className="panel">
      <ListHeader ids={ids} checked={p.sel.checked} onSetCheck={p.onSetCheck} />
      <div className="mb-2 flex justify-end">
        <GetDataButton testid="sheet" count={p.sel.checked.filter((id) => ids.includes(id)).length} rows={() => sheetDataRows(p.sheets, p.sel.checked)} />
      </div>
      <div className="space-y-2 outline-none" tabIndex={0} data-testid="sheet-list" onKeyDown={(e) => onListKey(e, p, ids)}>
        {p.sheets.map((s) => <SheetRow key={s.id} sheet={s} sel={p.sel} p={p} />)}
      </div>
      <button onClick={p.onAdd} className="btn-ghost mt-3 w-full">+ Add more sheets</button>
    </section>
  );
}

function ListHeader({ ids, checked, onSetCheck }: { ids: string[]; checked: string[]; onSetCheck: SheetsListProps["onSetCheck"] }) {
  const state = checkState(ids, checked);
  const on = checked.filter((id) => ids.includes(id)).length;
  return (
    <label className="panel-title flex cursor-pointer items-center gap-2">
      <input type="checkbox" data-testid="sheet-check-all" aria-label="Select all sheets" className="h-4 w-4 accent-indigo-500"
        checked={state === "all"} ref={(el) => { if (el) el.indeterminate = state === "some"; }} onChange={(e) => onSetCheck(ids, e.target.checked)} />
      <span>Sheets ({ids.length})</span>
      <span className="ml-auto text-xs font-normal normal-case text-slate-400">{on} checked</span>
    </label>
  );
}

/** Up/Down move the active sheet; E/Q check/uncheck it (all/none without an active sheet). */
function onListKey(e: KeyboardEvent<HTMLDivElement>, p: SheetsListProps, ids: string[]) {
  if (isNativeListKeyTarget(e.target)) return;
  const k = e.key.toLowerCase();
  if (k === "arrowdown" || k === "arrowup") {
    const next = nextVisibleId(ids, p.sel.active, k === "arrowdown" ? 1 : -1);
    if (next) p.onGesture(next, "replace");
  } else if (k === "e" || k === "q") {
    p.onSetCheck(p.sel.active ? [p.sel.active] : ids, k === "e");
  } else return;
  e.preventDefault();
}

function SheetRow({ sheet, sel, p }: { sheet: SheetLite; sel: RowSelection; p: SheetsListProps }) {
  const active = sheet.id === sel.active;
  const checked = sel.checked.includes(sheet.id);
  const onClick = (e: MouseEvent<HTMLDivElement>) => { if (isRowGestureClick(e)) p.onGesture(sheet.id, selectIntent(e)); };
  return (
    <div data-testid={`sheet-row-${sheet.id}`} aria-selected={active} onClick={onClick}
      className={`group flex cursor-pointer select-none items-center gap-3 rounded-xl border p-2 transition ${active ? "border-indigo-400/70 bg-indigo-500/10" : "border-white/10 hover:border-white/25"} ${checked ? "" : "opacity-60"}`}>
      <input type="checkbox" data-testid={`sheet-check-${sheet.id}`} aria-label={`Export ${sheet.name}`} checked={checked}
        onChange={() => p.onToggleCheck(sheet.id)} className="h-4 w-4 shrink-0 accent-indigo-500" />
      <img src={sheet.url} alt="" className="h-12 w-12 rounded-lg bg-white object-contain" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{sheet.name}</p>
        <p className="text-xs text-slate-400">{includedBoxes(sheet).length}/{sheet.boxes.length} icons · {sheet.img.naturalWidth}×{sheet.img.naturalHeight}</p>
      </div>
      <button data-testid={`sheet-remove-${sheet.id}`} onClick={() => p.onRemove(sheet.id)} className="rounded-md px-2 py-1 text-slate-500 hover:bg-white/10 hover:text-white" title="Remove">✕</button>
    </div>
  );
}
