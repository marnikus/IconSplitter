// SvgRow.tsx — one approved source per row (prompt §2/§16): checkbox, the AI
// thumbnail beside the SVG the row SHOWS — the user's chosen version when there
// is one, else the newest valid (I-54) — file identity + relative path,
// generation status, review status, version/tokens/cost (the SVG's, then the
// main AI image's — "SVG gen." / "Image gen.", 2026-10-19), the file actions
// (location, copy, code, history) and the row's own Generate / Approve /
// Decline. Every reader asks `shownVersion`, so the badge, the preview, Copy
// and the buttons can never disagree. Every code action stays disabled until a
// valid SVG exists, and the active row is visually distinct from a merely
// checked one.

import { memo } from "react";
import { useCheckedRow, type RegisterCheckedRow } from "../ui/checkedrows";
import { selectIntent, type SelectIntent } from "../lib/reviewselect";
import { isRowGestureClick } from "../ui/rowgesture";
import type { ReviewStatus } from "../lib/svgfile";
import { NO_COST } from "../lib/svgmodel";
import type { PreviewBackground } from "../lib/svgbackground";
import { costLabel, costNote, fmtTokens } from "../lib/svgusage";
import type { DirHandleLike } from "../lib/fs";
import { previewTargetOf, shownVersion, targetPathOf } from "./rowmodel";
import SvgThumbs from "./SvgThumbs";
import { PROBLEM_LABEL, type SvgSource } from "./sources";
import type { Placement, SvgOperation, SvgRow } from "./types";

export interface SvgRowActions {
  activeId: string | null;
  checked: string[];
  thumb: number;
  bg: PreviewBackground;
  /** Bumped by every pick and scan so the SVG preview re-reads its file. */
  rootToken: number;
  rootRef: { current: DirHandleLike | null };
  toggleCheck: (id: string) => void;
  selectRow: (id: string, intent: SelectIntent) => void;
  generate: (ids: string[], placement?: Placement, operation?: SvgOperation) => void;
  decide: (ids: string[], decision: ReviewStatus) => void;
  copyCode: (id: string, version: number) => void;
  showCode: (id: string, version: number) => void;
  showHistory: (id: string) => void;
  openLocation: (id: string) => void;
  /** AI source regeneration + the main-version switch (2026-10-16). */
  requestImageRegen: (ids: string[]) => void;
  setImageVersion: (id: string, version: number | null) => void;
  /** Sources whose AI image is being regenerated (2026-10-19). */
  imgRunning: string[];
  /** Shows a recorded SVG version — the Versions dialog's owner (2026-10-19 chips). */
  preferVersion: (id: string, version: number) => Promise<string | null>;
}

export type SvgRowPresentation = Omit<SvgRowActions, "checked" | "activeId">;

function SvgRowView({ row, a, active, register }: { row: SvgRow; a: SvgRowPresentation; active: boolean; register: RegisterCheckedRow }) {
  const ref = useCheckedRow(row.source.id, active, register);
  const id = row.source.id;
  return (
    <div ref={ref} role="listitem" data-testid={`svg-row-${id}`} tabIndex={active ? 0 : -1}
      aria-current={active ? "true" : undefined}
      className={`svg-row ${row.review}${active ? " active" : ""}${row.corrupt ? " corrupt" : ""}`}
      onClick={(e) => { if (isRowGestureClick(e)) a.selectRow(id, selectIntent(e)); }}
      onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === "Enter") { e.preventDefault(); a.selectRow(id, "replace"); } }}>
      <input type="checkbox" className="svg-check" data-testid={`svg-check-${id}`}
        aria-label={`Select ${row.source.name}`} onClick={(e) => e.stopPropagation()}
        onChange={() => a.toggleCheck(id)} />
      <RowContent row={row} a={a} />
    </div>
  );
}

export default memo(SvgRowView);

const RowContent = memo(function RowContent({ row, a }: { row: SvgRow; a: SvgRowPresentation }) {
  const id = row.source.id;
  return <>
      <SvgThumbs rootRef={a.rootRef} rootToken={a.rootToken} row={row} thumb={a.thumb} bg={a.bg}
        aiActions={{ running: a.imgRunning.includes(id), onMain: a.setImageVersion }}
        onPreferSvg={(sourceId, version) => void a.preferVersion(sourceId, version)} />
      <FileCell row={row} />
      <StatusCell row={row} />
      <ReviewCell row={row} />
      <UsageCell row={row} />
      <FileActions row={row} a={a} />
      <DecisionActions row={row} a={a} />
  </>;
});

/** Location / copy / code / history — all disabled until a version exists. */
function FileActions({ row, a }: { row: SvgRow; a: SvgRowPresentation }) {
  const id = row.source.id;
  // The version Copy hands out is the version the preview shows — one owner.
  const target = previewTargetOf(row);
  const version = target?.version ?? 0;
  const hasSvg = target !== null;
  const click = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <div className="svg-file-actions">
      <button type="button" className="svg-btn tiny" data-testid={`svg-location-${id}`}
        onClick={click(() => a.openLocation(id))}>Location</button>
      <button type="button" className="svg-btn tiny" data-testid={`svg-copy-${id}`} disabled={!hasSvg}
        onClick={click(() => a.copyCode(id, version))}>Copy</button>
      <button type="button" className="svg-btn tiny" data-testid={`svg-code-${id}`} disabled={!hasSvg}
        onClick={click(() => a.showCode(id, version))}>Code</button>
      <button type="button" className="svg-btn tiny" data-testid={`svg-history-${id}`} disabled={(row.meta?.versions.length ?? 0) === 0}
        onClick={click(() => a.showHistory(id))}>Versions</button>
    </div>
  );
}

/** The row's own generate/regenerate and its approve/decline/needs-review. */
function DecisionActions({ row, a }: { row: SvgRow; a: SvgRowPresentation }) {
  const id = row.source.id;
  const shown = shownVersion(row);
  const click = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <div className="svg-decision-actions">
      <button type="button" className="svg-btn tiny primary" data-testid={`svg-generate-${id}`}
        onClick={click(() => a.generate([id], "front", row.newest ? "regenerate" : "generate"))}>{row.newest ? "Regenerate" : "Generate"}</button>
      <button type="button" className="svg-btn tiny warning" data-testid={`svg-needs-review-${id}`} disabled={shown === null}
        title="Regenerated — new review" onClick={click(() => a.decide([id], "needs-review"))}>⚠</button>
      <button type="button" className="svg-btn tiny success" data-testid={`svg-approve-${id}`} disabled={shown === null}
        onClick={click(() => a.decide([id], "approved"))}>✓</button>
      <button type="button" className="svg-btn tiny danger" data-testid={`svg-decline-${id}`} disabled={shown === null}
        onClick={click(() => a.decide([id], "declined"))}>✕</button>
      <span className="svg-decision-sep" aria-hidden="true" />
      <ImageRegenButton id={id} running={a.imgRunning.includes(id)} onClick={click(() => a.requestImageRegen([id]))} />
    </div>
  );
}

/** The raster action under the vector ones; waits while this row's image is in flight (2026-10-19). */
function ImageRegenButton({ id, running, onClick }: { id: string; running: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button type="button" className="svg-btn tiny primary svg-img-regen" data-testid={`svg-row-image-regen-${id}`} disabled={running}
      title={running ? "This AI source image is being regenerated" : "Regenerate this AI source image via the image connection"}
      onClick={onClick}>{running ? "◍ Regenerating…" : "◍ Regenerate image"}</button>
  );
}

function FileCell({ row }: { row: SvgRow }) {
  const target = targetPathOf(row); // the ONE file a row is about (I-56)
  return (
    <div className="svg-file-main">
      <div className="svg-file-name" title={row.source.name}>{row.source.name}</div>
      <div className="svg-file-sub" data-testid={`svg-target-${row.source.id}`} title={target}>{target}</div>
      <ProblemLine row={row} />
      <div className={`svg-persist${row.corrupt ? " error" : ""}`} data-testid={`svg-persist-${row.source.id}`}
        title={pairFilePathOf(row.source)}>
        {row.corrupt ? "Pair file unreadable — SVGs on disk are kept" : row.meta ? "Pair file saved" : "Not generated yet"}
      </div>
    </div>
  );
}

/**
 * What the scan could not fully use, on the row itself (design D8): one status
 * line per reason, so a pair that needs attention is never just a count in a
 * banner and never silently absent from the list.
 */
function ProblemLine({ row }: { row: SvgRow }) {
  if (row.source.problems.length === 0) return null;
  return (
    <div className="svg-file-problem" data-testid={`svg-problem-${row.source.id}`}
      title={row.source.problems.map((p) => p.reason).join(" · ")}>
      {row.source.problems.map((p) => PROBLEM_LABEL[p.kind]).join(" · ")}
    </div>
  );
}

/** The pair file beside that SVG — the file the persist line reports. */
function pairFilePathOf(source: SvgSource): string {
  return source.metaPath;
}

/** "." for the root, so a row never shows a stray leading slash. */
/** The badge: "Next attempt" (grey) while the row waits in the queue, else its own status. */
function StatusCell({ row }: { row: SvgRow }) {
  const badge = row.queued && !row.running ? "queued" : row.status;
  return (
    <div className="svg-cell" data-testid={`svg-status-${row.source.id}`}>
      <span className={`svg-badge ${badge}`}>{badge === "queued" ? "Next attempt" : label(badge)}</span>
      {row.running && <span className="svg-progress-mini" aria-hidden="true"><span /></span>}
      {row.error !== null && <small className="svg-error" title={row.error}>{row.error}</small>}
    </div>
  );
}

/** The item's review status: ONE per row, so switching versions cannot change it. */
function ReviewCell({ row }: { row: SvgRow }) {
  return (
    <div className="svg-cell" data-testid={`svg-review-${row.source.id}`}>
      <span className={`svg-badge ${row.review}`}>{label(row.review)}</span>
    </div>
  );
}

/** Two halves: the shown SVG version's spend, then the main AI image's (2026-10-19). */
function UsageCell({ row }: { row: SvgRow }) {
  return (
    <div className="svg-cell svg-usage" data-testid={`svg-usage-${row.source.id}`}>
      <SvgSpend row={row} />
      <ImageSpend row={row} />
    </div>
  );
}

/** Version, tokens and cost of the shown SVG version — reported or Estimated. */
function SvgSpend({ row }: { row: SvgRow }) {
  const v = shownVersion(row);
  return (
    <div className="svg-usage-part" data-testid={`svg-usage-svg-${row.source.id}`}>
      <small className="svg-usage-head">SVG gen.</small>
      <strong>{v ? `v${v.version}` : "—"}</strong>
      <small>{v === null ? "no usage" : `${fmtTokens(v.usage.total)} tokens`}</small>
      <small title={v === null ? undefined : costNote(v.model, v.cost)}>{costLabel(v?.cost ?? NO_COST)}</small>
    </div>
  );
}

/** The same three lines for the AI image shown as main; absent until the pair has an image history. */
function ImageSpend({ row }: { row: SvgRow }) {
  const history = row.meta?.imageVersions ?? [];
  if (history.length === 0) return null;
  const main = history.find((v) => v.status === "done" && v.version === row.meta?.imagePreferred) ?? null;
  return (
    <div className="svg-usage-part image" data-testid={`svg-usage-img-${row.source.id}`}>
      <small className="svg-usage-head">Image gen.</small>
      <strong>{main ? `v${main.version}` : "original"}</strong>
      <small>{main === null ? "no usage" : `${fmtTokens(main.usage.total)} tokens`}</small>
      <small title={main === null ? undefined : costNote(main.model, main.cost)}>{costLabel(main?.cost ?? NO_COST)}</small>
    </div>
  );
}

function label(value: string): string {
  if (value === "needs-review") return "Regenerated — new review";
  return value.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
