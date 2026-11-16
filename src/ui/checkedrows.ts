// A list-local presentation adapter. React/store checked ids remain the ONLY state.
// Project the committed snapshot before paint instead of reconciling N checkbox trees.
// Row contents stay mounted; native changes still invoke the existing state/history handlers.
//
// 2026-10-26: the SAME registry now projects the ACTIVE row (class, aria-current,
// optional roving tabIndex and the scroll), so a selection or an arrow key no
// longer changes a row's props. Lists memoize their row element array and an
// Up/Down move touches exactly two DOM nodes instead of recreating 1,000 rows.
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";

interface Binding { node: HTMLDivElement; input: HTMLInputElement }

// 2026-11-06: an undo / redo restores the active row WITHOUT scrolling to it —
// the page stays where the user is. The history holds the scroll briefly.
let scrollHeldUntil = 0;
const HOLD_MS = 600;

/** The next active-row changes (for a moment) do not scroll the list. */
export function holdRowScroll(): void {
  scrollHeldUntil = Date.now() + HOLD_MS;
}

const scrollHeld = (): boolean => Date.now() < scrollHeldUntil;
export type RegisterCheckedRow = (id: string, node: HTMLDivElement | null) => void;

function projectChecked(binding: Binding, checked: boolean): void {
  if (binding.input.checked !== checked) binding.input.checked = checked;
  if (binding.node.classList.contains("selected") !== checked) binding.node.classList.toggle("selected", checked);
}

/** Active state is a projection too: two nodes change, not the whole list. */
function projectActive(binding: Binding, active: boolean, roving: boolean): void {
  if (binding.node.classList.contains("active") !== active) binding.node.classList.toggle("active", active);
  const current = binding.node.getAttribute("aria-current");
  if (active && current !== "true") binding.node.setAttribute("aria-current", "true");
  if (!active && current !== null) binding.node.removeAttribute("aria-current");
  // A roving list has ONE tab stop: only the active row is reachable by Tab.
  // Other lists keep their own base tabIndex (Batch disables missing rows).
  if (roving && binding.node.tabIndex !== (active ? 0 : -1)) binding.node.tabIndex = active ? 0 : -1;
}

/** Project the committed snapshot onto every mounted row before paint. */
function useCheckedProjection(checked: readonly string[], bindings: RefObject<Map<string, Binding>>, current: RefObject<ReadonlySet<string>>): void {
  useLayoutEffect(() => {
    current.current = new Set(checked);
    for (const [id, binding] of bindings.current) projectChecked(binding, current.current.has(id));
  }, [checked, bindings, current]);
}

/** Move the active projection from the previous row to the new one (two nodes). */
function useActiveProjection(activeId: string | null | undefined, bindings: RefObject<Map<string, Binding>>, roving: RefObject<boolean>): void {
  const shown = useRef<string | null | undefined>(activeId);
  useLayoutEffect(() => {
    if (activeId === undefined || shown.current === activeId) return;
    const previous = shown.current;
    shown.current = activeId;
    if (previous !== null && previous !== undefined) {
      const old = bindings.current.get(previous);
      if (old) projectActive(old, false, roving.current);
    }
    if (activeId === null) return;
    const next = bindings.current.get(activeId);
    if (next) projectActive(next, true, roving.current);
  }, [activeId, bindings, roving]);
  useEffect(() => {
    if (activeId === null || activeId === undefined || scrollHeld()) return;
    bindings.current.get(activeId)?.node.scrollIntoView?.({ block: "nearest" });
  }, [activeId, bindings]);
}

/**
 * `activeId` is OPTIONAL: `undefined` means this list renders the active row
 * itself (the legacy adapter), `null` means "no active row" and the registry
 * owns the projection.
 */
export function useCheckedRows(checked: readonly string[], activeId?: string | null, roving = false): RegisterCheckedRow {
  const bindings = useRef(new Map<string, Binding>());
  const current = useRef<ReadonlySet<string>>(new Set(checked));
  const active = useRef<string | null | undefined>(activeId);
  active.current = activeId;
  const rovingRef = useRef(roving);
  rovingRef.current = roving;
  // After a reload the active row is known before its row exists (the rows load
  // later): the first time it appears it is scrolled into view, once (2026-11-06).
  const revealed = useRef(false);
  const register = useCallback<RegisterCheckedRow>((id, node) => {
    if (node === null) { bindings.current.delete(id); return; }
    if (!revealed.current && active.current === id) {
      revealed.current = true;
      if (!bindings.current.has(id)) window.setTimeout(() => { if (!scrollHeld()) node.scrollIntoView?.({ block: "nearest" }); }, 60);
    }
    const input = node.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (input === null) return;
    const binding = { node, input };
    bindings.current.set(id, binding);
    projectChecked(binding, current.current.has(id));
    if (active.current !== undefined) projectActive(binding, active.current === id, rovingRef.current);
  }, []);
  useCheckedProjection(checked, bindings, current);
  useActiveProjection(activeId, bindings, rovingRef);
  return register;
}

/** Reapply after row-data renders too: React may have replaced its base className. */
export function useCheckedRow(id: string, active: boolean, register: RegisterCheckedRow) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    register(id, ref.current);
    return () => register(id, null);
  });
  useEffect(() => { if (active && !scrollHeld()) ref.current?.scrollIntoView?.({ block: "nearest" }); }, [active]);
  return ref;
}

/**
 * The row end of a projected list: register on every render (so a data render
 * that rewrote className/aria-current/tabIndex is repaired) and let the registry
 * own checked, active, focus and scrolling.
 */
export function useRowBinding(id: string, register: RegisterCheckedRow) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    register(id, ref.current);
    return () => register(id, null);
  });
  return ref;
}
