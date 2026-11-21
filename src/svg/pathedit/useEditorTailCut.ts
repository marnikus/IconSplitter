// useEditorTailCut.ts — the tail cutter inside the edit mode (2026-11-09), on
// the ONE open artwork as it is right now (unsaved edits included). Highlight
// (Ctrl+J / "Cut tails") finds the tails with the Cutter algo settings and draws
// their boxes on the artboard; Apply (Ctrl+L) cuts exactly those tails into the
// session as ONE history step. Highlights belong to the model snapshot they were
// found on, invalidating in O(1) without re-serializing SVG on pointermove.

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
  getCurrent: () => string;
  model: PathModel | null;
  html: string;
  view: string;
  applyCut: (markup: string) => void;
}

export interface EditorTailCut {
  run: () => void;
  highlight: () => void;
  apply: () => void;
  pending: number;
  note: string;
}

interface Review { source: string; model: PathModel | null; tails: Tail[] }

export function cutIntoSession(st: EditorState, cut: PathModel): EditorState {
  const drawn = st.session.model.subs.filter((s) => s.owner === undefined);
  const next = commit(st.session, { subs: [...cut.subs, ...drawn] });
  return { ...st, session: { ...next, selection: [], active: null }, drag: null, snap: null, marquee: null };
}

const plural = (n: number) => `${n} tail${n === 1 ? "" : "s"}`;

function whyNot(review: Review | null, model: PathModel | null): string {
  if (review === null) return "Nothing highlighted — press Ctrl+J first";
  return review.model === model ? "No tails to cut" : "The artwork changed — press Ctrl+J again";
}

function buildCutOps(
  a: EditorTailCutArgs,
  state: { review: Review | null; fresh: Review | null; setReview: (r: Review) => void; setNote: (s: string) => void },
) {
  const highlight = () => {
    const current = a.getCurrent();
    const tails = findTails(current, getCutSettings().tolerancePx);
    state.setReview({ source: current, model: a.model, tails });
    setTailMarksHidden(false);
    state.setNote(tails.length === 0 ? "No tails found" : `${plural(tails.length)} highlighted — Ctrl+L cuts`);
  };
  const cut = (source: string, tails: Tail[]) => {
    const after = cutTails(source, tails);
    if (after === null) { state.setNote("Nothing to cut"); return; }
    a.applyCut(after);
    state.setNote(`Cut ${plural(tails.length)} — Ctrl+Z undoes · Finish edit saves`);
  };
  const apply = () => (state.fresh === null ? state.setNote(whyNot(state.review, a.model)) : cut(state.fresh.source, state.fresh.tails));
  const run = () => {
    if (!getCutSettings().auto) { highlight(); return; }
    const current = a.getCurrent();
    cut(current, findTails(current, getCutSettings().tolerancePx));
  };
  return { run, highlight, apply };
}

export function useEditorTailCut(a: EditorTailCutArgs): EditorTailCut {
  const look = useCutSettings();
  const hidden = useTailMarksHidden();
  const [review, setReview] = useState<Review | null>(null);
  const [note, setNote] = useState("");
  const fresh = review !== null && review.model === a.model && review.tails.length > 0 ? review : null;
  const shown = fresh === null || hidden ? undefined : {
    tails: fresh.tails.map((t) => ({ tip: t.tip, path: t.path, shape: t.shape })),
    color: look.color,
    paddingPx: look.paddingPx,
  };
  useTailMarks(a.host, `${a.view}|${a.html}`, shown);
  const ops = buildCutOps(a, { review, fresh, setReview, setNote });
  return { ...ops, pending: fresh === null ? 0 : fresh.tails.length, note };
}
