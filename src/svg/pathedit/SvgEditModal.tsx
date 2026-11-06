// SvgEditModal.tsx — Generate SVG's full-screen edit mode (2026-11-06): one
// modal for the whole tab, opened by a row's ✎ Edit, on the row the store
// names. ← / → (and the side arrows) open the previous / next editable row in
// the list's order at once — after Save writes the current one when asked.
// Finish writes and closes; Cancel closes and drops the session.

import type { DirHandleLike } from "../../lib/fs";
import { previewTargetOf } from "../rowmodel";
import { finishSvgEdit } from "../svgedit";
import type { SvgRow } from "../types";
import { useSvgText } from "../usesvgtext";
import { closeSvgEditor, openSvgEditor, useSvgEditorId } from "./editmodalstore";
import { neighborRow } from "./editnav";
import SvgPathEditor from "./SvgPathEditor";

export interface SvgEditModalProps {
  rows: readonly SvgRow[];
  rootRef: { current: DirHandleLike | null };
  rootToken: number;
}

/** A row the edit mode can open: a drawn SVG and no run writing it. */
const editable = (r: SvgRow): boolean => previewTargetOf(r) !== null && !r.running && !r.queued;

export default function SvgEditModal(p: SvgEditModalProps) {
  const id = useSvgEditorId();
  if (id === null) return null;
  return <ModalBody key={id} id={id} {...p} />;
}

function ModalBody({ id, rows, rootRef, rootToken }: SvgEditModalProps & { id: string }) {
  const row = rows.find((r) => r.source.id === id) ?? null;
  const target = row === null ? null : previewTargetOf(row);
  const svg = useSvgText(rootRef, rootToken, target?.svgPath ?? "");
  const prev = neighborRow(rows, id, -1, editable);
  const next = neighborRow(rows, id, 1, editable);
  const label = row === null || target === null ? "" : `${row.source.stem} SVG v${target.version}`;
  const save = async (markup: string) => (row !== null && target !== null && svg !== null
    ? finishSvgEdit({ id, svgPath: target.svgPath, label, before: svg, after: markup }) : false);
  const onGo = (dir: 1 | -1, markup: string | null) => {
    const to = dir === 1 ? next : prev;
    void (async () => {
      if (markup !== null && !(await save(markup))) return; // a failed write keeps the artboard open
      if (to !== null) openSvgEditor(to.source.id);
    })();
  };
  const position = `${rows.findIndex((r) => r.source.id === id) + 1} / ${rows.length} · ${label}`;
  return (
    <div className="svg-edit-modal" role="dialog" aria-modal="true" aria-label={`Edit ${label}`} data-testid="svg-edit-modal">
      {svg === null || row === null
        ? <ModalWaiting missing={row === null} />
        : <SvgPathEditor source={svg} testid={`svg-edit-${id}`} label={label}
            onFinish={(m) => { void save(m).then((ok) => { if (ok) closeSvgEditor(); }); }} onCancel={closeSvgEditor}
            nav={{ canPrev: prev !== null, canNext: next !== null, position, onGo }} />}
    </div>
  );
}

function ModalWaiting({ missing }: { missing: boolean }) {
  return (
    <div className="svg-edit-waiting">
      <p>{missing ? "This row is no longer in the list." : "Reading the SVG…"}</p>
      <button type="button" className="svg-edit-cancel" data-testid="svg-edit-modal-close" onClick={closeSvgEditor}>Close</button>
    </div>
  );
}
