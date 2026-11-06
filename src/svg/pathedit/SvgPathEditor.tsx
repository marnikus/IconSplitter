// SvgPathEditor.tsx — the full-screen edit surface on one icon (2026-11-06):
// every control sits OUTSIDE the artboard — the top bar (tools, thin / preset
// stroke switch, which row this is, Finish edit, Cancel), the ‹ › arrows on the
// artboard's sides (previous / next SVG), and the hotkey legend at the bottom.
// The logic lives in useEditMode; nothing is written here: Finish and "save &
// go" hand the rewritten file text to the caller.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { EditorState } from "../../lib/pathedit/gesture";
import { setTool, type Tool } from "../../lib/pathedit/session";
import { annotatePaths } from "../../lib/pathedit/svgdoc";
import { buildSvgPreview } from "../../lib/svgpreview";
import { EDIT_HOTKEYS } from "./hotkeys";
import ZoomReset from "../../ui/ZoomReset";
import PreviewBgPicker from "../../ui/PreviewBgPicker";
import { previewFrame } from "../../lib/svgbackground";
import { setEditSettings, useEditSettings } from "../editsettings";
import { useEditMode, type EditMode, type EditNav } from "./useEditMode";

export type { EditNav } from "./useEditMode";

export interface SvgPathEditorProps {
  /** The icon file's text as it is on disk. */
  source: string;
  /** The artboard's box; fitted to the window when absent. */
  box?: { width: number; height: number };
  testid: string;
  label: string;
  /** The rewritten file text — only the changed shapes differ. */
  onFinish: (markup: string) => void;
  onCancel: () => void;
  nav?: EditNav;
  /** Shown to the left of the artboard, outside it (the AI source panel). */
  aside?: ReactNode;
}

/** Room the top bar, the legend and the side arrows take around the artboard. */
const CHROME = { w: 160, h: 260 };
/** The side panel's width (CSS .svg-edit-aside) plus its gap. */
const ASIDE_W = 380;

/** The largest box of the icon's ratio that fits the window beside the chrome. */
function useFittedBox(ratio: number, given?: { width: number; height: number }, aside = false): { width: number; height: number } {
  const [win, setWin] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  if (given !== undefined) return given;
  const h = Math.max(200, Math.min(win.h - CHROME.h, (win.w - CHROME.w - (aside ? ASIDE_W : 0)) / ratio));
  return { width: Math.round(h * ratio), height: Math.round(h) };
}

export default function SvgPathEditor(p: SvgPathEditorProps) {
  const art = useMemo(() => buildSvgPreview(annotatePaths(p.source)), [p.source]);
  const host = useRef<HTMLDivElement | null>(null);
  const board = useRef<HTMLDivElement | null>(null);
  const box = useFittedBox(art.ok ? art.ratio : 1, p.box, p.aside !== undefined);
  const mode = useEditMode({ host, board, source: p.source, html: art.html, onFinish: p.onFinish, nav: p.nav });
  return (
    <div className="svg-edit-surface" data-testid={`${p.testid}-editor`} onClick={(e) => e.stopPropagation()}>
      <TopBar testid={p.testid} mode={mode} position={p.nav?.position ?? p.label} onCancel={p.onCancel} />
      <div className="svg-edit-stage">
        {p.aside !== undefined && <div className="svg-edit-aside">{p.aside}</div>}
        <SideArrow testid={`${p.testid}-prev`} glyph="‹" title="Previous SVG (←)" disabled={!(p.nav?.canPrev ?? false)} onClick={() => mode.go(-1, "ask")} />
        <Board host={host} board={board} box={box} testid={p.testid} label={p.label} mode={mode} />
        <SideArrow testid={`${p.testid}-next`} glyph="›" title="Next SVG (→)" disabled={!(p.nav?.canNext ?? false)} onClick={() => mode.go(1, "ask")} />
      </div>
      <Legend testid={p.testid} />
      {mode.leave !== null && <LeaveDialog testid={p.testid} onAnswer={mode.resolveLeave} />}
    </div>
  );
}

/** The artboard: the icon in its shadow root, and the hint while no shape is picked. */
interface BoardProps {
  host: React.RefObject<HTMLDivElement | null>;
  board: React.RefObject<HTMLDivElement | null>;
  box: { width: number; height: number };
  testid: string;
  label: string;
  mode: EditMode;
}

function Board({ host, board, box, testid, label, mode }: BoardProps) {
  const picking = mode.st !== null && mode.st.session.objects.length === 0;
  const frame = previewFrame(useEditSettings().bg);
  return (
    <div ref={board} className={`svg-edit-board${frame.outline ? " contrast" : ""}`} style={{ width: box.width, height: box.height, background: frame.color }}>
      <div ref={host} className="svg-preview editing" style={{ width: box.width, height: box.height, transform: mode.zoom.transform, transformOrigin: "0 0" }}
        role="img" aria-label={`${label} — editing`} data-testid={testid} data-stroke={mode.view} />
      <ZoomReset testid={testid} zoom={mode.zoom} />
      {picking && <p className="svg-edit-hint" data-testid={`${testid}-pick`}>Click a shape to edit · Shift+click adds · drag a box over anchors</p>}
    </div>
  );
}

function SideArrow({ testid, glyph, title, disabled, onClick }: { testid: string; glyph: string; title: string; disabled: boolean; onClick: () => void }) {
  return <button type="button" className="svg-edit-arrow" data-testid={testid} title={title} aria-label={title} disabled={disabled} onClick={onClick}>{glyph}</button>;
}

function TopBar({ testid, mode, position, onCancel }: { testid: string; mode: EditMode; position: string; onCancel: () => void }) {
  const st = mode.st;
  return (
    <div className="svg-edit-toolbar" data-testid={`${testid}-toolbar`}>
      <ToolButtons testid={testid} st={st} onTool={(t) => st && mode.setSt({ ...st, session: setTool(st.session, t) })} />
      <button type="button" role="switch" aria-checked={mode.view === "thin"} className={`svg-btn tiny${mode.view === "thin" ? " primary" : ""}`}
        data-testid={`${testid}-stroke`} title="Thin lines / the preset stroke (I)" onClick={mode.toggleView}>
        {mode.view === "thin" ? "◫ Thin lines" : "◼ Preset stroke"}
      </button>
      <BoardBg />
      <span className="svg-edit-position" data-testid={`${testid}-position`}>{position}</span>
      <span className="svg-edit-spacer" />
      <button type="button" className="svg-btn tiny primary" data-testid={`${testid}-finish`} disabled={!mode.dirty}
        title="Write the edited shapes into the SVG (Enter) — one undo step" onClick={mode.finish}>Finish edit</button>
      <button type="button" className="svg-edit-cancel" data-testid={`${testid}-cancel`} onClick={onCancel}>Cancel</button>
    </div>
  );
}

/** The artboard's background: the PREVIEW BG presets or a custom colour, remembered (Edit settings). */
function BoardBg() {
  const { bg } = useEditSettings();
  return <PreviewBgPicker prefix="svg-edit" bg={bg} onBg={(next) => setEditSettings({ bg: next })} />;
}

function ToolButtons({ testid, st, onTool }: { testid: string; st: EditorState | null; onTool: (t: Tool) => void }) {
  const tool = st?.session.tool ?? "select";
  const btn = (t: Tool, glyph: string, title: string) => (
    <button type="button" className={`svg-btn tiny${tool === t ? " primary" : ""}`} data-testid={`${testid}-tool-${t}`}
      aria-pressed={tool === t} disabled={st === null} title={title} onClick={() => onTool(t)}>{glyph}</button>
  );
  return <>{btn("select", "⬉", "Select (V)")}{btn("draw", "✒", "Draw (P)")}</>;
}

/** Every key the edit mode has, each with a small icon and a short description. */
function Legend({ testid }: { testid: string }) {
  return (
    <div className="svg-edit-legend" data-testid={`${testid}-legend`}>
      {EDIT_HOTKEYS.map((h) => (
        <span key={h.keys} className="svg-edit-key"><span className="svg-edit-key-icon" aria-hidden="true">{h.icon}</span><kbd>{h.keys}</kbd><span>{h.text}</span></span>
      ))}
    </div>
  );
}

function LeaveDialog({ testid, onAnswer }: { testid: string; onAnswer: (c: "save" | "discard" | "stay") => void }) {
  return (
    <div className="svg-edit-leave" role="alertdialog" aria-label="Unsaved changes" data-testid={`${testid}-leave`}>
      <p>This artboard has unsaved changes.</p>
      <button type="button" className="svg-btn primary" data-testid={`${testid}-leave-save`} onClick={() => onAnswer("save")}>Save and go (Enter)</button>
      <button type="button" className="svg-btn danger" data-testid={`${testid}-leave-discard`} onClick={() => onAnswer("discard")}>Discard and go</button>
      <button type="button" className="svg-btn" data-testid={`${testid}-leave-stay`} onClick={() => onAnswer("stay")}>Stay (Esc)</button>
    </div>
  );
}
