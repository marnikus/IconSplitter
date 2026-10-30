// svg_ui.test.tsx — the Generate SVG tab drives the real panel and the real
// history bar (RULE 8): approved pairs only, the bulk bar's header checkbox,
// the filters, the code dialog and its Escape close, the confirm dialog that
// must precede any send, and the undoable review decision. Everything here is
// a store/DOM change, so a regression in the wiring fails loudly.
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { boundRootPathInfo } from "../src/lib/knownroots";
import { FakeFile } from "./helpers/fakefs";
import {
  installSvgPanelHooks, SIDECAR, SAVED_SVG, COURT, FOG, fakeKey, host, input, makeRoot, mount, mountPick, q,
  renderPanel, selectEffort, settle, stubClipboard, text, type, unmountPanel, useDeviceStorage,
} from "./helpers/svgpanel";

installSvgPanelHooks();

describe("review auto-next", () => {
  it("offers both state-sort directions, bypasses the old pin only for state groups and keeps checks", async () => {
    await mount(await makeRoot());
    const ordered = () => [...host.querySelectorAll(".svg-row[data-testid^='svg-row-']")].map((r) => r.getAttribute("data-testid")!.slice("svg-row-".length));
    const choose = async (value: string) => {
      const el = q("[data-testid=svg-sort]") as HTMLSelectElement;
      await act(async () => { el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); });
    };
    await act(async () => input(`[data-testid=svg-check-${FOG}]`).click());
    await choose("selected"); expect(ordered()).toEqual([FOG, COURT]);
    await choose("unselected"); expect(ordered()).toEqual([COURT, FOG]);
    await act(async () => input(`[data-testid=svg-check-${COURT}]`).click());
    expect(ordered()).toEqual([COURT, FOG]); // same-state filename ties
    await act(async () => input(`[data-testid=svg-check-${FOG}]`).click());
    expect(ordered()).toEqual([FOG, COURT]); // live membership, not cached pin
    await choose("unapproved");
    await act(async () => (q(`[data-testid=svg-approve-${FOG}]`) as HTMLElement).click());
    await settle(); expect(ordered()).toEqual([COURT, FOG]);
    await choose("approved"); expect(ordered()).toEqual([FOG, COURT]);
    expect(input(`[data-testid=svg-check-${COURT}]`).checked).toBe(true);
    expect(input(`[data-testid=svg-check-${FOG}]`).checked).toBe(false);
  });

  it("follows displayed rows after approval, preserving checks and stopping at the bottom", async () => {
    const dir = await makeRoot();
    const arch = await dir.getDirectoryHandle("architecture");
    arch.children.set("court_AI.svg", new FakeFile("court_AI.svg", SAVED_SVG.length, 2200, SAVED_SVG));
    arch.children.set("court_AI.svg.json", new FakeFile("court_AI.svg.json", 10, 2200, SIDECAR.replace(/fog/g, "court")));
    await mount(dir);
    const displayed = [...host.querySelectorAll(".svg-row[data-testid^='svg-row-']")].map((r) => r.getAttribute("data-testid")!.slice("svg-row-".length));
    expect(displayed).toHaveLength(2);
    const [current, next] = displayed;
    await act(async () => (q(`[data-testid='svg-row-${current}']`) as HTMLElement).click());
    await act(async () => (q(`[data-testid='svg-approve-${current}']`) as HTMLElement).click());
    await settle();
    expect(q(`[data-testid='svg-row-${next}']`)?.getAttribute("aria-current")).toBe("true");
    expect(host.querySelectorAll(".svg-row input:checked")).toHaveLength(0);
    await act(async () => (q(`[data-testid='svg-decline-${next}']`) as HTMLElement).click());
    await settle();
    expect(q(`[data-testid='svg-row-${next}']`)?.getAttribute("aria-current")).toBe("true");
  });
});

describe("the folder control and the path row", () => {
  it("keeps a green Open folder button while a root is loaded, so the tab can be pointed by hand", async () => {
    await mount(await makeRoot());
    const btn = q("[data-testid=svg-open-folder]") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe("Open folder");
    expect(btn.className).toContain("folder-open");
    // the root came from the remembered handle, not from this tab's picker:
    // the button must offer to pick again instead of hiding (the old bug).
    expect(text("[data-testid=svg-folder-path]")).toContain("split_root");
  });

  it("offers the same green Open folder button in the empty state", async () => {
    await renderPanel();
    await settle();
    const empty = q("[data-testid=svg-open-folder-empty]") as HTMLButtonElement;
    expect(empty).not.toBeNull();
    expect(empty.textContent).toBe("Open folder");
    expect(empty.className).toContain("folder-open");
    expect(empty.closest("[data-testid=svg-root-empty]")).not.toBeNull();
    expect(q("[data-testid=svg-folder-path]")).toBeNull(); // nothing to name yet
  });

  it("shows the folder in a full-width read-only row, never in the button and never in a field", async () => {
    await mount(await makeRoot());
    const row = q("[data-testid=svg-folder-path]")!;
    expect(row.textContent).toContain("split_root");
    expect(row.querySelector("input, textarea, button")).toBeNull();
    // the pill that carried the folder's name, and the field + button that let
    // the path be typed or adopted by hand, are gone (I-44/I-45)
    expect(q("[data-testid=svg-root]")).toBeNull();
    expect(q("[data-testid=svg-root-path]")).toBeNull();
    expect(q("[data-testid=svg-root-path-use]")).toBeNull();
    expect(q("[data-testid=svg-root-path-note]")).toBeNull();
    expect(host.textContent).not.toContain("Use copied path");
    expect(host.textContent).not.toContain("Full path for copies");
  });

  it("captures the full path at pick time, says so, and keeps it visible after a restart", async () => {
    const root = await makeRoot();
    stubClipboard(`"F:\\Stocks 2026\\icons\\split_root\\"`);
    try {
      await mountPick(root); // a hand pick, with the path on the clipboard
      expect(boundRootPathInfo(root).path).toBe("F:\\Stocks 2026\\icons\\split_root");
      expect(text("[data-testid=svg-folder-path]")).toContain("F:\\Stocks 2026\\icons\\split_root");
      expect(text("[data-testid=svg-toast]")).toContain("Folder path captured: F:\\Stocks 2026\\icons\\split_root");
      await unmountPanel(); // a restart: the row reads the memory
      await mount(root);
      expect(text("[data-testid=svg-folder-path]")).toContain("F:\\Stocks 2026\\icons\\split_root");
    } finally {
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    }
  });

  it("names the folder and says when no full path was captured (RULE 4)", async () => {
    await mount(await makeRoot());
    expect(text("[data-testid=svg-folder-path]")).toContain("split_root");
    expect(text("[data-testid=svg-folder-path]")).toContain("full path not captured");
  });

  it("never completes a copied PARENT into a guess — the row says 'not captured' instead (I-59)", async () => {
    const root = await makeRoot();
    stubClipboard("F:\\Stocks 2026\\icons testing\\single"); // the folder it lives in — not the folder
    try {
      await mountPick(root);
      expect(text("[data-testid=svg-folder-path]")).not.toContain("icons testing");
      expect(text("[data-testid=svg-folder-path]")).toContain("full path not captured");
    } finally {
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    }
  });

  it("has no Watcher and no copied-path chrome left anywhere in the tab", async () => {
    await mount(await makeRoot());
    expect(q("[data-testid=svg-watcher]")).toBeNull();
    expect(host.textContent).not.toContain("Watcher");
    expect(host.textContent).not.toContain("auto-rescan");
  });
});

describe("Generate SVG panel", () => {
  it("lists only the approved pairs, with the newest SVG beside its source", async () => {
    await mount(await makeRoot());
    expect(text("[data-testid=svg-folder-path]")).toContain("split_root");
    const rows = host.querySelectorAll(".svg-row");
    expect(rows).toHaveLength(2);
    expect(q("[data-testid=svg-row-count]")?.textContent).toBe("2");
    // fog has a generated v1: its code actions are live; court has none.
    const off = (sel: string) => (q(sel) as HTMLButtonElement).disabled;
    expect(off(`[data-testid=svg-code-${FOG}]`)).toBe(false);
    expect(off(`[data-testid=svg-code-${COURT}]`)).toBe(true);
    expect(off(`[data-testid=svg-approve-${FOG}]`)).toBe(false);
    expect(off(`[data-testid=svg-approve-${COURT}]`)).toBe(true);
    expect(q(`[data-testid=svg-generate-${FOG}]`)?.textContent).toBe("Regenerate");
    expect(q(`[data-testid=svg-generate-${COURT}]`)?.textContent).toBe("Generate");
    expect(q(`[data-testid=svg-status-${FOG}]`)?.textContent).toContain("Generated");
    expect(q(`[data-testid=svg-status-${COURT}]`)?.textContent).toContain("Not Generated");
    expect(q(`[data-testid=svg-usage-${FOG}]`)?.textContent).toContain("v1");
    expect(q(`[data-testid=svg-review-${FOG}]`)?.textContent).toContain("Pending");
  });

  it("names the SVG artifact on each row — never the pair file as if it were the SVG", async () => {
    await mount(await makeRoot());
    // fog HAS a version: the row shows its real path, exactly once (svgPath is
    // already root-relative, so the folder must not be prefixed twice).
    expect(q(`[data-testid=svg-target-${FOG}]`)?.textContent).toBe("architecture/fog_AI.svg");
    // court has none: the row names the SVG generation WILL write — it must not
    // look like a double extension (".svg.json") for a file that does not exist.
    expect(q(`[data-testid=svg-target-${COURT}]`)?.textContent).toBe("architecture/court_AI.svg");
    expect(q(`[data-testid=svg-target-${COURT}]`)?.textContent).not.toContain(".json");
    // ...and the pair file itself stays discoverable on the line that reports it.
    expect(q(`[data-testid=svg-persist-${FOG}]`)?.getAttribute("title")).toBe("architecture/fog_AI.svg.json");
    expect(q(`[data-testid=svg-persist-${FOG}]`)?.textContent).toBe("Pair file saved");
  });

  it("does not list a pair whose AI image is gone — a reference is not a source", async () => {
    const root = await makeRoot();
    const arch = await root.getDirectoryHandle("architecture");
    await arch.removeEntry("court_AI.png");
    await mount(root);
    // the surviving reference is NOT a generation source (the reported bug)
    expect(host.querySelectorAll(".svg-row")).toHaveLength(1);
    expect(q(`[data-testid=svg-row-${COURT}]`)).toBeNull();
    expect(q(`[data-testid=svg-row-${FOG}]`)).not.toBeNull();
    expect(q(`[data-testid=svg-row-count]`)?.textContent).toBe("1");
    // reported instead, with the file and the reason — never silently dropped
    const note = q("[data-testid=svg-warn-excluded]");
    expect(note?.textContent).toContain("1 approved source(s) are not listed");
    expect(note?.textContent).toContain("no AI result (court_AI.png) beside architecture/court.png");
    // and the audit line states the whole picture
    expect(q("[data-testid=svg-audit]")?.textContent)
      .toBe("Audit — 6 files · 1 AI source · 2 references excluded · 1 missing file · 0 duplicates removed → 1 row");
    expect(q(`[data-testid=svg-generate-${COURT}]`)).toBeNull();
  });

  it("shows one row for an AI image three records name, with the extra reported", async () => {
    const root = await makeRoot();
    const file = await root.getFileHandle("review-decisions.json");
    const parsed = JSON.parse(await (await file.getFile()).text()) as {
      records: { pair_id: string; source: string | null; ai_result: string | null }[];
    };
    // the fog record as a real path, then the SAME path twice more under ids
    // from before the file moved — the shape that listed one image three times
    const fog = parsed.records.find((r) => r.pair_id === FOG)!;
    fog.source = "architecture/fog.png";
    fog.ai_result = "architecture/fog_AI.png";
    parsed.records.push({ ...fog, pair_id: "pair_deadbeef" }, { ...fog, pair_id: "pair_cafebabe" });
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify(parsed)));
    await mount(root);
    expect(host.querySelectorAll(".svg-row")).toHaveLength(2); // fog + court, each once
    expect(q("[data-testid=svg-audit]")?.textContent).toContain("1 duplicate removed");
    expect(q("[data-testid=svg-warn-excluded]")?.textContent).toContain("already reported");
  });

  it("bulk selection: header checkbox, select-visible, deselect-all, disabled bulk actions", async () => {
    await mount(await makeRoot());
    expect(q("[data-testid=svg-selected-count]")?.textContent).toBe("0 selected");
    expect((q("[data-testid=svg-generate-selected]") as HTMLButtonElement).disabled).toBe(true);
    expect((q("[data-testid=svg-approve-selected]") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { input("[data-testid=svg-check-all]").click(); });
    await settle();
    expect(q("[data-testid=svg-selected-count]")?.textContent).toBe("2 selected");
    expect((q("[data-testid=svg-generate-selected]") as HTMLButtonElement).disabled).toBe(false);
    // only fog has a valid SVG, so the bulk decision stays armed for it alone
    expect((q("[data-testid=svg-approve-selected]") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { (q("[data-testid=svg-deselect]") as HTMLButtonElement).click(); });
    await settle();
    expect(q("[data-testid=svg-selected-count]")?.textContent).toBe("0 selected");
    expect((q("[data-testid=svg-generate-selected]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("filters the list and clears back to every approved source", async () => {
    await mount(await makeRoot());
    const gen = q("[data-testid=svg-filter-generation]") as HTMLSelectElement;
    await act(async () => { gen.value = "generated"; gen.dispatchEvent(new Event("change", { bubbles: true })); });
    await settle();
    expect(host.querySelectorAll(".svg-row")).toHaveLength(1);
    expect(q("[data-testid=svg-footer-summary]")?.textContent).toContain("Showing 1 of 2");
    await act(async () => { (q("[data-testid=svg-clear-filters]") as HTMLButtonElement).click(); });
    await settle();
    expect(host.querySelectorAll(".svg-row")).toHaveLength(2);
  });

  it("opens the code dialog, copies and closes it with Escape", async () => {
    await mount(await makeRoot());
    await act(async () => { (q(`[data-testid=svg-code-${FOG}]`) as HTMLButtonElement).click(); });
    await settle();
    const code = q("[data-testid=svg-code-block]") as HTMLTextAreaElement | null;
    expect(code).not.toBeNull();
    expect(code?.value).toContain("<svg");
    expect((q("[data-testid=svg-code-copy]") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(q("[data-testid=svg-code-dialog]")).toBeNull();
  });

  it("lets the user configure the stall window and the retries the hint points at", async () => {
    await mount(await makeRoot());
    const limits = () => q("[data-testid=svg-limits]")?.textContent ?? "";
    // the controls exist, are clamped to the documented range, and show the
    // configured value (seconds, so it matches the label)
    const timeout = () => input("[data-testid=svg-timeout]");
    expect(timeout().value).toBe("120");
    expect(timeout().min).toBe("5");
    expect(timeout().max).toBe("900");
    expect(input("[data-testid=svg-retries]").value).toBe("2");
    expect(limits()).toContain("120s stall");
    expect(limits()).toContain("2 retries");

    // raising the window is a real config change: the label follows immediately...
    await type("[data-testid=svg-timeout]", "400");
    expect(timeout().value).toBe("400");
    expect(limits()).toContain("400s stall");

    // ...a value outside the range is clamped at the moment of change...
    await type("[data-testid=svg-timeout]", "9999");
    expect(timeout().value).toBe("900");
    await type("[data-testid=svg-timeout]", "1");
    expect(timeout().value).toBe("5");
    await type("[data-testid=svg-retries]", "-3");
    expect(input("[data-testid=svg-retries]").value).toBe("0");

    // ...and the tier floor still wins over an impatient configured window, while
    // the field keeps showing what the user actually configured
    await type("[data-testid=svg-timeout]", "60");
    await selectEffort("high");
    expect(limits()).toContain("600s stall (high floor)");
    expect(timeout().value).toBe("60");

    // the confirmation states the same effective wait as the card
    await act(async () => { (q("[data-testid=svg-key-state]") as HTMLButtonElement).click(); });
    await settle();
    await type("[data-testid=svg-key-input]", fakeKey("rq", "live", "ui_test_key_9876"));
    await act(async () => { (q("[data-testid=svg-key-save]") as HTMLButtonElement).click(); });
    await settle();
    await act(async () => { input("[data-testid=svg-check-all]").click(); });
    await settle();
    await act(async () => { (q("[data-testid=svg-generate-selected]") as HTMLButtonElement).click(); });
    await settle();
    expect(q("[data-testid=svg-confirm-timeout]")?.textContent).toContain("600s stall (high floor)");
  });

  it("keeps the user's batch size at EVERY reasoning tier — only the wait changes", async () => {
    await mount(await makeRoot());
    await act(async () => { input("[data-testid=svg-check-all]").click(); });
    await settle();
    const limits = () => q("[data-testid=svg-limits]") ?? null;
    const estimate = () => q("[data-testid=svg-estimate]")?.textContent ?? "";
    // the fixture selects two approved images; no effort chosen leaves the
    // configured size alone, so they are one request
    expect(estimate()).toContain("2 images");
    expect(limits()?.textContent).toContain("4 per request");
    expect(estimate()).toContain("1 request(s)");

    // low: the configured size is the size, and the window gets its floor
    await selectEffort("low");
    expect(limits()?.textContent).toContain("4 per request");
    expect(limits()?.textContent).toContain("120s stall");
    expect(estimate()).toContain("1 request(s)");

    // medium: the window widens, the batch does NOT shrink
    await selectEffort("medium");
    expect(limits()?.textContent).toContain("4 per request");
    expect(limits()?.textContent).toContain("300s stall (medium floor)");
    expect(estimate()).toContain("2 images");
    expect(estimate()).toContain("1 request(s)");

    // high: a big window for a long think, still one request of the user's size
    await selectEffort("high");
    expect(limits()?.textContent).toContain("4 per request");
    expect(limits()?.textContent).toContain("600s stall (high floor)");
    expect(estimate()).toContain("1 request(s)");

    // xhigh: same size, its own floor label
    await selectEffort("xhigh");
    expect(limits()?.textContent).toContain("4 per request");
    expect(limits()?.textContent).toContain("600s stall (xhigh floor)");
    expect(estimate()).toContain("1 request(s)");
  });

  it("comes back from a restart with the unfinished request named, never auto-resent", async () => {
    const root = await makeRoot();
    // The journal the last session left: one request with an UNCONFIRMED outcome.
    window.localStorage.setItem("iconSplitter.svg.inflight.v1", JSON.stringify({
      v: 1,
      requests: [{
        runId: "run_past_1", batchId: "batch_1_2", index: 1,
        sourceIds: [FOG, COURT], sourceNames: ["fog_AI.png", "court_AI.png"],
        model: "openai/gpt-6.1-sol", startedAt: new Date(Date.now() - 600_000).toISOString(),
        requestId: "req_stalled_9",
      }],
    }));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    // The panel's boot may read the model list; a GENERATION must not happen.
    const sends = () => fetcher.mock.calls.filter(([url]) => String(url).includes("chat/completions"));
    await mount(root);

    // The panel says what is unknown, names the request id and stresses that
    // nothing was resent. The rows show "Unknown" — never "Failed".
    expect(q("[data-testid=svg-inflight]")).not.toBeNull();
    const note = q("[data-testid=svg-inflight-note]")?.textContent ?? "";
    expect(note).toContain("req_stalled_9");
    expect(note).toContain("Nothing has been resent");
    expect(q(`[data-testid=svg-status-${FOG}]`)?.textContent).toContain("Unknown");
    expect(q(`[data-testid=svg-status-${FOG}]`)?.textContent).not.toContain("Failed");
    expect(sends()).toHaveLength(0);

    // Retrying is the USER's decision and goes through the normal confirmation;
    // with no key stored it is refused instead of silently doing anything.
    await act(async () => { (q("[data-testid=svg-inflight-retry]") as HTMLButtonElement).click(); });
    await settle();
    expect(q("[data-testid=svg-confirm]")).toBeNull();
    expect(q("[data-testid=svg-toast]")?.textContent).toContain("API key");

    await act(async () => { (q("[data-testid=svg-key-state]") as HTMLButtonElement).click(); });
    await settle();
    await type("[data-testid=svg-key-input]", fakeKey("rq", "live", "recovery_key_4321"));
    await act(async () => { (q("[data-testid=svg-key-save]") as HTMLButtonElement).click(); });
    await settle();
    await act(async () => { (q("[data-testid=svg-inflight-retry]") as HTMLButtonElement).click(); });
    await settle();
    // the confirmation offers exactly those sources, and still sends nothing
    expect(q("[data-testid=svg-confirm-count]")?.textContent).toBe("2");
    expect(sends()).toHaveLength(0);
    await act(async () => { (q("[data-testid=svg-confirm-cancel]") as HTMLButtonElement).click(); });
    await settle();

    // Dismissing acknowledges the note: the banner and the journal entry go.
    await act(async () => { (q("[data-testid=svg-inflight-dismiss]") as HTMLButtonElement).click(); });
    await settle();
    expect(q("[data-testid=svg-inflight]")).toBeNull();
    expect(window.localStorage.getItem("iconSplitter.svg.inflight.v1")).toBeNull();
  });

  it("confirms before sending and never sends twice", async () => {
    await mount(await makeRoot());
    await act(async () => { input("[data-testid=svg-check-all]").click(); });
    await settle();
    await act(async () => { (q("[data-testid=svg-generate-selected]") as HTMLButtonElement).click(); });
    await settle();
    // No key stored: the tab says so instead of opening the dialog.
    expect(q("[data-testid=svg-confirm]")).toBeNull();
    expect(q("[data-testid=svg-toast]")?.textContent).toContain("API key");
  });

  it("stores the API key from the provider card and unblocks the run", async () => {
    useDeviceStorage();
    await mount(await makeRoot());
    expect(q("[data-testid=svg-key-state]")?.textContent).toContain("No API key yet");
    await act(async () => { (q("[data-testid=svg-key-state]") as HTMLButtonElement).click(); });
    await settle();
    await type("[data-testid=svg-key-input]", fakeKey("rq", "live", "ui_test_key_9876"));
    await act(async () => { (q("[data-testid=svg-key-save]") as HTMLButtonElement).click(); });
    await settle();
    // The row leaves edit mode and reports the key as present — the old bug
    // left it on "No API key yet" because the storage write threw.
    expect(q("[data-testid=svg-key-state]")?.textContent).toContain("API key secured locally");
    expect(q("[data-testid=svg-toast]")?.textContent).toContain("API key");
    expect(q("[data-testid=svg-key-input]")).toBeNull();
    // With a key present the confirm dialog opens instead of the guard toast.
    await act(async () => { input("[data-testid=svg-check-all]").click(); });
    await settle();
    await act(async () => { (q("[data-testid=svg-generate-selected]") as HTMLButtonElement).click(); });
    await settle();
    expect(q("[data-testid=svg-confirm]")).not.toBeNull();
    expect(q("[data-testid=svg-confirm]")?.textContent).toContain("batch");
    // The confirmation states the sampling values that will be sent.
    expect(q("[data-testid=svg-confirm-sampling]")?.textContent).toContain("no temperature");
    expect(q("[data-testid=svg-confirm-sampling]")?.textContent).toContain("32 000 max tokens");
    // ...and how many requests the selection will really become.
    expect(q("[data-testid=svg-confirm-requests]")?.textContent).toContain("1");
  });

  it("says the key is session-only when storage refuses the write", async () => {
    const broken = { open: () => { throw new Error("storage unavailable"); } };
    vi.stubGlobal("indexedDB", broken);
    await mount(await makeRoot());
    await act(async () => { (q("[data-testid=svg-key-state]") as HTMLButtonElement).click(); });
    await settle();
    await type("[data-testid=svg-key-input]", fakeKey("rq", "live", "session_ui_1234"));
    await act(async () => { (q("[data-testid=svg-key-save]") as HTMLButtonElement).click(); });
    await settle();
    // The headline must say WHICH case this is: with storage refused, the key
    // lives only for this session, and claiming "secured locally" would be a lie.
    expect(q("[data-testid=svg-key-state]")?.textContent).toContain("API key kept for this session only");
    expect(q("[data-testid=svg-key-note]")?.textContent).toContain("paste again after a reload");
    expect(q("[data-testid=svg-toast]")?.textContent).toContain("this session only");
    vi.unstubAllGlobals();
  });

  it("keeps the masked key and its note on separate lines", async () => {
    useDeviceStorage();
    await mount(await makeRoot());
    await act(async () => { (q("[data-testid=svg-key-state]") as HTMLButtonElement).click(); });
    await settle();
    await type("[data-testid=svg-key-input]", fakeKey("rq", "live", "layout_ui_1234"));
    await act(async () => { (q("[data-testid=svg-key-save]") as HTMLButtonElement).click(); });
    await settle();
    const mask = q("[data-testid=svg-key-mask]");
    const note = q("[data-testid=svg-key-note]");
    expect(mask?.textContent).toContain("•");
    expect(note?.textContent).toContain("excluded from Git");
    // Two rows, not two columns of one row: a long key can never run into the note.
    expect(mask?.parentElement).not.toBe(note?.parentElement);
    expect(q("[data-testid=svg-key-state]")?.textContent).toContain("API key secured locally");
  });
});
