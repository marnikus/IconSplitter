import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sameRowData, useRowPresentation } from "../src/ui/rowpresentation";
import type { PreviewEntry } from "../src/batch/useBatchPreview";
import ScanTable from "../src/batch/ScanTable";
import { loadThumb, noop, selectionLoad } from "./helpers/selectionload";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

it('stable event identities forward to current committed callbacks and retain return values', async () => {
  type Props = { label: string; action: () => Promise<number>; loader: () => Promise<string> };
  let shown: Props | undefined;
  function Harness(props: Props) {
    const p = useRowPresentation(props, ["loader"]);
    useLayoutEffect(() => { shown = p; });
    return <button onClick={() => void p.action()}>{p.label}</button>;
  }
  const old = vi.fn(async () => 1);
  const fresh = vi.fn(async () => 2);
  const loader = async () => "first";
  act(() => root.render(<Harness label="first" action={old} loader={loader} />));
  const before = shown!;
  act(() => root.render(<Harness label="first" action={fresh} loader={loader} />));
  expect(shown).toBe(before);
  expect(await before.action()).toBe(2);
  expect(old).not.toHaveBeenCalled();
  expect(fresh).toHaveBeenCalledTimes(1);
  act(() => root.render(<Harness label="changed" action={fresh} loader={loader} />));
  expect(shown).not.toBe(before);
  expect(shown!.action).toBe(before.action);
  expect(host.textContent).toBe("changed");
  const beforeLoader = shown!;
  const newLoader = async () => "second";
  act(() => root.render(<Harness label="changed" action={fresh} loader={newLoader} />));
  expect(shown).not.toBe(beforeLoader);
  expect(shown!.loader).toBe(newLoader);
});

it('compares every data field, additions/removals, and only the explicitly ignored mirror', () => {
  expect(sameRowData({ selected: false, size: 2 }, { selected: true, size: 2 }, "selected")).toBe(true);
  expect(sameRowData({ selected: false, size: 2 }, { selected: true, size: 3 }, "selected")).toBe(false);
  expect(sameRowData({ size: 2 }, { size: 2, status: "changed" })).toBe(false);
  expect(sameRowData({ size: 2 }, { other: 2 })).toBe(false);
  expect(sameRowData({ size: 2, status: "changed" }, { size: 2 })).toBe(false);
  expect(sameRowData({ value: NaN }, { value: NaN })).toBe(true);
});

it('Batch still repaints file identity/status/mtime and preview freshness when data changes', async () => {
  const data = selectionLoad(1);
  const path = data.batch[0].relPath;
  const previews = new Map<string, PreviewEntry>([[path, { relPath: path, count: 4, thumbs: [], boxes: [], status: "done" }]]);
  const render = (rows = data.batch, rowStale = () => false) => root.render(<ScanTable rows={rows} rowStale={rowStale} previews={previews} thumb={64}
    activeId={null} toggle={noop} selectRow={noop} selectActive={noop} copyPath={noop} thumbFor={loadThumb} decide={noop} />);
  await act(async () => { render(); });
  expect(host.textContent).toContain(data.batch[0].name);
  expect(host.querySelector(`[data-testid="batch-preview-count-${path}"]`)!.getAttribute("data-stale")).toBe("false");
  await act(async () => { render([{ ...data.batch[0], selected: true, name: "renamed_AI.png", status: "changed", mtime: 1800000001000 }]); });
  expect(host.textContent).toContain("renamed_AI.png");
  expect(host.querySelector('[data-testid^="batch-status-"]')!.textContent).toContain("changed");
  expect(host.querySelector('[role="listitem"]')!.classList.contains("selected")).toBe(true);
  await act(async () => { render(data.batch, () => true); });
  expect(host.querySelector(`[data-testid="batch-preview-count-${path}"]`)!.getAttribute("data-stale")).toBe("true");
});
