// previewsession.test.ts — TDD for the session as a whole (design D3/D6/D9, I-67/I-68).
// Logic-level (no React, no DOM): the queue, the cache and the per-row states are
// wired together exactly as the tab wires them, with injected work and injected
// URL functions — so "what a row says", "what the caps say" and "when a URL dies"
// are assertions rather than consequences of a render.

import { describe, expect, it } from "vitest";
import { createPreviewSession } from "../src/lib/previewsession";
import type { PreviewDeps, StripResult } from "../src/batch/preview/previewdeps";
import type { RowResult } from "../src/lib/previewqueue";
import type { SplitSettings } from "../src/lib/presets";

const SPLIT: SplitSettings = { padding: 6, size: 0, transparent: false, mergeFrac: null };

type Answer = (relPath: string) => RowResult<StripResult>;

function deps(answer: Answer): PreviewDeps {
  return { pause: async () => undefined, work: async ({ relPath }) => answer(relPath) };
}

function ok(count: number, bytes = 40): RowResult<StripResult> {
  const blobs = count > 0 ? [new Blob([new Uint8Array(bytes)])] : [];
  return { kind: "ok", value: { blobs, count, usedFrac: 0.01 } };
}

function harness(answer: Answer) {
  const revoked: string[] = [];
  let made = 0;
  const session = createPreviewSession(deps(answer), {
    createUrl: () => `blob:s-${++made}`,
    revokeUrl: (u) => revoked.push(u),
  });
  return { session, revoked };
}

const spec = (rows: string[], near = () => false) => ({
  rows: rows.map((relPath) => ({ relPath })),
  root: null,
  split: SPLIT,
  near,
});

describe("previewsession — one session, one generation, honest rows", () => {
  it("gives every finished row its count, its strip and its state", async () => {
    const { session } = harness((rel) => (rel === "b.png" ? { kind: "empty" } : ok(4)));
    session.start(spec(["a.png", "b.png", "c.png"]));
    await session.settled();
    expect(session.states.get("a.png").state).toBe("ready");
    expect(session.states.get("a.png").message).toBe("4 icons");
    expect(session.states.get("a.png").urls).toHaveLength(1);
    expect(session.states.get("b.png").state).toBe("empty");
    expect(session.states.get("b.png").message).toBe("No icons at this merge distance");
    expect(session.progress()).toEqual({ done: 3, total: 3, icons: 8 });
    expect(session.isRunning()).toBe(false);
  });

  it("says a row is capped instead of pretending it drew everything (D7/RULE 4)", async () => {
    const { session } = harness(() => ok(913));
    session.start(spec(["big.png"]));
    await session.settled();
    const row = session.states.get("big.png");
    expect(row.state).toBe("capped");
    expect(row.count).toBe(512);
    expect(row.icons).toBe(913);
    expect(row.message).toBe("first 512 of 913 icons");
  });

  it("reports a failing row and finishes the rest (I-68)", async () => {
    const { session } = harness((rel) => (rel === "bad.png" ? { kind: "error", message: "decode failed" } : ok(2)));
    session.start(spec(["bad.png", "good.png"]));
    await session.settled();
    expect(session.states.get("bad.png").state).toBe("error");
    expect(session.states.get("bad.png").message).toBe("decode failed");
    expect(session.states.get("good.png").state).toBe("ready");
  });

  it("stop marks the rows that never ran, and keeps what is already drawn", async () => {
    const { session } = harness((rel) => (rel === "slow.png" ? { kind: "empty" } : ok(3)));
    session.start(spec(["a.png", "b.png"]));
    session.stop();
    await session.settled();
    expect(session.states.get("a.png").state).toBe("stopped");
    expect(session.states.get("a.png").message).toBe("Not previewed");
    expect(session.isRunning()).toBe(false);
  });

  it("never leaves a revoked URL on a row, whatever the replan dropped (RULE 20)", async () => {
    const { session, revoked } = harness(() => ok(2));
    session.start(spec(["a.png", "b.png"]));
    await session.settled();
    session.start({ ...spec(["a.png", "b.png"]), split: { ...SPLIT, padding: 20 } });
    await session.settled();
    // The old settings' strips died; nothing on screen may still point at them.
    const shown = ["a.png", "b.png"].flatMap((rel) => session.states.get(rel).urls);
    expect(revoked).toEqual(["blob:s-1", "blob:s-2"]);
    expect(shown).toEqual(["blob:s-3", "blob:s-4"]);
    for (const url of revoked) expect(shown).not.toContain(url);
  });

  it("close() takes every URL with it — nothing is left to leak (D9)", async () => {
    const { session, revoked } = harness(() => ok(2));
    session.start(spec(["a.png", "b.png"]));
    await session.settled();
    session.close();
    expect(revoked).toEqual(["blob:s-1", "blob:s-2"]);
    expect(session.states.get("a.png").urls).toEqual([]);
  });

  it("an empty plan is idle at once: no running state, no work", async () => {
    let calls = 0;
    const { session } = harness(() => {
      calls++;
      return ok(1);
    });
    session.start(spec([]));
    await session.settled();
    expect(calls).toBe(0);
    expect(session.progress()).toEqual({ done: 0, total: 0, icons: 0 });
    expect(session.isRunning()).toBe(false);
  });
});

describe("previewsession — a replan keeps what the same settings already produced", () => {
  it("replays finished rows from the cache instead of reading them again", async () => {
    let calls = 0;
    const { session } = harness(() => {
      calls++;
      return ok(3, 40);
    });
    session.start(spec(["a.png", "b.png"]));
    await session.settled();
    expect(calls).toBe(2);
    const images = session.states.get("a.png").urls;
    expect(images).toHaveLength(1);
    session.start(spec(["a.png", "b.png"])); // the button pressed again: same rows, same settings
    await session.settled();
    expect(calls, "a re-run read the files again").toBe(2);
    expect(session.states.get("a.png").urls).toEqual(images); // the very same strips, still alive
    expect(session.states.get("a.png").message).toBe("3 icons");
    expect(session.progress()).toEqual({ done: 2, total: 2, icons: 6 });
  });

  it("reads only the rows the new plan added", async () => {
    const calls: string[] = [];
    const { session } = harness((rel) => {
      calls.push(rel);
      return ok(2);
    });
    session.start(spec(["a.png", "b.png", "c.png"]));
    await session.settled();
    session.start(spec(["a.png", "b.png", "c.png", "d.png"])); // one more row selected
    await session.settled();
    expect(calls).toEqual(["a.png", "b.png", "c.png", "d.png"]); // only d.png was read again
    expect(session.progress()).toEqual({ done: 4, total: 4, icons: 8 });
  });

  it("does NOT reuse strips when the settings changed (D8: the preview may not lie)", async () => {
    let calls = 0;
    const { session } = harness(() => {
      calls++;
      return ok(2);
    });
    session.start(spec(["a.png"]));
    await session.settled();
    session.start({ ...spec(["a.png"]), split: { ...SPLIT, mergeFrac: 0.05 } });
    await session.settled();
    expect(calls, "the old merge distance was reused for a new one").toBe(2);
  });

  it("lets go of the strips whose settings are gone (RULE 20: URL revoked)", async () => {
    const { session, revoked } = harness(() => ok(2));
    session.start(spec(["a.png"]));
    await session.settled();
    expect(session.states.get("a.png").urls).toHaveLength(1);
    session.start({ ...spec(["a.png"]), split: { ...SPLIT, padding: 12 } });
    await session.settled();
    expect(revoked).toEqual(["blob:s-1"]); // the old setting's strip is gone, exactly once
    expect(session.states.get("a.png").urls).toEqual(["blob:s-2"]);
  });
});
