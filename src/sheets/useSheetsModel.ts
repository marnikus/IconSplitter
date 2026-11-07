// useSheetsModel.ts — the Single-sheets in-memory model: loaded sheets, the
// checked set (export + merge target, RULE 25 gestures), the active sheet and
// per-icon exclusion. Detection work survives exclusion (I-3).
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { detectAsync } from "../lib/detect";
import { applyRowGesture, pruneRowSelection, setChecked, toggleChecked, type RowSelection, type SelectIntent } from "../lib/reviewselect";
import { mergeTargets, toggleIndex } from "../lib/sheetsel";
import { importSheets, type Sheet } from "./importSheets";

type Say = (msg: string, err?: boolean) => void;
const EMPTY: RowSelection = { checked: [], active: null, anchor: null };

export interface SheetsModel {
  sheets: Sheet[];
  sel: RowSelection;
  active: Sheet | null;
  addFiles: (files: FileList | File[]) => Promise<void>;
  redetect: (frac: number | null) => void;
  toggleBox: (id: string, idx: number) => void;
  removeSheet: (id: string) => void;
  gesture: (id: string, intent: SelectIntent) => void;
  toggleCheck: (id: string) => void;
  setCheck: (ids: readonly string[], on: boolean) => void;
}

export function useSheetsModel(say: Say, busy: (m: string | null) => void): SheetsModel {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sel, setSel] = useState<RowSelection>(EMPTY);
  const seq = useRef(new Map<string, number>());
  const addFiles = useCallback((files: FileList | File[]) => importSheets(files, {
    busy,
    add: (sheet) => { setSheets((p) => [...p, sheet]); setSel((s) => ({ ...s, checked: [...s.checked, sheet.id] })); },
    select: (id) => setSel((s) => ({ ...s, active: id, anchor: id })),
    say,
  }), [say, busy]);
  const ids = sheets.map((s) => s.id);
  return {
    sheets, sel, addFiles,
    active: sheets.find((s) => s.id === sel.active) ?? null,
    redetect: (frac) => redetectMany({ sheets, ids: mergeTargets(sheets, sel.checked, sel.active), frac, seq: seq.current }, setSheets),
    toggleBox: (id, idx) => setSheets((p) => p.map((s) => (s.id === id ? { ...s, excluded: toggleIndex(s.excluded, idx) } : s))),
    removeSheet: (id) => { setSheets((p) => p.filter((s) => s.id !== id)); setSel((s) => withoutSheet(s, ids, id)); },
    gesture: (id, intent) => setSel((s) => applyRowGesture(s, { id, intent, visibleIds: ids })),
    toggleCheck: (id) => setSel((s) => ({ ...s, checked: toggleChecked(s.checked, id) })),
    setCheck: (some, on) => setSel((s) => ({ ...s, checked: setChecked(s.checked, some, on) })),
  };
}

/** Drops a removed sheet from the selection; the active row falls back to the last remaining sheet. */
function withoutSheet(sel: RowSelection, ids: readonly string[], id: string): RowSelection {
  const rest = ids.filter((x) => x !== id);
  const next = pruneRowSelection(sel, new Set(rest));
  return next.active ? next : { ...next, active: rest[rest.length - 1] ?? null };
}

interface RedetectJob { sheets: readonly Sheet[]; ids: readonly string[]; frac: number | null; seq: Map<string, number> }

/** Re-runs detection on each target; a slower, older result never overwrites a newer one. */
function redetectMany(job: RedetectJob, setSheets: Dispatch<SetStateAction<Sheet[]>>): void {
  for (const id of job.ids) {
    const sheet = job.sheets.find((s) => s.id === id);
    if (!sheet) continue;
    const token = (job.seq.get(id) ?? 0) + 1;
    job.seq.set(id, token);
    void detectAsync(sheet.an, job.frac).then((d) => {
      if (job.seq.get(id) !== token) return;
      setSheets((prev) => prev.map((s) => (s.id !== id ? s
        : { ...s, boxes: d.boxes, usedFrac: d.usedFrac, autoFrac: d.autoFrac, manual: job.frac != null, excluded: [] })));
    });
  }
}
