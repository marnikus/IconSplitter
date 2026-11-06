// activity_bars.test.tsx — every long wait gets a bar (2026-11-03). Folder
// scans, list loading, imports, renders and saves are "activities": while one
// runs a bar says what the page is busy with, visible from every tab, and it
// closes ITSELF the moment the work is done (unlike a job bar, which stays for
// Review/✕). Each tab's busy text drives it, so new busy work gets a bar too;
// work that already has a job bar is not shown twice.
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activities, activityProgress, beginActivity, withActivity } from "../src/lib/activity";
import ActivityBars from "../src/ui/ActivityBars";
import { useBusyActivity } from "../src/ui/useBusyActivity";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string): HTMLElement | null => host.querySelector(sel);
const render = (node: React.ReactNode) => act(async () => { ui.render(<>{node}</>); });

beforeEach(() => {
  activities.clear();
  host = document.createElement("div");
  document.body.append(host);
  ui = createRoot(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  activities.clear();
});

describe("the activity store", () => {
  it("lists a running activity and forgets it the moment it ends", () => {
    const a = beginActivity("batch", "Scanning…");
    expect(activities.list().map((x) => x.label)).toEqual(["Scanning…"]);
    a.update("Scanning 3/10…");
    expect(activities.list()[0]).toMatchObject({ label: "Scanning 3/10…", done: 3, total: 10 });
    a.end();
    a.end(); // idempotent
    expect(activities.list()).toEqual([]);
  });

  it("reads counts from the label, else stays indeterminate", () => {
    expect(activityProgress("Rendering 4/8…")).toEqual({ done: 4, total: 8 });
    expect(activityProgress("Saving 2 of 5 files")).toEqual({ done: 2, total: 5 });
    expect(activityProgress("Scanning approved sources…")).toEqual({ done: null, total: null });
    expect(activityProgress("Saving 9/4")).toEqual({ done: 4, total: 4 }); // clamped, never > 100 %
  });

  it("withActivity shows a bar for the work and removes it after, also when the work throws", async () => {
    let seen = 0;
    await withActivity("svg", "Saving review decisions…", async () => { seen = activities.list().length; });
    expect(seen).toBe(1);
    expect(activities.list()).toEqual([]);
    await expect(withActivity("svg", "Saving…", async () => { throw new Error("disk"); })).rejects.toThrow("disk");
    expect(activities.list()).toEqual([]);
  });
});

function Tab({ start, skip }: { start: string | null; skip?: (busy: string) => boolean }) {
  const [busy, setBusy] = useState<string | null>(start);
  useBusyActivity("demo", busy, skip);
  return <button type="button" data-testid="next" onClick={() => setBusy((b) => (b === null ? "Saving 2/4…" : null))}>next</button>;
}

describe("a tab's busy text drives its bar", () => {
  it("indeterminate while scanning, counted when the text has counts, gone when busy clears", async () => {
    await render(<><Tab start="Scanning folders…" /><ActivityBars /></>);
    const header = q("[data-testid=activity-demo-progress-header]");
    expect(header).not.toBeNull();
    expect(q("[data-testid=activity-demo-progress-title]")?.textContent).toBe("Scanning folders…");
    expect(q("[data-testid=activity-demo-progress-track]")?.className).toContain("indeterminate");
    expect(q("[data-testid=activity-demo-progress-header] button")).toBeNull(); // nothing to Review or dismiss
    await act(async () => { q("[data-testid=next]")?.click(); }); // busy → null: closes itself
    expect(q("[data-testid=activity-demo-progress-header]")).toBeNull();
    await act(async () => { q("[data-testid=next]")?.click(); }); // busy → "Saving 2/4…"
    expect(q("[data-testid=activity-demo-progress-percent]")?.textContent).toBe("50%");
    expect(q("[data-testid=activity-demo-progress-completed]")?.textContent).toContain("2 completed / 4");
  });

  it("skips busy work that already has its own job bar", async () => {
    await render(<><Tab start="Regenerating AI sources: 2 left" skip={(b) => b.startsWith("Regenerating AI sources")} /><ActivityBars /></>);
    expect(q("[data-testid=activity-demo-progress-header]")).toBeNull();
  });

  it("ends the activity when the tab unmounts mid-work", async () => {
    await render(<Tab start="Scanning…" />);
    expect(activities.list()).toHaveLength(1);
    act(() => ui.unmount());
    ui = createRoot(host);
    expect(activities.list()).toEqual([]);
  });
});

describe("wired everywhere", () => {
  const src = (p: string) => readFileSync(p, "utf8");

  it("the shell shows the activity bars above every tab", () => {
    expect(src("src/ui/Workbench.tsx")).toContain("<ActivityBars />");
  });

  it.each([
    ["src/App.tsx", 'useBusyActivity("sheets"'],
    ["src/batch/BatchPanel.tsx", 'useBusyActivity("batch"'],
    ["src/selectionv2/SelectionV2Panel.tsx", 'useBusyActivity("selection"'],
    ["src/svg/SvgPanel.tsx", 'useBusyActivity("svg"'],
    ["src/upload/UploadPanel.tsx", 'useBusyActivity("upload"'],
    ["src/stockupload/StockUploadPanel.tsx", 'useBusyActivity("stock"'],
  ])("%s mirrors its busy text", (file, call) => {
    expect(src(file)).toContain(call);
  });

  it.each([
    ["src/svg/reviewact.ts", "withActivity("],
    ["src/selection/useSelection.ts", "withActivity("],
    ["src/batch/batchOps.ts", "withActivity("],
  ])("%s wraps its slow writes that set no busy text", (file, call) => {
    expect(src(file)).toContain(call);
  });
});
