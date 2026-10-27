import { useEffect } from "react";
import { nextVisibleId } from "../lib/reviewselect";
import { isTextField } from "../selection/hotkeys";
import { isNativeListKeyTarget } from "../ui/rowgesture";
import { useHistoryActions } from "../state/HistoryProvider";
import { commitStockSelection } from "./selection";
import { stockState } from "./state";
export function useStockNavigation(ids: string[], enabled: boolean): void {
  const history = useHistoryActions();
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown"].includes(e.key) || e.ctrlKey || e.metaKey || e.altKey || isTextField(e.target) || isNativeListKeyTarget(e.target)) return;
      const selection = stockState().selection, next = nextVisibleId(ids, selection.active, e.key === "ArrowDown" ? 1 : -1);
      if (next) { e.preventDefault(); commitStockSelection({ ...selection, active: next, anchor: next }, history); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [ids, enabled, history]);
}
