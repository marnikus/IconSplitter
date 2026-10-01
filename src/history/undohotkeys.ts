// undohotkeys.ts — app-level keyboard shortcuts for the global timeline
// (request §6): Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo. A text
// field keeps its own native undo (a11y): the user's caret context wins.

import { useEffect } from "react";
import { historyShortcut } from "../lib/history";
import { isTextField } from "../lib/dom";
import { redo, undo } from "./historybus";

export function useUndoHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = historyShortcut(e);
      if (!dir || isTextField(e.target)) return;
      e.preventDefault();
      if (dir === "undo") undo();
      else redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
