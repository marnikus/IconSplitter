// @vitest-environment node
// register_progress.test.ts — the model behind the bar both register passes report
// through (2026-11-02). One folder at a time: what is being read, how many folders
// settled, and what they left behind — the same reporter the other process bars use.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  beginRegister, clearRegister, registerDetail, registerNote, registerSlot, registerTitle,
} from "../src/svg/registerprogress";
import type { SvgRefs } from "../src/svg/types";

const refs = (): SvgRefs => ({ root: { current: null }, metas: new Map() } as unknown as SvgRefs);

describe("the register progress model", () => {
  it("starts empty, then names the folder it reads and counts what settled", () => {
    const r = refs();
    expect(registerSlot(r).value).toBeNull();
    const bar = beginRegister(r, "svg", 2);
    expect(registerSlot(r).value).toMatchObject({ kind: "svg", done: 0, total: 2, phase: "running", registered: 0, skipped: 0 });
    bar.reading("fog_AI.png");
    expect(registerSlot(r).value).toMatchObject({ current: "fog_AI.png", done: 0 });
    bar.settled({ registered: 1, skipped: 0 });
    expect(registerSlot(r).value).toMatchObject({ done: 1, total: 2, registered: 1, phase: "running" });
    bar.reading("court_AI.png");
    bar.settled({ registered: 0, skipped: 2 });
    expect(registerSlot(r).value).toMatchObject({ done: 2, registered: 1, skipped: 2 });
    bar.finish();
    expect(registerSlot(r).value).toMatchObject({ done: 2, total: 2, phase: "complete" });
  });

  it("gives every pass its own id, so the bar's cue is one per run", () => {
    const r = refs();
    const first = beginRegister(r, "images", 1);
    const id = registerSlot(r).value?.id;
    first.finish();
    beginRegister(r, "images", 1);
    expect(registerSlot(r).value?.id).not.toBe(id);
    expect(typeof id).toBe("string");
  });

  it("says what it is doing in the tab's words, and what it found", () => {
    const r = refs();
    const bar = beginRegister(r, "svg", 2);
    const running = registerSlot(r).value!;
    expect(registerTitle(running)).toBe("Registering existing SVGs · 2 folders");
    expect(registerDetail(running)).toBe("Reading the selected folders…");
    bar.reading("fog_AI.png");
    expect(registerDetail(registerSlot(r).value!)).toBe("fog_AI.png");
    bar.settled({ registered: 1, skipped: 2 });
    bar.finish();
    const done = registerSlot(r).value!;
    expect(registerTitle(done)).toBe("Registering existing SVGs complete");
    expect(registerDetail(done)).toBe("1 registered · 2 skipped");
    expect(registerTitle({ ...done, kind: "images", total: 1 })).toBe("Registering AI sources complete");
  });

  it("tells the user how many new files this run registered, next to what is left", () => {
    const r = refs();
    const bar = beginRegister(r, "svg", 3);
    expect(registerNote(registerSlot(r).value!)).toBe("no new files yet");
    bar.settled({ registered: 1, skipped: 0 });
    expect(registerNote(registerSlot(r).value!)).toBe("1 new file registered");
    bar.settled({ registered: 2, skipped: 1 });
    expect(registerNote(registerSlot(r).value!)).toBe("3 new files registered");
    bar.settled({ registered: 0, skipped: 0 });
    bar.finish();
    // The finished bar already says it in its detail line — never twice.
    expect(registerDetail(registerSlot(r).value!)).toBe("3 registered · 1 skipped");
    expect(registerNote(registerSlot(r).value!)).toBe("");
  });

  it("clears the bar on its ✕ and after a later pass, never leaving a stale one", () => {
    const r = refs();
    beginRegister(r, "svg", 1).finish();
    clearRegister(r);
    expect(registerSlot(r).value).toBeNull();
  });

  it("keeps the tab's bar state per refs object — two tabs never share one bar", () => {
    const a = refs();
    const b = refs();
    beginRegister(a, "svg", 3);
    expect(registerSlot(b).value).toBeNull();
    expect(registerSlot(a).value).toMatchObject({ total: 3 });
  });
});

describe("the bar the user sees", () => {
  it("is mounted by the Generate SVG panel, next to the generation and image bars", () => {
    const panel = readFileSync("src/svg/SvgJobProgress.tsx", "utf8");
    expect(panel).toContain("<SvgRegisterProgress refs={g.refs} />");
    // Same portal stack as every other process bar, so it cannot be missed.
    const bar = readFileSync("src/svg/SvgRegisterProgress.tsx", "utf8");
    expect(bar).toContain('getElementById("svg-progress-mount")');
    expect(bar).toContain("ProcessProgressBar");
  });
});
