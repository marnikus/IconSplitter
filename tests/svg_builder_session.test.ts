// @vitest-environment node
// svg_builder_session.test.ts — TDD for the seventh tab's restart state.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUILDER, DEFAULT_SESSION, TAB_IDS, parseSession, serializeSession, SESSION_VERSION,
} from "../src/lib/session";
import { getAppState, initialAppState, patchBuilder, resetAppStore, sessionOf } from "../src/state/appstore";
import { parseBuilderUndoPatch } from "../src/lib/svgBuilder/undo";


const NOW = "2026-11-07T12:00:00.000Z";

describe("SVG builder session slice", () => {
  it("registers the svgBuilder tab without breaking older tab ids", () => {
    expect(TAB_IDS).toContain("svgBuilder");
    expect(TAB_IDS).toContain("upload");
    expect(TAB_IDS).toContain("stockUpload");
  });

  it("restores a saved builder tab and its stable checked ids", () => {
    const saved = serializeSession({
      ...DEFAULT_SESSION, tab: "svgBuilder",
      builder: { checked: ["a", "b"], activeId: "b", anchorId: "a" },
    }, NOW);
    const parsed = parseSession(saved);
    expect(parsed.tab).toBe("svgBuilder");
    expect(parsed.builder.checked).toEqual(["a", "b"]);
    expect(parsed.builder.activeId).toBe("b");
  });

  it("keeps the builder's locks and exclusions across a reload, dropping junk", () => {
    const saved = serializeSession({ ...DEFAULT_SESSION, tab: "svgBuilder",
      builder: { checked: ["a", "b"], activeId: "a", anchorId: "a", lockedIds: ["a"], excludedIds: ["z"] } }, NOW);
    const parsed = parseSession(saved);
    expect(parsed.builder.lockedIds).toEqual(["a"]);
    expect(parsed.builder.excludedIds).toEqual(["z"]);
    const junk = JSON.parse(saved);
    junk.builder.lockedIds = ["ok", 7, null];
    delete junk.builder.excludedIds;
    expect(parseSession(JSON.stringify(junk)).builder).toMatchObject({ lockedIds: ["ok"], excludedIds: [] });
  });

  it("defaults a missing or corrupt builder slice (RULE 13)", () => {
    const missing = JSON.stringify({ v: SESSION_VERSION, tab: "svgBuilder" });
    expect(parseSession(missing).builder).toEqual(DEFAULT_BUILDER);
    const bad = JSON.stringify({ ...DEFAULT_SESSION, v: SESSION_VERSION, builder: { checked: "no" } });
    expect(parseSession(bad).builder).toEqual(DEFAULT_BUILDER);
    expect(parseSession("[]").builder).toEqual(DEFAULT_BUILDER);
  });

  it("projects the app store back into the session without duplicating config", () => {
    resetAppStore(initialAppState({ ...DEFAULT_SESSION, tab: "svgBuilder" }, getAppState().prefs));
    patchBuilder({ checked: ["x"], activeId: "x" });
    const snapshot = sessionOf(getAppState());
    expect(snapshot.tab).toBe("svgBuilder");
    expect(snapshot.builder.checked).toEqual(["x"]);
    expect(snapshot).not.toHaveProperty("config");
  });

  it("refuses a foreign undo payload instead of trusting it", () => {
    expect(parseBuilderUndoPatch(null)).toBeNull();
    expect(parseBuilderUndoPatch({ config: "nope", seed: 1, lockedIds: [], recipe: {} })).toBeNull();
  });
});
