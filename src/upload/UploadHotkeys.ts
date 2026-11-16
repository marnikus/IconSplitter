// UploadHotkeys.ts — visible-order active-row navigation for approved SVGs.

import { useEffect, useRef } from "react";
import { nextVisibleId } from "../lib/reviewselect";
import { isTextField } from "../selection/hotkeys";
import { isNativeListKeyTarget } from "../ui/rowgesture";
import type { UploadRow } from "./types";

interface Target {
  visible: UploadRow[];
  activeId: string | null;
  setActive: (id: string) => void;
}

export function useUploadHotkeys(target: Target, enabled: boolean): void {
  const latest = useRef(target);
  latest.current = target;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (e.ctrlKey || e.metaKey || e.altKey || isTextField(e.target) || isNativeListKeyTarget(e.target)) return;
      const { visible, activeId, setActive } = latest.current;
      const next = nextVisibleId(visible.map((row) => row.source.id), activeId, e.key === "ArrowDown" ? 1 : -1);
      if (!next) return;
      e.preventDefault();
      setActive(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
