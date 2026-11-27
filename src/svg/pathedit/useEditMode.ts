// useEditMode.ts — everything the full-screen edit mode does on one icon
// (2026-11-06): paints the artboard, starts the session once the icon is drawn,
// keeps only the changed shapes and pooled overlay layers in step with the
// working model (without re-serializing the full SVG document on pointermove),
// and owns edit hotkeys + neighbour navigation.

import { OVERLAY_STROKE_CSS } from "./overlaymarks";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { editorState, type EditorState } from "../../lib/pathedit/gesture";
import { IDENTITY, invertAffine, multiplyAffine, type Affine, type PathModel } from "../../lib/pathedit/model";
import { changedPreviewData, hasDirtyObjects, loadObjects, objectData, writeObjects } from "../../lib/pathedit/objects";
import { newSession, setTool, type Tool } from "../../lib/pathedit/session";
import { arrangeSession, type Arrange } from "../../lib/pathedit/layers";
import { liveOrder } from "./liveorder";
import { livePaint } from "./livepaint";
import { useEditFill } from "./useEditFill";
import { changePalette } from "./editcolors";
import { swapColors } from "../../lib/pathedit/palette";
import { cachedPathTags, GEOMETRY, pathTagCount, type PathTag } from "../../lib/pathedit/svgdoc";
import { PREVIEW_CSS } from "../../lib/svgpreview";
import { useEditSettings } from "../editsettings";
import { SVG_STROKE_SHEET } from "../strokesheet";
import { clearEditOverlay, drawEditOverlay } from "./editoroverlay";
import { modalKeyAction, type ModalAction } from "./hotkeys";
import { cutIntoSession, useEditorTailCut, type EditorTailCut } from "./useEditorTailCut";
import { useRowMoves } from "./useRowMoves";
import { toPathSpace, useEditorInput } from "./useEditorInput";
import { usePreviewZoom, type PreviewZoom } from "../../ui/usePreviewZoom";

export type EditReview = "approved" | "declined";

export interface EditNav {
  canPrev: boolean;
  canNext: boolean;
  /** "3 / 120 · name SVG v2" */
  position: string;
  /** `decision`: Ctrl+Shift+S ("approved") or Ctrl+Shift+X ("declined") before moving on. */
  onGo: (dir: 1 | -1, markup: string | null, decision?: EditReview) => void;
}

export type StrokeView = "preset" | "thin";

const THIN_CSS = `<style>svg :is(path,circle,ellipse,rect,line,polyline,polygon){stroke-width:${OVERLAY_STROKE_CSS("1px")} !important;vector-effect:non-scaling-stroke !important}</style>`;
const FREE_CSS = "<style>svg{overflow:visible}</style>";

type ScreenCtm = { getScreenCTM?: () => Affine | null };
const screenOf = (el: Element | null): Affine | null => (el as unknown as ScreenCtm | null)?.getScreenCTM?.() ?? null;

/** Each shape's matrix into the icon's root space (its own transforms and its groups'). */
function objectMatrices(root: ShadowRoot, count: number): Affine[] {
  const svg = screenOf(root.querySelector("svg"));
  const invSvg = svg === null ? null : invertAffine(svg);
  return Array.from({ length: count }, (_, i) => {
    const path = screenOf(root.querySelector(`[data-edit-path="${i}"]`));
    return invSvg === null || path === null ? IDENTITY : multiplyAffine(invSvg, path);
  });
}

/** Paints the icon (re-painted when the stroke view changes); the counter tells the overlay to redraw. */
function useArtboard(host: RefObject<HTMLDivElement | null>, html: string, view: StrokeView): number {
  const [painted, setPainted] = useState(0);
  useEffect(() => {
    const node = host.current;
    if (node === null) return;
    const root = node.shadowRoot ?? node.attachShadow({ mode: "open" });
    root.innerHTML = `${PREVIEW_CSS}${FREE_CSS}${view === "thin" ? THIN_CSS : ""}${html}`;
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
    const count = pathTagCount(source);
    matrices.current = objectMatrices(root, count);
    setSt(editorState(newSession(loadObjects(source, matrices.current), count === 1 ? [0] : [])));
  }, [host, source, html]);
  return { st, setSt, matrices };
}

interface PaintSync {
  painted: number;
  source: string;
  model: PathModel | null;
  /** The layer order and the fills the drawn elements show (2026-11-27). */
  order?: number[];
  paint?: PathModel["paint"];
  adds?: PathModel["adds"];
}

interface PaintParams {
  source: string;
  st: EditorState | null;
  matrices: Affine[];
  anchorPx: number;
  painted: number;
  zoomScale: number;
  view: StrokeView;
}

function flushLiveArtboard(root: ShadowRoot, sync: { current: PaintSync }, tags: readonly PathTag[], p: PaintParams): void {
  const svg = root.querySelector("svg");
  if (svg === null) return;
  if (p.st === null) {
    sync.current = { painted: p.painted, source: p.source, model: null };
    clearEditOverlay(root);
    return;
  }
  const prev = sync.current.painted === p.painted && sync.current.source === p.source ? sync.current.model : null;
  for (const [index, d] of changedPreviewData(tags, p.st.session, p.matrices, prev)) {
    const t = tags[index];
    if (t !== undefined) liveShape(root, t, d);
  }
  const model = p.st.session.model;
  syncLook(root, tags.length, model, prev === null ? null : sync.current);
  sync.current = { painted: p.painted, source: p.source, model, order: model.order, paint: model.paint, adds: model.adds };
  drawEditOverlay(svg, p.st, { u: toPathSpace(svg, 0, 0)?.unitsPerPx ?? 1, anchorPx: p.anchorPx, guide: p.view === "thin" });
}

/** Puts the drawn shapes into the model's layer order and fills when they changed since the last paint. */
function syncLook(root: ShadowRoot, count: number, model: PathModel, shown: PaintSync | null): void {
  if (model.order !== shown?.order) liveOrder(root, count, model);
  const full = model.paint !== shown?.paint || model.adds !== shown?.adds;
  if (full || (model.adds ?? []).length > 0) livePaint(root, model, (o) => objectData(model, o, IDENTITY), full);
}

/** Updates ONLY shapes whose SubPath references changed, then incrementally updates the overlay. */
function usePaintSession(host: RefObject<HTMLDivElement | null>, p: PaintParams): void {
  const sync = useRef<PaintSync>({ painted: -1, source: "", model: null });
  const tags = useMemo(() => cachedPathTags(p.source), [p.source]);
  useEffect(() => {
    const root = host.current?.shadowRoot ?? null;
    if (root !== null) flushLiveArtboard(root, sync, tags, p);
  }, [host, p, tags]);
}

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
  margin?: RefObject<HTMLDivElement | null>;
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
  leave: 1 | -1 | null;
  resolveLeave: (choice: "save" | "discard" | "stay") => void;
  go: (dir: 1 | -1, mode: "ask" | "save" | "discard" | "save-approve" | "discard-decline") => void;
  finish: () => void;
  dirty: boolean;
  zoom: PreviewZoom;
  cut: EditorTailCut;
  /** Fills the selected shapes with the current colour (the colour bar). */
  fillSelected: () => void;
}

export function useEditMode(a: EditModeArgs): EditMode {
  const { anchorPx, pickPx } = useEditSettings();
  const [view, setView] = useState<StrokeView>("preset");
  const painted = useArtboard(a.host, a.html, view);
  const zoom = usePreviewZoom(a.board);
  const { st, setSt, matrices } = useStartSession(a.host, a.source, a.html);
  usePaintSession(a.host, { source: a.source, st, matrices: matrices.current, anchorPx, painted, zoomScale: zoom.view.scale, view });
  const markup = useCallback(() => (st === null ? null : writeObjects(a.source, st.session, matrices.current)), [st, a.source, matrices]);
  const dirty = useMemo(() => st !== null && hasDirtyObjects(st.session), [st]);
  const getCurrent = useCallback(() => markup() ?? a.source, [markup, a.source]);
  const applyCut = useCallback((text: string) => {
    if (st !== null) setSt(cutIntoSession(st, loadObjects(text, matrices.current)));
  }, [st, setSt, matrices]);
  const cut = useEditorTailCut({ host: a.host, getCurrent, model: st?.session.model ?? null, html: a.html, view, applyCut });
  const { leave, resolveLeave, go, finish } = useRowMoves(a, markup);
  const toggleView = useCallback(() => setView((v) => (v === "thin" ? "preset" : "thin")), []);
  const arrange = useCallback((how: Arrange) => { if (st !== null) setSt({ ...st, session: arrangeSession(a.source, st.session, how) }); }, [st, setSt, a.source]);
  const onKey = useModeKeys({ leave, resolveLeave, go, toggleView, st, setSt, cut, arrange });
  const fill = useEditFill(a.source, st, setSt);
  useEditorInput({ onPress: fill.onPress, host: a.host, margin: a.margin, pathEl: () => a.host.current?.shadowRoot?.querySelector("svg") ?? null, state: st, setState: setSt, onFinish: finish, pickPx, onKey });
  return { st, setSt, view, toggleView, leave, resolveLeave, go, finish, dirty, zoom, cut, fillSelected: fill.fillSelected };
}

interface KeyParts {
  leave: 1 | -1 | null;
  resolveLeave: EditMode["resolveLeave"];
  go: EditMode["go"];
  cut: EditorTailCut;
  toggleView: () => void;
  st: EditorState | null;
  setSt: (st: EditorState) => void;
  arrange: (how: Arrange) => void;
}

function useModeKeys(k: KeyParts): (e: KeyboardEvent) => boolean {
  return (e: KeyboardEvent) => {
    if (k.leave !== null) {
      if (e.key === "Escape") k.resolveLeave("stay");
      if (e.key === "Enter") k.resolveLeave("save");
      return true;
    }
    const action = modalKeyAction(e);
    if (action === null) return false;
    if ((action === "prev" || action === "next") && (k.st?.session.selection.length ?? 0) > 0) return false;
    runAction(action, k);
    return true;
  };
}

function runAction(action: ModalAction, k: KeyParts): void {
  const tool = (t: Tool) => { if (k.st !== null) k.setSt({ ...k.st, session: setTool(k.st.session, t) }); };
  const run: Record<ModalAction, () => void> = {
    prev: () => k.go(-1, "ask"),
    next: () => k.go(1, "ask"),
    "save-next": () => k.go(1, "save-approve"),
    "decline-next": () => k.go(1, "discard-decline"),
    "toggle-stroke": k.toggleView,
    "tool-select": () => tool("select"),
    "tool-draw": () => tool("draw"),
    "tool-fill": () => tool("fill"),
    "swap-colors": () => changePalette(swapColors),
    "cut-highlight": k.cut.highlight,
    "cut-apply": k.cut.apply,
    "layer-forward": () => k.arrange("forward"),
    "layer-backward": () => k.arrange("backward"),
    "layer-front": () => k.arrange("front"),
    "layer-back": () => k.arrange("back"),
  };
  run[action]();
}
