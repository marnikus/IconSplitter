// Dev-only real-list benchmark. Never imported by the app's production entry.
//
// 2026-10-26: the fixture now drives the gestures users actually report (a row
// click, an Up/Down move, ONE checkbox, select-all/deselect-all) and records the
// real history path — `selectionPayloads` + `pushEntry` + `serializeTimeline` —
// inside the measured window, so the cost the old benchmark could not see is in
// the sample. It still mounts list components directly; the full-shell /
// localStorage numbers live in the app tests (Step 0 notes in the plan doc).
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import ReviewList from "../../src/selectionv2/ReviewList";
import SvgList from "../../src/svg/SvgList";
import UploadList from "../../src/upload/UploadList";
import ScanTable from "../../src/batch/ScanTable";
import type { SvgRowActions } from "../../src/svg/SvgRow";
import type { UploadRowActions } from "../../src/upload/UploadRow";
import type { SvgGenApi } from "../../src/svg/useSvgGen";
import type { UploadApi } from "../../src/upload/useUpload";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../../src/lib/upload/settings";
import { EMPTY_ROW_BADGES } from "../../src/lib/upload/rowbadge";
import { nextVisibleId, setChecked, toggleChecked } from "../../src/lib/reviewselect";
import { selectionPayloads, touchedIds } from "../../src/lib/selectiondelta";
import {
  emptyTimeline, pushEntry, serializeTimeline, HISTORY_VERSION, type HistoryEntry, type Timeline,
} from "../../src/lib/history";
import { selectionLoad, loadRoot, loadThumb, noop } from "../../tests/helpers/selectionload";
import "../../src/index.css";

type Tab = "batch" | "selectionV2" | "generateSvg" | "upload";
/** What the runner drives: the two bulk gestures plus the three reported ones. */
export type BenchKind = "select-all" | "deselect-all" | "click" | "arrow" | "toggle";
const emptyIds: string[] = [];
const emptySettings = {};
const noopAsync = async () => null;
const rootRef = { current: loadRoot() };
const bg = { preset: "white", custom: "#ffffff" } as const;

export const samples: { commitMs: number; frameMs: number; checked: number; kind: BenchKind; historyBytes: number }[] = [];
let seq = 0;
const timing = { started: 0, kind: "select-all" as BenchKind };

export function Fixture({ tab, count, settings = DEFAULT_UPLOAD_SETTINGS }: { tab: Tab; count: number; settings?: UploadSettings }) {
  const data = useMemo(() => selectionLoad(count), [count]);
  const [checked, set] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const timeline = useRef<Timeline>(emptyTimeline());
  const bytes = useRef(0);
  const ids = tab === "batch" ? data.batch.map((r) => r.relPath) : data.ids;
  /** The real entry: compact diff + capped id list, exactly as the panels write it. */
  const record = (label: string, before: string[], after: string[], activeBefore: string | null, activeAfter: string | null) => {
    const payload = selectionPayloads(
      { checked: before, active: activeBefore, anchor: activeBefore },
      { checked: after, active: activeAfter, anchor: activeAfter },
    );
    seq += 1;
    const entry: HistoryEntry = {
      id: `h${seq}`, type: "checked", label, at: new Date(1700000000000).toISOString(),
      origin: tab, ids: touchedIds(before, after), before: payload.before, after: payload.after, v: HISTORY_VERSION,
    };
    timeline.current = pushEntry(timeline.current, entry);
    bytes.current = serializeTimeline(timeline.current).length;
  };
  const measure = (kind: BenchKind, run: () => void) => {
    timing.started = performance.now();
    timing.kind = kind;
    run();
  };
  const select = (on: boolean) => measure(on ? "select-all" : "deselect-all", () => {
    set((before) => {
      const next = setChecked(before, ids, on);
      record(on ? "Select visible" : "Deselect all", before, next, activeId, activeId);
      return next;
    });
  });
  const toggle = (id: string) => measure("toggle", () => {
    set((before) => {
      const next = toggleChecked(before, id);
      record("Toggle row", before, next, activeId, activeId);
      return next;
    });
  });
  const click = (id: string) => measure("click", () => {
    record("Select row", checked, checked, activeId, id);
    setActiveId(id);
  });
  const arrow = (step: 1 | -1) => measure("arrow", () => {
    const next = nextVisibleId(ids, activeId, step);
    if (next === null) return;
    record("Move active row", checked, checked, activeId, next);
    setActiveId(next);
  });
  useLayoutEffect(() => {
    if (!timing.started) return;
    const at = timing.started;
    const kind = timing.kind;
    const commitMs = performance.now() - at;
    timing.started = 0;
    const historyBytes = bytes.current;
    requestAnimationFrame(() => requestAnimationFrame(() => samples.push({ commitMs, frameMs: performance.now() - at, checked: checked.length, kind, historyBytes })));
  }, [checked, activeId]);
  const checkedSet = new Set(checked);
  const a = { activeId, checked, thumb: 64, bg, rootToken: 1, rootRef, toggleCheck: toggle, selectRow: (id: string) => click(id),
    generate: noop, decide: noop, copyCode: noop, showCode: noop, showHistory: noop, openLocation: noop,
    requestImageRegen: noop, setImageVersion: noop, imgRunning: emptyIds, preferVersion: noopAsync } satisfies SvgRowActions;
  const u = { activeId, checked, thumb: 64, bg, rootToken: 1, rootRef, defaults: settings,
    overrides: emptySettings, applied: emptySettings, toggleCheck: toggle, selectRow: (id: string) => click(id), openSettings: noop, openLocation: noop,
    requestMetadata: noop, acceptMetadata: noop, editMetadata: noop, copyMeta: noop, exportRow: noop,
    rowBadges: EMPTY_ROW_BADGES, toggleRowBadge: noop } satisfies UploadRowActions;
  const first = ids[0] ?? "";
  const last = ids[ids.length - 1] ?? "";
  return <div>
    <button id="select-all" onClick={() => select(true)}>Select all</button><button id="clear-all" onClick={() => select(false)}>Deselect all</button>
    <button id="click-first" onClick={() => first && click(first)}>Click first row</button>
    <button id="click-last" onClick={() => last && click(last)}>Click last row</button>
    <button id="toggle-first" onClick={() => first && toggle(first)}>Toggle first checkbox</button>
    <button id="arrow-down" onClick={() => arrow(1)}>Arrow down</button>
    <button id="arrow-up" onClick={() => arrow(-1)}>Arrow up</button>
    <output id="selected-count">{checked.length}</output>
    <output id="active-id">{activeId ?? ""}</output>
    <output id="history-bytes">{bytes.current}</output>
    {tab === "batch" && <ScanTable rows={data.batch.map((r) => ({ ...r, selected: checkedSet.has(r.relPath) }))} thumb={64}
      activeId={activeId} toggle={toggle} selectRow={(id: string) => click(id)} selectActive={noop} copyPath={noop} thumbFor={loadThumb} decide={noop} />}
    {tab === "selectionV2" && <ReviewList rows={data.pairs} total={count} activeId={activeId} checked={checked} thumb={64} autoNext={false}
      thumbFor={loadThumb} onRowClick={(id: string) => click(id)} setAutoNext={noop} toggleCheck={toggle} decide={noop} openSide={noop} clearFilters={noop} />}
    {tab === "generateSvg" && <SvgList g={{ rows: data.svg, visible: data.svg } as SvgGenApi} actions={a} />}
    {tab === "upload" && <UploadList g={{ rows: data.upload, visible: data.upload } as UploadApi} actions={u} />}
  </div>;
}

if (typeof window !== "undefined" && document.getElementById("selection-benchmark")) {
  const root = createRoot(document.getElementById("selection-benchmark")!);
  Object.assign(window, { selectionBench: {
    mount: (tab: Tab, count: number) => { samples.length = 0; flushSync(() => root.render(<Fixture key={`${tab}-${count}`} tab={tab} count={count} />)); },
    samples,
  } });
}
