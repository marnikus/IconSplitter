// svgeditslot.tsx — the row's SVG side while an edit session is open
// (2026-11-06): the small ✎ Edit control beside the SVG version, the session's
// open / Cancel / Finish (one write, one undo step — svg/svgedit) and the larger
// editing frame the editor (pathedit/SvgPathEditor) is drawn in. Split from
// SvgThumbs so that file keeps to its own job.

import { useState, type ReactNode } from "react";
import { pathTags } from "../lib/pathedit/svgdoc";
import type { PreviewSlot } from "../ui/PairedThumbs";
import SvgPathEditor from "./pathedit/SvgPathEditor";
import { finishSvgEdit } from "./svgedit";
import type { SvgRow } from "./types";

/** The SVG side's bar: Edit beside the version chips (the chips step aside while editing). */
export function svgBarOf(row: SvgRow, edit: EditCtl, chips: ReactNode): ReactNode {
  return <>
    <SvgEditButton id={row.source.id} editing={edit.editing} why={edit.blocked} onEdit={edit.open} />
    {!edit.editing && chips}
  </>;
}

export function PairBars({ ai, aiWidth, svg, svgWidth }: { ai: ReactNode; aiWidth: number; svg: ReactNode; svgWidth: number }) {
  return (
    <div className="svg-pair-bars">
      <div className="svg-pair-bar" style={{ width: `${aiWidth}px` }}>{ai}</div>
      <div className="svg-pair-bar" style={{ width: `${svgWidth}px` }}>{svg}</div>
    </div>
  );
}

/** The editing frame is never smaller than this many px high: anchors need room (2026-11-06). */
export const EDIT_FRAME_PX = 440;

export interface EditCtl {
  editing: boolean;
  /** Why Edit is not offered now, or null. */
  blocked: string | null;
  open: () => void;
  close: () => void;
  finish: (markup: string) => void;
}

/** One edit session per row: open, Cancel, and Finish (one write, one undo step). */
export function useEditSession(a: { row: SvgRow; svg: string | null; svgPath: string; version: number }): EditCtl {
  const [editing, setEditing] = useState(false);
  const blocked = editBlocked(a.row, a.svg);
  const finish = (markup: string) => {
    if (a.svg === null) return;
    void finishSvgEdit({ id: a.row.source.id, svgPath: a.svgPath, label: `${a.row.source.stem} SVG v${a.version}`, before: a.svg, after: markup })
      .then((ok) => { if (ok) setEditing(false); });
  };
  return { editing: editing && blocked === null, blocked, open: () => setEditing(true), close: () => setEditing(false), finish };
}

/** Edit needs a drawn SVG with a <path>, and no run writing this row. */
function editBlocked(row: SvgRow, svg: string | null): string | null {
  if (svg === null) return "No SVG to edit yet";
  if (row.running || row.queued) return "Generating or queued — wait until it finishes";
  return pathTags(svg).length === 0 ? "This SVG has no shape to edit" : null;
}

/** What the editing slot shows: the base frame (already at the editing size), the box, the file. */
export interface EditSlotArgs { base: PreviewSlot; box: { width: number; height: number }; svg: string; id: string; stem: string; version: number }

/** The SVG side while editing: the editor in a larger frame of the same ratio. */
export function editSlot(a: EditSlotArgs, edit: EditCtl): PreviewSlot {
  return {
    ...a.base,
    tag: `SVG v${a.version} — editing`,
    children: <SvgPathEditor source={a.svg} box={a.box} testid={`svg-edit-${a.id}`} label={`${a.stem} SVG v${a.version}`}
      onFinish={edit.finish} onCancel={edit.close} />,
  };
}

/** The small Edit control beside the SVG version. */
function SvgEditButton({ id, editing, why, onEdit }: { id: string; editing: boolean; why: string | null; onEdit: () => void }) {
  if (editing) return null;
  return (
    <button type="button" className="svg-btn tiny" data-testid={`svg-edit-btn-${id}`} disabled={why !== null}
      title={why ?? "Edit this SVG right here: anchors stay visible until Finish edit (one undo step) or Cancel"}
      onClick={(e) => { e.stopPropagation(); onEdit(); }}>✎ Edit</button>
  );
}
