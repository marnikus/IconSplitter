// SvgPathEditor.tsx — the in-preview edit session on one icon (2026-11-06).
// It turns the row's SVG preview into the editor (no new page): the icon is
// drawn as the FILE has it (no preview stroke sheet). Every path of the icon is
// an object of the session (lib/pathedit/objects): a click selects a path,
// another click switches, Shift+click adds or removes; only selected paths show
// anchors, every path can be snapped to, and the changed paths follow the
// working model live. Two tools — Select and Draw — plus Finish edit (primary,
// only when something changed) and Cancel. Nothing is written here: Finish
// hands the rewritten file text to the caller, which writes it once and
// records one undo step.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { editorState, type EditorState } from "../../lib/pathedit/gesture";
import { IDENTITY, invertAffine, multiplyAffine, type Affine } from "../../lib/pathedit/model";
import { dirtyObjects, loadObjects, previewData, writeObjects } from "../../lib/pathedit/objects";
import { newSession, setTool, type Tool } from "../../lib/pathedit/session";
import { annotatePaths, pathTags } from "../../lib/pathedit/svgdoc";
import { buildSvgPreview } from "../../lib/svgpreview";
import { useEditSettings } from "../editsettings";
import { useShadowArt } from "../SvgPreview";
import { clearEditOverlay, drawEditOverlay } from "./editoroverlay";
import { toPathSpace, useEditorInput } from "./useEditorInput";

export interface SvgPathEditorProps {
  /** The icon file's text as it is on disk. */
  source: string;
  box: { width: number; height: number };
  testid: string;
  label: string;
  /** The rewritten file text — only the changed paths' `d` differ. */
  onFinish: (markup: string) => void;
  onCancel: () => void;
}

type ScreenCtm = { getScreenCTM?: () => Affine | null };
const screenOf = (el: Element | null): Affine | null => (el as unknown as ScreenCtm | null)?.getScreenCTM?.() ?? null;

/** Each path's matrix into the icon's root space (its own transforms and its groups'). */
function objectMatrices(root: ShadowRoot, count: number): Affine[] {
  const svg = screenOf(root.querySelector("svg"));
  return Array.from({ length: count }, (_, i) => {
    const path = screenOf(root.querySelector(`[data-edit-path="${i}"]`));
    return svg === null || path === null ? IDENTITY : multiplyAffine(invertAffine(svg), path);
  });
}

/** Starts the session once the icon is drawn (the matrices need the drawn paths). */
function useStartSession(host: { current: HTMLDivElement | null }, source: string, html: string) {
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

/** The changed paths follow the working model; the overlay is redrawn at screen size. */
function usePaintSession(host: { current: HTMLDivElement | null }, p: { source: string; st: EditorState | null; matrices: Affine[]; anchorPx: number }): void {
  useEffect(() => {
    const root = host.current?.shadowRoot ?? null;
    const svg = root?.querySelector("svg") ?? null;
    if (root === null || svg === null) return;
    if (p.st === null) { clearEditOverlay(root); return; }
    const st = p.st;
    pathTags(p.source).forEach((t) => root.querySelector(`[data-edit-path="${t.index}"]`)
      ?.setAttribute("d", previewData(p.source, st.session, t.index, p.matrices[t.index] ?? IDENTITY)));
    drawEditOverlay(svg, st, { u: toPathSpace(svg, 0, 0)?.unitsPerPx ?? 1, anchorPx: p.anchorPx });
  }, [host, p.source, p.st, p.matrices, p.anchorPx]);
}

export default function SvgPathEditor(p: SvgPathEditorProps) {
  const html = useMemo(() => buildSvgPreview(annotatePaths(p.source)).html, [p.source]);
  const host = useRef<HTMLDivElement | null>(null);
  const { anchorPx } = useEditSettings();
  useShadowArt(html, host, undefined);
  const { st, setSt, matrices } = useStartSession(host, p.source, html);
  const finish = useCallback(() => {
    const out = st === null ? null : writeObjects(p.source, st.session, matrices.current);
    if (out !== null) p.onFinish(out);
  }, [st, p, matrices]);
  usePaintSession(host, { source: p.source, st, matrices: matrices.current, anchorPx });
  useEditorInput({ host, pathEl: () => host.current?.shadowRoot?.querySelector("svg") ?? null, state: st, setState: setSt, onFinish: finish });
  return (
    <div className="svg-path-editor" data-testid={`${p.testid}-editor`} style={{ width: p.box.width, height: p.box.height }}
      onClick={(e) => e.stopPropagation()}>
      <EditorToolbar testid={p.testid} st={st} onTool={(tool) => st && setSt({ ...st, session: setTool(st.session, tool) })}
        onFinish={finish} onCancel={p.onCancel} />
      <div ref={host} className="svg-preview editing" style={{ width: p.box.width, height: p.box.height }}
        role="img" aria-label={`${p.label} — editing`} data-testid={p.testid} />
      {st !== null && st.session.objects.length === 0 && (
        <p className="svg-edit-hint" data-testid={`${p.testid}-pick`}>Click a path to edit · Shift+click adds · drag a box over anchors</p>
      )}
    </div>
  );
}

interface ToolbarProps {
  testid: string;
  st: EditorState | null;
  onTool: (tool: Tool) => void;
  onFinish: () => void;
  onCancel: () => void;
}

/** Two tools, Finish edit (primary) and a text Cancel. */
function EditorToolbar({ testid, st, onTool, onFinish, onCancel }: ToolbarProps) {
  const tool = st?.session.tool ?? "select";
  const toolBtn = (t: Tool, glyph: string, title: string) => (
    <button type="button" className={`svg-btn tiny${tool === t ? " primary" : ""}`} data-testid={`${testid}-tool-${t}`}
      aria-pressed={tool === t} disabled={st === null} title={title} onClick={() => onTool(t)}>{glyph}</button>
  );
  return (
    <div className="svg-edit-toolbar" data-testid={`${testid}-toolbar`}>
      {toolBtn("select", "⬉", "Select: click a path (Shift adds), click/drag anchors, box-select; Ctrl+click smooth/corner; Alt+drag a handle breaks it; Shift snaps (to every path); Delete removes; Esc clears")}
      {toolBtn("draw", "✒", "Draw: click adds a corner, drag pulls a smooth curve, click a segment inserts, the first point closes; Esc ends the path")}
      <span className="svg-edit-spacer" />
      <button type="button" className="svg-btn tiny primary" data-testid={`${testid}-finish`}
        disabled={st === null || dirtyObjects(st.session).length === 0} title="Write the edited paths into the SVG (Enter) — one undo step" onClick={onFinish}>Finish edit</button>
      <button type="button" className="svg-edit-cancel" data-testid={`${testid}-cancel`} onClick={onCancel}>Cancel</button>
    </div>
  );
}
