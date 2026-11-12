// @vitest-environment node
// A card Getty took (its picture is there) but never marked "Ready to submit"
// because a field is empty — no Title, no Description (2026-11-12). Re-saving
// the grid or reloading the page cannot fill an empty field: the helper types
// the app's own metadata into that card's drawer again before each re-save and
// after a re-upload. A card that still does not validate is reported not ready
// (never uploaded), and the final reading travels with the readiness report so
// the batch's counts and accepted list are the gate's last word.

import { describe, expect, it } from "vitest";
import { finalizeBatch } from "../tools/bridge/gettyweb/contribute.mjs";
import { createWaitControl } from "../tools/bridge/gettyweb/waits.mjs";
import { acceptedOf, notReadyOf } from "../tools/bridge/gettyweb/session.mjs";
import { failurePayload } from "../tools/bridge/gettyweb/routes.mjs";
import type { CdpConnection } from "../tools/bridge/gettyweb/cdp.mjs";

const STAR = { title: "Star icon", description: "A five-point star.", keywords: ["star", "shape"] };
const MOON = { title: "Moon icon", description: "A crescent moon.", keywords: ["moon", "night"] };

class FakeConnection {
  steps: string[] = [];
  args: Array<{ step: string; arg: string }> = [];
  queue: Record<string, unknown[]>;
  fallback: Record<string, unknown>;
  constructor(queue: Record<string, unknown[]>, fallback: Record<string, unknown> = {}) {
    this.queue = queue;
    this.fallback = fallback;
  }
  send(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (method !== "Runtime.evaluate") return Promise.resolve({});
    const expression = String(params.expression);
    if (expression.includes("document.readyState")) return Promise.resolve({ result: { value: true } });
    const tail = expression.slice(expression.lastIndexOf("\n;return ("));
    const name = /\(function (\w+)/.exec(tail)?.[1] ?? "unknown";
    this.steps.push(name);
    this.args.push({ step: name, arg: tail });
    const queued = this.queue[name];
    const value = queued && queued.length > 0 ? queued.shift() : (this.fallback[name] ?? null);
    return Promise.resolve({ result: { value } });
  }
}

const connection = (queue: Record<string, unknown[]>, fallback: Record<string, unknown> = {}) =>
  new FakeConnection(queue, fallback) as unknown as CdpConnection & FakeConnection;

/** A page whose drawers always open and save; only the readings are scripted. */
const DRAWERS = {
  openFileMetadata: { opened: true, method: "card", label: "card" },
  metadataEditorReady: { ready: true, present: true },
  fillMetadataFields: { filled: { title: true, description: true, keywords: true }, present: { title: true, description: true, keywords: true } },
  saveMetadataEditor: { saved: true, label: "Save metadata" },
  selectAllContributions: { selected: 2, method: "select-all" },
  closeMetadataEditor: { closed: true, label: "Close" },
  completeBatch: { clicked: true, label: "Submit" },
  confirmCompletion: { confirmed: true, label: "Submit", dialog: true },
  readCompletionState: { submitted: true, canComplete: false },
  completionState: { present: true, enabled: true, label: "Submit" },
};

const FILES = [{ name: "star_01.jpg", metadata: STAR }, { name: "moon_01.jpg", metadata: MOON }];
const reading = (ready: string[], pending: string[]) => ({
  cardsPresent: true, namesSeen: [...ready, ...pending], uploaded: [...ready, ...pending], failed: [],
  readyToSubmit: ready, awaitingReady: pending,
});

/** The file each drawer fill was typed for, in order (the step's argument names it). */
function filledFor(cdp: FakeConnection): string[] {
  const out: string[] = [];
  let current = "";
  for (const { step, arg } of cdp.args) {
    if (step === "openFileMetadata") current = /"fileName":"([^"]+)"/.exec(arg)?.[1] ?? "";
    if (step === "fillMetadataFields") out.push(`${current}:${/"title":"([^"]+)"/.exec(arg)?.[1] ?? ""}`);
  }
  return out;
}

describe("a card that is uploaded but misses its metadata", () => {
  it("types the app's metadata into the not-ready card again before the re-save", async () => {
    const cdp = connection({
      readUploadState: [reading(["star_01.jpg"], ["moon_01.jpg"]), reading(["star_01.jpg", "moon_01.jpg"], [])],
    }, DRAWERS);
    const result = await finalizeBatch(cdp, "page-1", {
      files: FILES, complete: true, settleMs: 0, bulkSaveSettleMs: 0, pollMs: 1, readyRetryMs: 0,
      signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    // The walk filled both; the re-save step typed the moon's own text again — only the moon.
    expect(filledFor(cdp)).toEqual(["star_01.jpg:Star icon", "moon_01.jpg:Moon icon", "moon_01.jpg:Moon icon"]);
    const refill = cdp.steps.lastIndexOf("fillMetadataFields");
    expect(cdp.steps.slice(refill)).toContain("selectAllContributions"); // the grid save follows the refill
  });

  it("types the metadata again after a re-upload: the new card arrives empty", async () => {
    const stuck = reading(["star_01.jpg"], ["moon_01.jpg"]);
    const cdp = connection({
      readUploadState: [stuck, stuck, reading(["star_01.jpg", "moon_01.jpg"], [])],
    }, DRAWERS);
    const repaired: string[][] = [];
    const result = await finalizeBatch(cdp, "page-1", {
      files: FILES, complete: true, settleMs: 0, bulkSaveSettleMs: 0, pollMs: 1, readyRetryMs: 0, readyTimeoutMs: 60_000,
      readyResaves: 0, readyReloads: 0, readyRepairs: 1,
      repair: async (names: string[]) => { repaired.push(names); return { ok: true }; },
      signal: new AbortController().signal,
    });
    expect(repaired).toEqual([["moon_01"]]);
    expect(result.ok).toBe(true);
    // once by the walk, once more for the re-uploaded card — the star is never touched again
    expect(filledFor(cdp)).toEqual(["star_01.jpg:Star icon", "moon_01.jpg:Moon icon", "moon_01.jpg:Moon icon"]);
  });

  it("reports a card that stays not ready as not ready, with the gate's last reading", async () => {
    const cdp = connection({ readUploadState: [reading(["star_01.jpg"], ["moon_01.jpg"])] }, {
      ...DRAWERS, readUploadState: reading(["star_01.jpg"], ["moon_01.jpg"]),
    });
    const done = await finalizeBatch(cdp, "page-1", {
      files: FILES, complete: true, settleMs: 0, bulkSaveSettleMs: 0, pollMs: 1, readyRetryMs: 0, readyTimeoutMs: 50,
      readyResaves: 1, readyReloads: 0, readyRepairs: 0, signal: new AbortController().signal,
    });
    expect(done).toMatchObject({ ok: false, code: "timeout" });
    expect(done.report.readiness.state).toMatchObject({ readyToSubmit: ["star_01.jpg"] });
    // The attach-time reading never decides: only the star is accepted, the moon is named not ready.
    const attach = { state: reading([], ["star_01.jpg", "moon_01.jpg"]) };
    expect(acceptedOf(done, attach)).toEqual(["star_01.jpg"]);
    expect(notReadyOf(done)).toEqual(["moon_01"]);
    expect(cdp.steps).not.toContain("completeBatch");
  });
});

describe("the readiness deadline can be cut short", () => {
  it("offers a skip on the last wait and reports the not-ready card at once", async () => {
    const stuck = reading(["star_01.jpg"], ["moon_01.jpg"]);
    const cdp = connection({}, { ...DRAWERS, readUploadState: stuck });
    const waits = createWaitControl();
    const seen: Array<{ kind: string; skippable: boolean; skipLabel?: string }> = [];
    const started = Date.now();
    const done = await finalizeBatch(cdp, "page-1", {
      files: FILES, complete: true, settleMs: 0, bulkSaveSettleMs: 0, pollMs: 1, readyRetryMs: 0,
      readyTimeoutMs: 600_000, readyResaves: 0, readyReloads: 0, readyRepairs: 0, waits,
      onState: () => {
        const now = waits.current()?.wait;
        if (now?.kind === "ready-bound") { seen.push(now); waits.skip(); }
      },
      signal: new AbortController().signal,
    });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(seen[0]).toMatchObject({ kind: "ready-bound", skippable: true });
    expect(seen[0].skipLabel).toMatch(/skip/i);
    expect(done).toMatchObject({ ok: false, code: "timeout" });
    expect(notReadyOf(done)).toEqual(["moon_01"]);
  });
});

describe("a failed batch answer", () => {
  it("accepts only what the gate validated and names the not-ready files", () => {
    const payload = failurePayload({
      ok: false, code: "timeout", reason: "not ready",
      state: reading(["star_01.jpg"], ["moon_01.jpg"]), accepted: ["star_01.jpg"], notReady: ["moon_01"],
    }, {});
    expect(payload.accepted).toEqual(["star_01.jpg"]);
    expect(payload.notReady).toEqual(["moon_01"]);
  });

  it("keeps the thumbnails as the accepted list when no gate ran", () => {
    const payload = failurePayload({ ok: false, code: "timeout", reason: "slow", state: reading([], ["a.jpg"]) }, {});
    expect(payload.accepted).toEqual(["a.jpg"]);
    expect(payload.notReady).toEqual([]);
  });
});

describe("the finish step after a gate that left cards not ready", () => {
  it("waits only on the batch's validated files; the not-ready pair is dropped by stem", async () => {
    const { withoutStems } = await import("../tools/bridge/gettyweb/session.mjs");
    expect(withoutStems(["star_01.jpg", "star_01.eps", "moon_01.jpg", "moon_01.eps"], ["moon_01"]))
      .toEqual(["star_01.jpg", "star_01.eps"]);
    const same = ["a.jpg"];
    expect(withoutStems(same, [])).toBe(same);
  });
});
