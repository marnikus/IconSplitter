// useEditMode.ts — everything the full-screen edit mode does on one icon
// (2026-11-06): it paints the artboard (thin lines or the tab's preset stroke,
// I switches), starts the session once the icon is drawn, keeps the changed
// shapes and the overlay in step with the working model, owns the keys (the
// edit mode's own first, then the session's) and the way to the previous /
// next row: nothing changed → go at once; changes → ask Save / Discard / Stay;
// Ctrl+Shift+S saves and goes, Ctrl+Shift+X discards and goes.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { editorState, type EditorState } from "../../lib/pathedit/gesture";
import { IDENTITY, invertAffine, multiplyAffine, type Affine } from "../../lib/pathedit/model";
import { loadObjects, previewData, writeObjects } from "../../lib/pathedit/objects";
import { newSession, setTool } from "../../lib/pathedit/session";
import { GEOMETRY, pathTags, type PathTag } from "../../lib/pathedit/svgdoc";
import { PREVIEW_CSS } from "../../lib/svgpreview";
import { useEditSettings } from "../editsettings";
import { SVG_STROKE_SHEET } from "../strokesheet";
import { clearEditOverlay, drawEditOverlay } from "./editoroverlay";
import { modalKeyAction, type ModalAction } from "./hotkeys";
import { toPathSpace, useEditorInput } from "./useEditorInput";
import { usePreviewZoom, type PreviewZoom } from "../../ui/usePreviewZoom";

/** The way to the neighbouring rows; `onGo` gets the rewritten file when it must be saved first. */
export interface EditNav {
  canPrev: boolean;
  canNext: boolean;
  /** "3 / 120 · name SVG v2" */
  position: string;
  onGo: (dir: 1 | -1, markup: string | null) => void;
}

export type StrokeView = "preset" | "thin";

/** Thin view: every shape a 1 px hairline at any zoom (the overlay's inline styles still win). */
const THIN_CSS = "<style>svg :is(path,circle,ellipse,rect,line,polyline,polygon){stroke-width:1px !important;vector-effect:non-scaling-stroke !important}</style>";

type ScreenCtm = { getScreenCTM?: () => Affine | null };
const screenOf = (el: Element | null): Affine | null => (el as unknown as ScreenCtm | null)?.getScreenCTM?.() ?? null;

/** Each shape's matrix into the icon's root space (its own transforms and its groups'). */
function objectMatrices(root: ShadowRoot, count: number): Affine[] {
  const svg = screenOf(root.querySelector("svg"));
  return Array.from({ length: count }, (_, i) => {
    const path = screenOf(root.querySelector(`[data-edit-path="${i}"]`));
    return svg === null || path === null ? IDENTITY : multiplyAffine(invertAffine(svg), path);
  });
}

/** Paints the icon (re-painted when the stroke view changes); the counter tells the overlay to redraw. */
function useArtboard(host: RefObject<HTMLDivElement | null>, html: string, view: StrokeView): number {
  const [painted, setPainted] = useState(0);
  useEffect(() => {
    const node = host.current;
    if (node === null) return;
    const root = node.shadowRoot ?? node.attachShadow({ mode: "open" });
    root.innerHTML = `${PREVIEW_CSS}${view === "thin" ? THIN_CSS : ""}${html}`;
    const r = root as ShadowRoot & { adoptedStyleSheets?: CSSStyleSheet[] };
    if (view === "preset") SVG_STROKE_SHEET.adopt(root);
    else if (r.adoptedStyleSheets !== undefined) r.adoptedStyleSheets = r.adoptedStyleSheets.filter((s) => s !== SVG_STROKE_SHEET.sheet());
    setPainted((n) => n + 1);
  }, [host, html, view]);
  return painted;
}

/** Starts the session once the icon is drawn (the matrices need the drawn shapes). */
function useStartSession(host: RefObject<HTMLDivElement | null>, source: string, html: string) {
  const [st, setSt] = useState<EditorState | null>(null);
  const matrices = useRef<Affine[]>([]);
  useEffect(() => {
    const root = host.current?.shadowRoot ?? null;
    if (root === null) return;
    const count = pathTags(source).length;
    matrices.current = objectMatrices(root, count);
    setSt(editorState(newSession(loadObjects(source, matrices.current), count === 1 ? [0] : [])));
  }, [host, source, html]);
  return { st, setSt, matrices };
}

/** The changed shapes follow the working model; the overlay is redrawn at screen size. */
function usePaintSession(host: RefObject<HTMLDivElement | null>, p: { source: string; st: EditorState | null; matrices: Affine[]; anchorPx: number; painted: number; view: StrokeView }): void {
  useEffect(() => {
    const root = host.current?.shadowRoot ?? null;
    const svg = root?.querySelector("svg") ?? null;
    if (root === null || svg === null) return;
    if (p.st === null) { clearEditOverlay(root); return; }
    const st = p.st;
    pathTags(p.source).forEach((t) => liveShape(root, t, previewData(p.source, st.session, t.index, p.matrices[t.index] ?? IDENTITY)));
    drawEditOverlay(svg, st, { u: toPathSpace(svg, 0, 0)?.unitsPerPx ?? 1, anchorPx: p.anchorPx, guide: p.view === "thin" });
  }, [host, p.source, p.st, p.matrices, p.anchorPx, p.painted, p.view]);
}

/**
 * Shows one shape as the working model has it. A <circle>, <rect>, … ignores
 * `d`, so a CHANGED basic shape is swapped for the <path> Finish will write
 * (same attributes, geometry attributes gone); an untouched one stays as it is.
 */
function liveShape(root: ShadowRoot, t: PathTag, d: string): void {
  const el = root.querySelector(`[data-edit-path="${t.index}"]`);
  if (el === null) return;
  if (el.tagName.toLowerCase() === "path") { el.setAttribute("d", d); return; }
  if (d === t.d) return;
  const path = el.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
  for (const a of Array.from(el.attributes)) if (!GEOMETRY[t.kind].includes(a.name)) path.setAttribute(a.name, a.value);
  path.setAttribute("d", d);
  el.replaceWith(path);
}

export interface EditModeArgs {
  host: RefObject<HTMLDivElement | null>;
  /** The artboard frame: Ctrl+Shift + scroll over it zooms the icon inside it. */
  board: RefObject<HTMLDivElement | null>;
  source: string;
  html: string;
  onFinish: (markup: string) => void;
  nav?: EditNav;
}

export interface EditMode {
  st: EditorState | null;
  setSt: (st: EditorState) => void;
  view: StrokeView;
  toggleView: () => void;
  /** A move asked while something changed: Save / Discard / Stay. */
  leave: 1 | -1 | null;
  resolveLeave: (choice: "save" | "discard" | "stay") => void;
  go: (dir: 1 | -1, mode: "ask" | "save" | "discard") => void;
  finish: () => void;
  dirty: boolean;
  zoom: PreviewZoom;
}

export function useEditMode(a: EditModeArgs): EditMode {
  const { anchorPx, pickPx } = useEditSettings();
  const [view, setView] = useState<StrokeView>("preset");
  const [leave, setLeave] = useState<1 | -1 | null>(null);
  const painted = useArtboard(a.host, a.html, view);
  const zoom = usePreviewZoom(a.board);
  const { st, setSt, matrices } = useStartSession(a.host, a.source, a.html);
  // a zoom changes the units per screen pixel: the overlay is redrawn at screen size
  usePaintSession(a.host, { source: a.source, st, matrices: matrices.current, anchorPx, painted: painted + zoom.view.scale, view });
  const markup = useCallback(() => (st === null ? null : writeObjects(a.source, st.session, matrices.current)), [st, a.source, matrices]);
  const go = useCallback((dir: 1 | -1, mode: "ask" | "save" | "discard") => {
    const nav = a.nav;
    if (nav === undefined || !(dir === 1 ? nav.canNext : nav.canPrev)) return;
    const out = markup();
    if (out === null || mode === "discard") nav.onGo(dir, null);
    else if (mode === "save") nav.onGo(dir, out);
    else setLeave(dir);
  }, [a.nav, markup]);
  const finish = useCallback(() => { const out = markup(); if (out !== null) a.onFinish(out); }, [markup, a]);
  const toggleView = useCallback(() => setView((v) => (v === "thin" ? "preset" : "thin")), []);
  const resolveLeave = useCallback((choice: "save" | "discard" | "stay") => {
    const dir = leave;
    setLeave(null);
    if (dir !== null && choice !== "stay") go(dir, choice);
  }, [leave, go]);
  const onKey = useModeKeys({ leave, resolveLeave, go, toggleView, st, setSt });
  useEditorInput({ host: a.host, pathEl: () => a.host.current?.shadowRoot?.querySelector("svg") ?? null, state: st, setState: setSt, onFinish: finish, pickPx, onKey });
  return { st, setSt, view, toggleView, leave, resolveLeave, go, finish, dirty: markup() !== null, zoom };
}

interface KeyParts {
  leave: 1 | -1 | null;
  resolveLeave: EditMode["resolveLeave"];
  go: EditMode["go"];
  toggleView: () => void;
  st: EditorState | null;
  setSt: (st: EditorState) => void;
}

/** The edit mode's own keys; while the Save / Discard question is open, only its answers. */
function useModeKeys(k: KeyParts): (e: KeyboardEvent) => boolean {
  return (e: KeyboardEvent) => {
    if (k.leave !== null) {
      if (e.key === "Escape") k.resolveLeave("stay");
      if (e.key === "Enter") k.resolveLeave("save");
      return true;
    }
    const action = modalKeyAction(e);
    if (action === null) return false;
    runAction(action, k);
    return true;
  };
}

function runAction(action: ModalAction, k: KeyParts): void {
  if (action === "prev" || action === "next") k.go(action === "next" ? 1 : -1, "ask");
  else if (action === "save-next") k.go(1, "save");
  else if (action === "discard-next") k.go(1, "discard");
  else if (action === "toggle-stroke") k.toggleView();
  else if (k.st !== null) k.setSt({ ...k.st, session: setTool(k.st.session, action === "tool-draw" ? "draw" : "select") });
}
