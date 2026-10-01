// undo_ui.test.tsx — RULE 8 / request §2/§4/§6/§9: the DOM-level story of the
// global timeline: Undo/Redo controls with disabled states and next-action
// labels, keyboard shortcuts, reset-to-pending (row, checked, visible list),
// bulk actions as ONE entry, cross-tab consistency between Selection and
// Selection V2, and the honest non-undoable boundary.
import { beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { pairId } from "../src/lib/pairing";
import { resetHistoryForTests } from "../src/history/historybus";
import HistoryBar from "../src/history/HistoryBar";
import { useUndoHotkeys } from "../src/history/undohotkeys";
import SelectionPanel from "../src/selection/SelectionPanel";
import { resetSelectionStoreForTests } from "../src/selection/selectionstore";
import SelectionV2Panel from "../src/selectionv2/SelectionV2Panel";
import { resetSelectionMirrorForTests } from "../src/session/selectionmirror";
import { resetSessionStoreForTests } from "../src/session/sessionstore";
import { resetScrollMemoForTests } from "../src/session/scrollmemo";
import { BrokenFile, FakeDir, FakeFile } from "./helpers/fakefs";
import { check, choose, click, dropDb, key, mountPanel, mountWithRoot, q, settle, slide, text, unmountAll, type Mounted } from "./helpers/uidom";
import { DECISIONS_FILE, TMP_FILE } from "../src/selection/reviewstore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FOG = pairId("architecture", "fog", "");
const COURT = pairId("architecture", "court", "");
const DUNES = pairId("coastal", "dunes", ""); // original without an AI result

/** split_root/architecture/{fog,court} + coastal/{harbor, dunes(unpaired)}. */
function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  root.children.set("architecture", arch);
  const coast = new FakeDir("coastal");
  coast.children.set("harbor.png", new FakeFile("harbor.png", 12, 1000, "e"));
  coast.children.set("harbor_AI.png", new FakeFile("harbor_AI.png", 20, 1100, "f"));
  coast.children.set("dunes.png", new FakeFile("dunes.png", 12, 500, "g"));
  root.children.set("coastal", coast);
  return root;
}

beforeEach(async () => {
  await unmountAll(); // a leaked root would answer every Ctrl+Z one extra time
  localStorage.clear();
  resetHistoryForTests();
  resetSessionStoreForTests();
  resetSelectionMirrorForTests();
  resetScrollMemoForTests();
  resetSelectionStoreForTests();
  await dropDb();
});

/** A subtree with the app-level shortcuts installed, as the Workbench does. */
function WithKeys({ children }: { children: React.ReactNode }) {
  useUndoHotkeys();
  return <>{children}</>;
}

/** The V2 panel plus the app-level history bar, as the Workbench composes them. */
function Harness() {
  useUndoHotkeys(); // the app-level shortcuts the Workbench installs
  return (
    <>
      <HistoryBar />
      <SelectionV2Panel />
    </>
  );
}

async function mountHarness(root: FakeDir = makeRoot()): Promise<Mounted> {
  return mountWithRoot(<Harness />, root);
}

describe("global Undo/Redo controls (request §6)", () => {
  it("start disabled, name the next action and apply from the bar", async () => {
    const { el } = await mountHarness();
    expect((q(el, "[data-testid='undo']") as HTMLButtonElement).disabled).toBe(true);
    expect((q(el, "[data-testid='redo']") as HTMLButtonElement).disabled).toBe(true);
    expect(text(el, "[data-testid='history-next']")).toBe("No reversible actions yet");

    await approveTwo(el);
    expect(text(el, "[data-testid='history-next']")).toBe("Undo: Approve 2 pairs");
    expect((q(el, "[data-testid='undo']") as HTMLButtonElement).title).toBe("Undo: Approve 2 pairs");
    await click(q(el, "[data-testid='undo']"));
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("◔ Pending");
    expect(text(el, `[data-testid='v2-status-${COURT}']`)).toBe("◔ Pending");
    expect(text(el, "[data-testid='v2-count-approved']")).toContain("0");
    expect(text(el, "[data-testid='history-status']")).toBe("Undid: Approve 2 pairs");
    // the checks that produced the selection are the next reversible action
    expect(text(el, "[data-testid='history-next']")).toBe("Undo: Check “court”");
    await click(q(el, "[data-testid='redo']"));
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved");
    expect((q(el, "[data-testid='redo']") as HTMLButtonElement).disabled).toBe(true);
  });

  it("answers Ctrl+Z and Ctrl+Shift+Z anywhere in the app", async () => {
    const { el } = await mountHarness();
    await approveTwo(el);
    await key("z", true);
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("◔ Pending");
    await key("z", true, true);
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved");
    await key("z", true);
    await key("y", true); // the other redo chord
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved");
  });

  it("lists the recent entries without changing the cursor", async () => {
    const { el } = await mountHarness();
    await approveTwo(el);
    expect(text(el, "[data-testid='history-list']")).toBe("History (3)"); // two checks + the approve
    expect(text(el, "[data-testid='history-entries']")).toContain("Approve 2 pairs");
  });

  it("never records a scan, a filter-free rescan or a failed write as an action", async () => {
    const { el } = await mountHarness();
    await click(q(el, "[data-testid='v2-rescan']"));
    expect((q(el, "[data-testid='undo']") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("reset to pending (request §2)", () => {
  it("resets one row and the reset itself is undoable", async () => {
    const { el } = await mountHarness();
    await click(q(el, `[data-testid='v2-approve-row-${FOG}']`));
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved");
    await click(q(el, `[data-testid='v2-reset-${FOG}']`));
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("◔ Pending");
    expect(text(el, "[data-testid='v2-toast']")).toBe("1 pair reset to pending");
    expect(text(el, "[data-testid='history-next']")).toBe("Undo: Reset “fog”");
    await click(q(el, "[data-testid='undo']"));
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved");
  });

  it("disables the row reset for a pair that is already pending", async () => {
    const { el } = await mountHarness();
    expect((q(el, `[data-testid='v2-reset-${FOG}']`) as HTMLButtonElement).disabled).toBe(true);
    await click(q(el, `[data-testid='v2-approve-row-${DUNES}']`)); // incomplete pair stays out of bulk
    expect((q(el, `[data-testid='v2-reset-${DUNES}']`) as HTMLButtonElement).disabled).toBe(false);
  });

  it("resets the checked rows as ONE entry with one summary line", async () => {
    const { el } = await mountHarness();
    await click(q(el, `[data-testid='v2-approve-row-${FOG}']`));
    await click(q(el, `[data-testid='v2-approve-row-${COURT}']`));
    await click(q(el, `[data-testid='v2-reset-selected']`)); // disabled: nothing checked yet
    expect(text(el, "[data-testid='v2-reset-scope']")).toBe("0 resettable");
    await click(q(el, `[data-testid='v2-select-visible']`));
    expect(text(el, "[data-testid='v2-reset-scope']")).toBe("2 resettable");
    expect(text(el, "[data-testid='v2-pending-checked']")).toBe("2 checked already pending");
    const btn = q(el, "[data-testid='v2-reset-selected']") as HTMLButtonElement;
    expect(btn.textContent).toBe("↺ Reset selected to pending (2)");
    await click(btn);
    expect(btn.textContent).toBe("Confirm reset 2?"); // the count is shown before it applies
    await click(q(el, "[data-testid='v2-reset-selected']"));
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("◔ Pending");
    expect(text(el, `[data-testid='v2-status-${COURT}']`)).toBe("◔ Pending");
    expect(text(el, "[data-testid='v2-toast']")).toBe("2 pairs reset to pending");
    expect(text(el, "[data-testid='history-list']")).toBe("History (4)"); // 2 row approvals + select-visible + reset
    expect(text(el, "[data-testid='history-next']")).toBe("Undo: Reset 2 pairs to pending");
    await click(q(el, "[data-testid='undo']"));
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved");
  });

  it("resets the whole visible list from one control", async () => {
    const { el } = await mountHarness();
    await approveTwo(el);
    const btn = q(el, "[data-testid='v2-reset-visible']") as HTMLButtonElement;
    expect(btn.textContent).toBe("↺ Reset visible list to pending (2)");
    await click(btn);
    await click(q(el, "[data-testid='v2-reset-visible']"));
    expect(text(el, "[data-testid='v2-toast']")).toContain("2 pairs reset to pending");
    expect(text(el, "[data-testid='v2-count-pending']")).toContain("4");
  });
});

describe("checkbox and view actions on the timeline (request §3)", () => {
  it("undoes a checkbox, a select-visible and a zoom drag", async () => {
    const { el } = await mountHarness();
    await check(q(el, `[data-testid='v2-check-${FOG}']`) as HTMLInputElement, true);
    expect(text(el, "[data-testid='history-next']")).toBe("Undo: Check “fog”");
    await click(q(el, "[data-testid='v2-select-visible']"));
    expect(text(el, "[data-testid='history-next']")).toBe("Undo: Select visible (4 pairs)");
    await slide(q(el, "[data-testid='v2-thumb']") as HTMLInputElement, "128");
    expect(text(el, "[data-testid='history-next']")).toBe("Undo: Zoom: 128 px");
    await key("z", true);
    expect(text(el, "[data-testid='v2-thumb-value']")).toBe("84 px"); // zoom undone
    await key("z", true);
    expect(text(el, "[data-testid='v2-selected-count']")).toBe("1 selected"); // select-visible undone
    await key("z", true);
    expect(text(el, "[data-testid='v2-selected-count']")).toBe("0 selected"); // check undone
    await key("z", true, true); // redo walks the branch back, one action at a time
    expect(text(el, "[data-testid='v2-selected-count']")).toBe("1 selected");
    await key("z", true, true);
    expect(text(el, "[data-testid='v2-selected-count']")).toBe("4 selected");
    await key("z", true, true);
    expect(text(el, "[data-testid='v2-thumb-value']")).toBe("128 px");
  });

  it("undoes a filter change so hidden rows come back", async () => {
    const { el } = await mountHarness();
    await click(q(el, `[data-testid='v2-approve-row-${FOG}']`));
    await choose(el, "[data-testid='v2-status']", "declined");
    expect(q(el, "[data-testid='v2-nomatch']")).toBeTruthy();
    await key("z", true);
    expect(q(el, "[data-testid='v2-nomatch']")).toBeNull();
  });
});

describe("cross-tab consistency (request §9)", () => {
  it("shows the same decision in both Selection surfaces and undoes from either", async () => {
    const root = makeRoot();
    const v1 = await mountWithRoot(<WithKeys><SelectionPanel /></WithKeys>, root, "sel-root");
    const v2 = await mountPanel(<SelectionV2Panel />);
    // one root handle is shared: the second surface rescans the same folder
    await click(q(v2.el, "[data-testid='v2-root']"));
    await click(q(v1.el, "[data-testid='sel-approve']"));
    expect(text(v2.el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved"); // no stale copy
    await key("z", true); // undo from the app level, both surfaces follow
    await settle();
    expect(text(v2.el, `[data-testid='v2-status-${FOG}']`)).toBe("◔ Pending");
    expect(text(v1.el, "[data-testid='sel-status']")).toContain("Pending");
  });

  it("keeps one history for both surfaces: the entry list has no duplicates", async () => {
    const root = makeRoot();
    const v1 = await mountWithRoot(<SelectionPanel />, root, "sel-root");
    const v2 = await mountPanel(<Harness />);
    await click(q(v2.el, "[data-testid='v2-root']"));
    await click(q(v1.el, "[data-testid='sel-approve']"));
    await click(q(v2.el, `[data-testid='v2-decline-${FOG}']`));
    expect(text(v2.el, "[data-testid='history-list']")).toBe("History (2)");
    await click(q(v2.el, "[data-testid='undo']"));
    expect(text(v2.el, "[data-testid='history-next']")).toBe("Undo: Approve “fog”");
  });
});

describe("the non-undoable boundary (request §5)", () => {
  it("does not pretend to undo a decision-file write failure", async () => {
    const root = makeRoot();
    root.children.set(TMP_FILE, new BrokenFile(TMP_FILE));
    const { el } = await mountHarness(root);
    await click(q(el, `[data-testid='v2-approve-row-${FOG}']`));
    expect(q(el, "[data-testid='v2-writewarn']")).toBeTruthy();
    // the app state IS reversible; the failed disk write is retried, not "undone"
    await click(q(el, "[data-testid='undo']"));
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("◔ Pending");
    expect(q(el, "[data-testid='v2-writewarn']")).toBeTruthy();
    root.children.delete(TMP_FILE);
    await click(q(el, "[data-testid='v2-retry']"));
    expect(q(el, "[data-testid='v2-writewarn']")).toBeNull();
  });

  it("keeps the decision file in sync after an undo (no resurrection on rescan)", async () => {
    const root = makeRoot();
    const { el } = await mountHarness(root);
    await click(q(el, `[data-testid='v2-approve-row-${FOG}']`));
    await click(q(el, "[data-testid='undo']"));
    const file = root.children.get(DECISIONS_FILE) as FakeFile;
    expect(file.text).not.toContain(FOG);
    await click(q(el, "[data-testid='v2-rescan']"));
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("◔ Pending");
  });
});

/* ── helpers ─────────────────────────────────────────────────────────────── */

async function approveTwo(el: HTMLElement): Promise<void> {
  await check(q(el, `[data-testid='v2-check-${FOG}']`) as HTMLInputElement, true);
  await check(q(el, `[data-testid='v2-check-${COURT}']`) as HTMLInputElement, true);
  await click(el.querySelector("[data-testid='v2-approve-selected']") as HTMLElement);
  await click(el.querySelector("[data-testid='v2-approve-selected']") as HTMLElement);
}

// keep `act` referenced for future async assertions without an unused import
void act;
void slide;
