// Dev-only real-list benchmark. Never imported by the app's production entry.
import { useLayoutEffect, useMemo, useState } from "react";
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
import { setChecked, toggleChecked } from "../../src/lib/reviewselect";
import { selectionLoad, loadRoot, loadThumb, noop } from "../../tests/helpers/selectionload";
import "../../src/index.css";

type Tab = "batch" | "selectionV2" | "generateSvg" | "upload";
const emptyIds: string[] = [];
const emptySettings = {};
const noopAsync = async () => null;
const rootRef = { current: loadRoot() };
const bg = { preset: "white", custom: "#ffffff" } as const;
export const samples: { commitMs: number; frameMs: number; checked: number }[] = [];
let started = 0;

export function Fixture({ tab, count, settings = DEFAULT_UPLOAD_SETTINGS }: { tab: Tab; count: number; settings?: UploadSettings }) {
  const data = useMemo(() => selectionLoad(count), [count]);
  const [checked, set] = useState<string[]>([]);
  const ids = tab === "batch" ? data.batch.map((r) => r.relPath) : data.ids;
  const select = (on: boolean) => { started = performance.now(); set((before) => setChecked(before, ids, on)); };
  const toggle = (id: string) => set((before) => toggleChecked(before, id));
  useLayoutEffect(() => {
    if (!started) return;
    const at = started;
    const commitMs = performance.now() - at;
    started = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => samples.push({ commitMs, frameMs: performance.now() - at, checked: checked.length })));
  }, [checked]);
  const checkedSet = new Set(checked);
  const a = { activeId: null, checked, thumb: 64, bg, rootToken: 1, rootRef, toggleCheck: toggle, selectRow: noop,
    generate: noop, decide: noop, copyCode: noop, showCode: noop, showHistory: noop, openLocation: noop,
    requestImageRegen: noop, setImageVersion: noop, imgRunning: emptyIds, preferVersion: noopAsync } satisfies SvgRowActions;
  const u = { activeId: null, checked, thumb: 64, bg, rootToken: 1, rootRef, defaults: settings,
    overrides: emptySettings, applied: emptySettings, toggleCheck: toggle, selectRow: noop, openSettings: noop, openLocation: noop,
    requestMetadata: noop, acceptMetadata: noop, editMetadata: noop, copyMeta: noop, exportRow: noop,
    rowBadges: EMPTY_ROW_BADGES, toggleRowBadge: noop } satisfies UploadRowActions;
  return <div><button id="select-all" onClick={() => select(true)}>Select all</button><button id="clear-all" onClick={() => select(false)}>Deselect all</button>
    <output id="selected-count">{checked.length}</output>
    {tab === "batch" && <ScanTable rows={data.batch.map((r) => ({ ...r, selected: checkedSet.has(r.relPath) }))} thumb={64}
      activeId={null} toggle={toggle} selectRow={noop} selectActive={noop} copyPath={noop} thumbFor={loadThumb} decide={noop} />}
    {tab === "selectionV2" && <ReviewList rows={data.pairs} total={count} activeId={null} checked={checked} thumb={64} autoNext={false}
      thumbFor={loadThumb} onRowClick={noop} setAutoNext={noop} toggleCheck={toggle} decide={noop} openSide={noop} clearFilters={noop} />}
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
