// SvgImgConfirm.tsx — preview the precise image-edit payload before an
// explicit provider send. Multi-icon edits show one square sheet per request;
// the single-icon path keeps its existing prompt-and-reference behaviour.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { connectionLabel, resolveSize, type Connection } from "../lib/svgconnections";
import { imageEditLimit, MAX_EDIT_COUNT } from "../lib/svgimgbatch";
import type { DirHandleLike } from "../lib/fs";
import type { PromptPreset } from "../lib/promptpresets";
import { Select } from "../ui/fields";
import { loadImageEditPref, saveImageEditPref } from "./imgprefs";
import type { PreparedImageRun } from "./imgprepare";
import type { SvgRow } from "./types";
import { useImgPreview, type ImagePreview } from "./useImgPreview";

const EMPTY_ROWS: SvgRow[] = [];
const EMPTY_ROOT: { current: DirHandleLike | null } = { current: null };

export interface SvgImgConfirmProps {
  ids: readonly string[];
  rows?: SvgRow[];
  rootRef?: { current: DirHandleLike | null };
  conn: Connection;
  presets: readonly PromptPreset[];
  prompt: string;
  waitMs?: number;
  onPrompt: (prompt: string) => void;
  onPickPreset: (name: string) => void;
  onConfirm: (prepared: PreparedImageRun | null) => void;
  onCancel: () => void;
}

export default function SvgImgConfirm(p: SvgImgConfirmProps) {
  useEscape(p.onCancel);
  const state = useImageConfirmState(p);
  return (
    <div className="svg-backdrop" data-testid="svg-img-confirm">
      <section className="svg-modal img-regen" role="dialog" aria-modal="true" aria-label="Confirm AI source regeneration">
        <header className="svg-modal-head">
          <h2>Regenerate AI source image</h2>
          <button type="button" className="svg-btn" data-testid="svg-img-cancel" onClick={p.onCancel}>Cancel</button>
        </header>
        <ConfirmBody p={p} state={state} />
      </section>
    </div>
  );
}

interface ConfirmState {
  countText: string; count: number; limit: number; warning: boolean; multi: boolean;
  problem: string | null; preview: ImagePreview; ready: boolean;
  page: number; setPage: (page: number) => void; chooseCount: (text: string) => void;
}

function useImageConfirmState(p: SvgImgConfirmProps): ConfirmState {
  const [stored] = useState(loadImageEditPref);
  const [countText, setCountText] = useState(String(stored.count));
  const [page, setPage] = useState(0);
  const side = squareSide(p.conn);
  const count = Number(countText);
  const multi = p.ids.length > 1 && count > 1;
  const limit = imageEditLimit(side);
  const problem = countProblem(countText, p.ids.length, limit, side);
  const preview = useImgPreview({ rootRef: p.rootRef ?? EMPTY_ROOT, rows: p.rows ?? EMPTY_ROWS, ids: p.ids,
    conn: p.conn, prompt: p.prompt, count, active: shouldPreview(multi, problem, p.prompt) });
  const chooseCount = (text: string) => rememberCount(text, setCountText, setPage);
  return { countText, count, limit, warning: stored.warning, multi, problem, preview,
    ready: canConfirm(p.prompt, problem, multi, preview), page, setPage, chooseCount };
}

function countProblem(text: string, selected: number, limit: number, side: number): string | null {
  const count = Number(text);
  if (text.trim() === "" || !Number.isInteger(count) || count < 1 || count > MAX_EDIT_COUNT) return `Choose a whole number from 1 to ${MAX_EDIT_COUNT}`;
  if (selected > 1 && count > 1 && count > limit) return `Choose an explicit square output size and at most ${limit} icons per request at ${side || "this"} px`;
  return null;
}

function shouldPreview(multi: boolean, problem: string | null, prompt: string): boolean {
  return multi && problem === null && prompt.trim() !== "";
}

function canConfirm(prompt: string, problem: string | null, multi: boolean, preview: ImagePreview): boolean {
  if (problem !== null || prompt.trim() === "") return false;
  return !multi || preview.run !== null;
}

function rememberCount(text: string, setText: (text: string) => void, setPage: (page: number) => void): void {
  setText(text);
  setPage(0);
  if (text !== "" && Number.isInteger(Number(text))) saveImageEditPref(Number(text));
}

function ConfirmBody({ p, state: s }: { p: SvgImgConfirmProps; state: ConfirmState }) {
  return <div className="svg-modal-body svg-img-body">
    <ConfirmHead ids={p.ids.length} conn={p.conn} waitMs={p.waitMs} multi={s.multi} />
    <CountControl text={s.countText} limit={s.limit} warning={s.warning} problem={s.problem} onChange={s.chooseCount} />
    <p className="svg-note" data-testid="svg-img-caps">Image edit — {s.multi
      ? `each request sends one previewed square containing up to ${s.count} current main AI images to ${p.conn.name}. Review returned cells before saving their individual new versions. Nothing is overwritten.`
      : "each request sends this prompt together with that source’s current main AI image as the reference. One request per source; each result is saved as a new version and becomes the main AI source, which the SVG generation then uses. Nothing is overwritten."}</p>
    <PreviewPanel preview={s.preview} page={s.page} setPage={s.setPage} multi={s.multi} />
    <PromptBlock presets={p.presets} prompt={p.prompt} onPickPreset={p.onPickPreset} onPrompt={p.onPrompt} />
    <div className="svg-modal-actions">
      <button type="button" className="svg-btn primary" data-testid="svg-img-generate" disabled={!s.ready}
        title={!s.ready ? s.problem ?? "Write a prompt and wait for its exact reference preview" : undefined}
        onClick={() => p.onConfirm(s.multi ? s.preview.run : null)}>Generate now</button>
    </div>
  </div>;
}

function squareSide(conn: Connection): number {
  const size = resolveSize(conn.image);
  const m = /^(\d+)x\1$/.exec(size);
  return m === null ? 0 : Number(m[1]);
}

function CountControl(p: { text: string; limit: number; warning: boolean; problem: string | null; onChange: (s: string) => void }) {
  return (
    <div className="svg-img-count-control">
      <label className="svg-field"><span className="svg-label">Icons per image-edit request</span>
        <input className="svg-input" type="number" min="1" max={Math.max(1, p.limit)} step="1" data-testid="svg-img-per-request"
          value={p.text} onChange={(e) => p.onChange(e.target.value)} /></label>
      {p.warning && <p role="status">Saved image-edit count was unreadable; using 4.</p>}
      {p.problem && <p role="alert" data-testid="svg-img-count-error">{p.problem}</p>}
    </div>
  );
}

function PreviewPanel(p: { preview: ImagePreview; page: number; setPage: (n: number) => void; multi: boolean }) {
  if (!p.multi) return null;
  if (p.preview.error !== null) return <p role="alert" data-testid="svg-img-preview-error">{p.preview.error}</p>;
  if (p.preview.run === null) return <p role="status" data-testid="svg-img-preview-loading">Preparing exact image references…</p>;
  const run = p.preview.run;
  const index = Math.min(p.page, run.groups.length - 1);
  const group = run.groups[index];
  return (
    <div className="svg-img-composite" data-testid="svg-img-composite">
      <p>Request {index + 1} of {run.groups.length} · {group.plan.cols}×{group.plan.cols} grid · {group.plan.empty.length} empty</p>
      {run.skipped.length > 0 && <p role="alert" data-testid="svg-img-skipped">{run.skipped.map((item) => `${item.ids.length} not sent: ${item.reason}`).join("; ")}</p>}
      <img src={p.preview.urls[index]} alt={`Reference sheet for request ${index + 1}`} />
      <ol data-testid="svg-img-manifest">{group.plan.cells.map((cell) => <li key={cell.id}>{cell.position} — {cell.name}</li>)}</ol>
      {run.groups.length > 1 && <div className="svg-modal-actions">
        <button type="button" className="svg-btn" data-testid="svg-img-prev" disabled={index === 0} onClick={() => p.setPage(index - 1)}>Previous</button>
        <button type="button" className="svg-btn" data-testid="svg-img-next" disabled={index === run.groups.length - 1} onClick={() => p.setPage(index + 1)}>Next</button>
      </div>}
      <p>Full prompt sent with this sheet</p><pre className="svg-img-effective" data-testid="svg-img-effective-prompt">{group.prompt}</pre>
    </div>
  );
}

function ConfirmHead(p: { ids: number; conn: Connection; waitMs?: number; multi: boolean }) {
  return <div className="svg-img-meta">
    <label className="svg-field svg-img-count"><span className="svg-label">Selected images</span><span className="svg-input flat" data-testid="svg-img-count">{p.ids}</span></label>
    <label className="svg-field"><span className="svg-label">Provider / model</span><span className="svg-input flat" data-testid="svg-img-provider" title={p.conn.model}>{p.conn.name} · {connectionLabel(p.conn)}</span></label>
    {p.waitMs !== undefined && <label className="svg-field"><span className="svg-label">Wait limit</span><span className="svg-input flat" data-testid="svg-img-wait">{Math.round(p.waitMs / 1000)} s per {p.multi ? "request" : "image"}</span></label>}
  </div>;
}

/** The shared prompt + its preset dropdown: preset on its own row, the prompt below at full width. */
function PromptBlock({ presets, prompt, onPickPreset, onPrompt }: {
  presets: readonly PromptPreset[]; prompt: string;
  onPickPreset: (name: string) => void; onPrompt: (prompt: string) => void;
}) {
  const box = useRef<HTMLTextAreaElement | null>(null);
  useFitToText(box, prompt);
  return (
    <div className="svg-img-prompt-block">
      <Select label="Prompt preset" testid="svg-img-preset" value=""
        options={[["", "— pick a saved prompt —"], ...presets.map((x) => [x.name, x.name] as [string, string])]}
        onChange={onPickPreset} />
      <label className="svg-field">
        <span className="svg-label">Prompt</span>
        <textarea ref={box} className="svg-input svg-img-prompt" data-testid="svg-img-prompt" rows={3} aria-label="Image prompt"
          value={prompt} onChange={(e) => onPrompt(e.target.value)} />
      </label>
    </div>
  );
}

function useFitToText(ref: React.RefObject<HTMLTextAreaElement | null>, text: string): void {
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (el === null) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ref, text]);
}

function useEscape(onCancel: () => void): void {
  const latest = useRef(onCancel);
  latest.current = onCancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") latest.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
