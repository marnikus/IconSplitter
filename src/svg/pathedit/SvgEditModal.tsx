// SvgEditModal.tsx — Generate SVG's full-screen edit mode (2026-11-06): one
// modal for the whole tab, opened by a row's ✎ Edit, on the row the store
// names. ← / → (and the side arrows) open the previous / next editable row in
// the list's order at once — after Save writes the current one when asked.
// Finish writes and closes; Cancel closes and drops the session.

import { useEffect } from "react";
import type { DirHandleLike } from "../../lib/fs";
import { patchSvg } from "../../state/appstore";
import { previewTargetOf } from "../rowmodel";
import { approveEditedSvg, finishSvgEdit } from "../svgedit";
import type { SvgRow } from "../types";
import { useSvgText } from "../usesvgtext";
import { closeSvgEditor, openSvgEditor, useSvgEditorId } from "./editmodalstore";
import { editableRow as editable, neighborRow } from "./editnav";
import SvgPathEditor from "./SvgPathEditor";
import AiSourcePanel from "./AiSourcePanel";
import { useImageUrl } from "../useimageurl";
import { mainImageOf } from "../../lib/svgimgreg";

export interface SvgEditModalProps {
  rows: readonly SvgRow[];
  rootRef: { current: DirHandleLike | null };
  rootToken: number;
}


export default function SvgEditModal(p: SvgEditModalProps) {
  const id = useSvgEditorId();
  if (id === null) return null;
  return <ModalBody key={id} id={id} {...p} />;
}

/** Everything the open row needs: its SVG text, its AI source image, its neighbours and its name. */
function useEditedRow({ id, rows, rootRef, rootToken }: SvgEditModalProps & { id: string }) {
  // the row being edited is the active row: after a reload the list comes back to it (2026-11-06)
  useEffect(() => { patchSvg({ activeId: id }); }, [id]);
  const row = rows.find((r) => r.source.id === id) ?? null;
  const target = row === null ? null : previewTargetOf(row);
  const svg = useSvgText(rootRef, rootToken, target?.svgPath ?? "");
  const aiUrl = useImageUrl(rootRef, row === null ? "" : mainImageOf(row.meta, row.source.relPath));
  const label = row === null || target === null ? "" : `${row.source.stem} SVG v${target.version}`;
  return { row, target, svg, aiUrl, label, prev: neighborRow(rows, id, -1, editable), next: neighborRow(rows, id, 1, editable) };
}

function ModalBody(p: SvgEditModalProps & { id: string }) {
  const { id, rows } = p;
  const { row, target, svg, aiUrl, label, prev, next } = useEditedRow(p);
  const save = async (markup: string) => (row !== null && target !== null && svg !== null
    ? finishSvgEdit({ id, svgPath: target.svgPath, label, before: svg, after: markup }) : false);
  const onGo = (dir: 1 | -1, markup: string | null, approve = false) => {
    const to = dir === 1 ? next : prev;
    void (async () => {
      if (markup !== null && !(await save(markup))) return; // a failed write keeps the artboard open
      if (approve && row !== null && !(await approveEditedSvg(id, row.review, label))) return;
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
            nav={{ canPrev: prev !== null, canNext: next !== null, position, onGo }}
            aside={<AiSourcePanel url={aiUrl} name={row.source.name} testid="svg-edit-ai" />} />}
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
