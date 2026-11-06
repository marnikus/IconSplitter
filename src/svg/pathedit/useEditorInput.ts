// useEditorInput.ts — DOM events → the editor's pure gesture rules
// (lib/pathedit/gesture), 2026-11-06. A pointer position becomes a point in the
// edited path's OWN units through the path's screen matrix (so transforms and
// zoom are honoured) together with the units-per-pixel scale the hit radii
// need. While edit mode is on the window's keys belong to it: the edit mode's
// own keys first (onKey), then the session's (Delete, Esc, Enter, Ctrl+Z,
// Ctrl+Shift+Z / Ctrl+Y); no other app shortcut runs. Text fields keep theirs.

import { useEffect, useRef, type RefObject } from "react";
import { doubleClick, keyDown, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../../lib/pathedit/gesture";
import { isTextField } from "../../selection/hotkeys";

interface Matrix { a: number; b: number; c: number; d: number; e: number; f: number }
type Ctm = { getScreenCTM?: () => (Matrix & { inverse: () => Matrix }) | null };

/** The client point in the element's own units, and how many units one screen pixel is. */
export function toPathSpace(path: Element, clientX: number, clientY: number): { x: number; y: number; unitsPerPx: number } | null {
  const m = (path as unknown as Ctm).getScreenCTM?.() ?? null;
  if (m === null) return null;
  const inv = m.inverse();
  const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  return { x: inv.a * clientX + inv.c * clientY + inv.e, y: inv.b * clientX + inv.d * clientY + inv.f, unitsPerPx: 1 / scale };
}

export interface EditorInputCtx {
  host: RefObject<HTMLElement | null>;
  /** The element whose units the editor works in: the icon's root <svg>. */
  pathEl: () => Element | null;
  state: EditorState | null;
  setState: (next: EditorState) => void;
  onFinish: () => void;
  /** Edit settings' click tolerance for picking a shape, in screen px. */
  pickPx?: number;
  /** The edit mode's own keys (rows, stroke view, tools), asked first; true = used. */
  onKey?: (e: KeyboardEvent) => boolean;
}

function inputOf(path: Element, e: PointerEvent | MouseEvent, pickPx?: number): PointerInput | null {
  const at = toPathSpace(path, e.clientX, e.clientY);
  if (at === null) return null;
  return { p: { x: at.x, y: at.y }, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, unitsPerPx: at.unitsPerPx, target: pickedPath(e), ...(pickPx === undefined ? {} : { pickPx }) };
}

/** The icon path a click landed on (its data-edit-path number), if any. */
function pickedPath(e: Event): number | null {
  const target = e.composedPath()[0] as Element | undefined;
  const raw = target?.getAttribute?.("data-edit-path");
  return raw === null || raw === undefined ? null : Number(raw);
}

function useLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

type Step = (st: EditorState, i: PointerInput) => EditorState;

/** One pointer step on the current state, in the edited path's units. */
function applyPointer(c: { current: EditorInputCtx }, e: PointerEvent | MouseEvent, step: Step): void {
  const { state, pathEl, setState } = c.current;
  const path = pathEl();
  const input = path === null || state === null ? null : inputOf(path, e, c.current.pickPx);
  if (input !== null && state !== null) setState(step(state, input));
}

/** The preview's event handlers: down starts (or picks a path), move/up keep going while the button is held. */
function pointerHandlers(c: { current: EditorInputCtx }, node: HTMLElement): Record<string, (e: Event) => void> {
  const up = () => { const st = c.current.state; if (st?.drag) c.current.setState(pointerUp(st)); };
  return {
    pointerdown: (ev) => {
      const e = ev as PointerEvent;
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      if (c.current.state === null) return;
      node.setPointerCapture?.(e.pointerId);
      applyPointer(c, e, pointerDown);
    },
    pointermove: (e) => { if (c.current.state?.drag) applyPointer(c, e as PointerEvent, pointerMove); },
    pointerup: up,
    pointercancel: up,
    dblclick: (e) => { e.stopPropagation(); applyPointer(c, e as MouseEvent, doubleClick); },
    click: (e) => e.stopPropagation(),
  };
}

function usePointer(c: { current: EditorInputCtx }): void {
  useEffect(() => {
    const node = c.current.host.current;
    if (node === null) return undefined;
    const handlers = Object.entries(pointerHandlers(c, node));
    for (const [type, fn] of handlers) node.addEventListener(type, fn);
    return () => { for (const [type, fn] of handlers) node.removeEventListener(type, fn); };
  }, [c]);
}

/** While the session is open, the editor owns the keyboard (text fields excepted). */
function useKeys(c: { current: EditorInputCtx }): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = c.current.state;
      if (isTextField(e.target)) return;
      // edit mode on: no other app shortcut runs until it is off
      e.stopImmediatePropagation();
      if (c.current.onKey?.(e)) { e.preventDefault(); return; }
      if (st === null) return;
      const r = keyDown(st, { key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
      if (!r.handled) return;
      e.preventDefault();
      c.current.setState(r.state);
      if (r.finish) c.current.onFinish();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [c]);
}

/**
 * Events can come faster than React re-renders (a down + move in one task), so
 * the hook keeps the newest state itself: every step reads what the last one set.
 */
export function useEditorInput(ctx: EditorInputCtx): void {
  const live = useRef(ctx.state);
  live.current = ctx.state;
  const c = useLatest({
    ...ctx,
    get state() { return live.current; },
    setState: (next: EditorState) => { live.current = next; ctx.setState(next); },
  });
  usePointer(c);
  useKeys(c);
}
