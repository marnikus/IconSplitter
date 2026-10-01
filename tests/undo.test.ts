// undo.test.ts — RULE 8: global undo timeline adapted from the sister app's
// UndoStore/UndoService (cap+clamp, redo-tail truncation, dedupe, frontier).
import { describe, expect, it } from "vitest";
import {
  emptyUndoSave, parseUndoSave, serializeUndoSave,
} from "../src/lib/undopersist";
import {
  MAX_HISTORY, clampStack, emptyStack, pushEntry, redoOnce, undoOnce,
  parseUndoStack, serializeUndoStack, type UndoStack,
} from "../src/lib/undo";

const S = (history: { kind: string; value: unknown }[], index: number): UndoStack => ({ history, index });

describe("clampStack", () => {
  it("caps history at MAX_HISTORY and shifts the index by the overflow", () => {
    const hist = Array.from({ length: MAX_HISTORY + 5 }, (_, i) => ({ kind: "decisions", value: i }));
    const s = clampStack(S(hist, MAX_HISTORY + 4));
    expect(s.history).toHaveLength(MAX_HISTORY);
    expect(s.history[0].value).toBe(5);
    expect(s.index).toBe(MAX_HISTORY - 1);
  });

  it("repairs bad indexes and empty histories", () => {
    expect(clampStack(S([], 7)).index).toBe(-1);
    expect(clampStack(S([{ kind: "a", value: 1 }], 9)).index).toBe(0);
    expect(clampStack(S([{ kind: "a", value: 1 }], -4)).index).toBe(-1);
  });
});

describe("pushEntry", () => {
  it("truncates the redo tail before appending", () => {
    let s = pushEntry(emptyStack(), "decisions", [1]);
    s = pushEntry(s, "decisions", [2]);
    s = undoOnce(s).stack; // index back to 0
    s = pushEntry(s, "decisions", [3]);
    expect(s.history.map((h) => h.value)).toEqual([[1], [3]]);
    expect(s.index).toBe(1);
  });

  it("skips consecutive duplicate entries", () => {
    const s = pushEntry(emptyStack(), "filter", { q: "a" });
    const again = pushEntry(s, "filter", { q: "a" });
    expect(again.history).toHaveLength(1);
    expect(again.index).toBe(0);
  });

  it("does not dedupe across different kinds or values", () => {
    let s = pushEntry(emptyStack(), "filter", { q: "a" });
    s = pushEntry(s, "sort", { q: "a" });
    expect(s.history).toHaveLength(2);
  });
});

describe("undoOnce / redoOnce", () => {
  it("walks back returning the previous value, then the empty frontier", () => {
    let s = pushEntry(emptyStack(), "decisions", "v1");
    s = pushEntry(s, "decisions", "v2");
    const u1 = undoOnce(s);
    expect(u1.out?.value).toBe("v1");
    expect(u1.out?.empty).toBeFalsy();
    const u2 = undoOnce(u1.stack);
    expect(u2.out?.empty).toBe(true); // index -1: caller restores baseline
    expect(u2.stack.index).toBe(-1);
    expect(undoOnce(u2.stack).out).toBeNull(); // nothing left to undo
  });

  it("redo walks forward and dies at the tail", () => {
    let s = pushEntry(emptyStack(), "decisions", "v1");
    s = pushEntry(s, "decisions", "v2");
    const u = undoOnce(undoOnce(s).stack); // frontier
    const r1 = redoOnce(u.stack);
    expect(r1.out?.value).toBe("v1");
    const r2 = redoOnce(r1.stack);
    expect(r2.out?.value).toBe("v2");
    expect(redoOnce(r2.stack).out).toBeNull();
  });
});

describe("persistence", () => {
  it("round-trips through serialize/parse", () => {
    const s = pushEntry(emptyStack(), "decisions", [{ pair_id: "p" }]);
    expect(parseUndoStack(serializeUndoStack(s))).toEqual(s);
  });

  it("corrupt payloads fall back to the empty stack (RULE 13)", () => {
    expect(parseUndoStack("{nope")).toEqual(emptyStack());
    expect(parseUndoStack(JSON.stringify({ history: "x", index: 1 }))).toEqual(emptyStack());
    expect(parseUndoStack(JSON.stringify({ history: [{ kind: 5, value: 1 }], index: 0 }))).toEqual(emptyStack());
  });
});

describe("undo save (stack + baseline + root)", () => {
  const rec = { pair_id: "p1", source: "a.png", ai_result: "a_AI.png", decision: "approved" as const, reviewed_at: "2026-10-01T00:00:00.000Z" };

  it("round-trips root, stack and baseline", () => {
    const stack = pushEntry(emptyStack(), "decisions", [rec]);
    const text = serializeUndoSave({ root: "root", stack, base: [rec] });
    expect(parseUndoSave(text)).toEqual({ root: "root", stack, base: [rec] });
  });

  it("corrupt or foreign payloads fall back to an empty save (RULE 13)", () => {
    expect(parseUndoSave("{oops")).toEqual(emptyUndoSave());
    expect(parseUndoSave(JSON.stringify({ root: 3, stack: "x", base: "y" }))).toEqual(emptyUndoSave());
  });

  it("keeps a valid stack when only the baseline is corrupt", () => {
    const stack = pushEntry(emptyStack(), "filter", { status: "pending" });
    const text = JSON.stringify({ root: "r", stack: JSON.parse(serializeUndoStack(stack)), base: { records: "nope" } });
    expect(parseUndoSave(text)).toEqual({ root: "r", stack, base: [] });
  });
});
