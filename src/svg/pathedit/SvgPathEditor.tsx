// SvgPathEditor.tsx — the in-preview edit session on one icon (2026-11-06).
// It turns the row's SVG preview into the editor (no new page): the icon is
// drawn as the FILE has it (no preview stroke sheet), the edited path follows
// the working model live, and the overlay shows every anchor for the whole
// session. Two tools — Select and Draw — plus Finish edit (primary, only when
// something changed) and Cancel. A multi-path icon waits for a click on the
// path to edit. Nothing is written here: Finish hands the rewritten file text
// to the caller, which writes it once and records one undo step.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { editorState, type EditorState } from "../../lib/pathedit/gesture";
import { fromPathData, toPathData } from "../../lib/pathedit/model";
import { isDirty, newSession, setTool, type Tool } from "../../lib/pathedit/session";
import { annotatePaths, pathTags, withPathD } from "../../lib/pathedit/svgdoc";
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
  /** The rewritten file text — only one path's `d` differs. */
  onFinish: (markup: string) => void;
  onCancel: () => void;
}

/** A session on path `index` of `source`. */
function sessionFor(source: string, index: number): EditorState {
  return editorState(newSession(fromPathData(pathTags(source)[index]?.d ?? null)));
}

/** The edited path follows the working model; the overlay is redrawn at screen size. */
function usePaintSession(host: { current: HTMLDivElement | null }, pick: number | null, st: EditorState | null, anchorPx: number): void {
  useEffect(() => {
    const root = host.current?.shadowRoot ?? null;
    if (root === null) return;
    const path = pick === null ? null : root.querySelector(`[data-edit-path="${pick}"]`);
    if (path === null || st === null) { clearEditOverlay(root); return; }
    path.setAttribute("d", toPathData(st.session.model, 3));
    const u = toPathSpace(path, 0, 0)?.unitsPerPx ?? 1;
    drawEditOverlay(path, st, { u, anchorPx });
  }, [host, pick, st, anchorPx]);
}

export default function SvgPathEditor(p: SvgPathEditorProps) {
  const paths = useMemo(() => pathTags(p.source), [p.source]);
  const html = useMemo(() => buildSvgPreview(annotatePaths(p.source)).html, [p.source]);
  const [pick, setPick] = useState<number | null>(paths.length === 1 ? 0 : null);
  const [st, setSt] = useState<EditorState | null>(() => (paths.length === 1 ? sessionFor(p.source, 0) : null));
  const host = useRef<HTMLDivElement | null>(null);
  const { anchorPx } = useEditSettings();
  const choose = useCallback((n: number) => { setPick(n); setSt(sessionFor(p.source, n)); }, [p.source]);
  const finish = useCallback(() => {
    if (st === null || pick === null || !isDirty(st.session)) return;
    const out = withPathD(p.source, pick, toPathData(st.session.model));
    if (out !== null) p.onFinish(out);
  }, [st, pick, p]);
  useShadowArt(html, host, undefined);
  usePaintSession(host, pick, st, anchorPx);
  useEditorInput({ host, pathEl: () => (pick === null ? null : host.current?.shadowRoot?.querySelector(`[data-edit-path="${pick}"]`) ?? null), state: st, setState: setSt, onPick: choose, onFinish: finish });
  return (
    <div className="svg-path-editor" data-testid={`${p.testid}-editor`} style={{ width: p.box.width, height: p.box.height }}
      onClick={(e) => e.stopPropagation()}>
      <EditorToolbar testid={p.testid} st={st} onTool={(tool) => st && setSt({ ...st, session: setTool(st.session, tool) })}
        onFinish={finish} onCancel={p.onCancel} />
      <div ref={host} className="svg-preview editing" style={{ width: p.box.width, height: p.box.height }}
        role="img" aria-label={`${p.label} — editing`} data-testid={p.testid} />
      {pick === null && <p className="svg-edit-hint" data-testid={`${p.testid}-pick`}>Click the path to edit</p>}
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
      {toolBtn("select", "⬉", "Select: click, drag, box-select; Ctrl+click smooth/corner; Alt+drag a handle breaks it; Shift snaps; Delete removes")}
      {toolBtn("draw", "✒", "Draw: click adds a corner, drag pulls a smooth curve, click a segment inserts, the first point closes; Esc ends the path")}
      <span className="svg-edit-spacer" />
      <button type="button" className="svg-btn tiny primary" data-testid={`${testid}-finish`}
        disabled={st === null || !isDirty(st.session)} title="Write the edited path into the SVG (Enter) — one undo step" onClick={onFinish}>Finish edit</button>
      <button type="button" className="svg-edit-cancel" data-testid={`${testid}-cancel`} onClick={onCancel}>Cancel</button>
    </div>
  );
}
