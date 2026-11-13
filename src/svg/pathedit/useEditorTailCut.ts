// useEditorTailCut.ts — the tail cutter inside the edit mode (2026-11-09), on
// the ONE open artwork as it is right now (unsaved edits included). Highlight
// (Ctrl+J / "Cut tails") finds the tails with the Cutter algo settings and draws
// their boxes on the artboard; Apply (Ctrl+L) cuts exactly those tails into the
// session as ONE history step (Ctrl+Z puts the tails back, Ctrl+Shift+Z cuts
// again) — Finish edit writes it, Cancel drops it. Highlights
// belong to the text they were found on: any edit after them hides them and
// Apply asks for a new Ctrl+J. Hide highlights is the same switch as the bulk bar's.

import { useState, type RefObject } from "react";
import type { EditorState } from "../../lib/pathedit/gesture";
import type { PathModel } from "../../lib/pathedit/model";
import { commit } from "../../lib/pathedit/session";
import { cutTails, findTails, type Tail } from "../../lib/tailcut";
import { getCutSettings, useCutSettings } from "../tailcut/cutsettings";
import { setTailMarksHidden, useTailMarksHidden } from "../tailcut/tailreview";
import { useTailMarks } from "../tailcut/tailmarks";

export interface EditorTailCutArgs {
  host: RefObject<HTMLDivElement | null>;
  /** The artwork as it is now (the working file text). */
  current: string;
  /** The painted html and stroke view: a repaint wipes the boxes, so they are drawn again. */
  html: string;
  view: string;
  /** Takes the cut file as one new step of the session (undo / redo like any edit). */
  applyCut: (markup: string) => void;
}

export interface EditorTailCut {
  /** Cut tails: highlight, or — with Cut automatically — cut at once. */
  run: () => void;
  highlight: () => void;
  apply: () => void;
  /** How many highlighted tails Apply would cut right now (0 once the artwork changed or nothing is highlighted). */
  pending: number;
  /** What the last step did, for the top bar. */
  note: string;
}

interface Review { source: string; tails: Tail[] }

/**
 * The session after a cut: the cut file's shapes replace the owned ones as ONE
 * undoable step (drawn, unowned lines stay). Old anchor picks no longer point
 * at the same anchors, so the selection is dropped.
 */
export function cutIntoSession(st: EditorState, cut: PathModel): EditorState {
  const drawn = st.session.model.subs.filter((s) => s.owner === undefined);
  const next = commit(st.session, { subs: [...cut.subs, ...drawn] });
  return { ...st, session: { ...next, selection: [], active: null }, drag: null, snap: null, marquee: null };
}

const plural = (n: number) => `${n} tail${n === 1 ? "" : "s"}`;

/** Why Apply did nothing. */
function whyNot(review: Review | null, current: string): string {
  if (review === null) return "Nothing highlighted — press Ctrl+J first";
  return review.source === current ? "No tails to cut" : "The artwork changed — press Ctrl+J again";
}

export function useEditorTailCut(a: EditorTailCutArgs): EditorTailCut {
  const look = useCutSettings();
  const hidden = useTailMarksHidden();
  const [review, setReview] = useState<Review | null>(null);
  const [note, setNote] = useState("");
  const fresh = review !== null && review.source === a.current && review.tails.length > 0 ? review : null;
  const shown = fresh === null || hidden ? undefined : { tails: fresh.tails.map((t) => ({ tip: t.tip, path: t.path, shape: t.shape })), color: look.color, paddingPx: look.paddingPx };
  useTailMarks(a.host, `${a.view}|${a.html}`, shown);

  const highlight = () => {
    const tails = findTails(a.current, getCutSettings().tolerancePx);
    setReview({ source: a.current, tails });
    setTailMarksHidden(false);
    setNote(tails.length === 0 ? "No tails found" : `${plural(tails.length)} highlighted — Ctrl+L cuts`);
  };
  const cut = (tails: Tail[]) => {
    const after = cutTails(a.current, tails);
    if (after === null) { setNote("Nothing to cut"); return; }
    a.applyCut(after);
    setNote(`Cut ${plural(tails.length)} — Ctrl+Z undoes · Finish edit saves`);
  };
  const apply = () => {
    if (fresh === null) setNote(whyNot(review, a.current));
    else cut(fresh.tails);
  };
  const run = () => (getCutSettings().auto ? cut(findTails(a.current, getCutSettings().tolerancePx)) : highlight());
  return { run, highlight, apply, pending: fresh === null ? 0 : fresh.tails.length, note };
}
