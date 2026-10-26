// A list-local presentation adapter. React/store checked ids remain the ONLY state.
// Project the committed snapshot before paint instead of reconciling N checkbox trees.
// Row contents stay mounted; native changes still invoke the existing state/history handlers.
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

interface Binding { node: HTMLDivElement; input: HTMLInputElement }
export type RegisterCheckedRow = (id: string, node: HTMLDivElement | null) => void;

function project(binding: Binding, checked: boolean): void {
  if (binding.input.checked !== checked) binding.input.checked = checked;
  if (binding.node.classList.contains("selected") !== checked) binding.node.classList.toggle("selected", checked);
}

export function useCheckedRows(checked: readonly string[]): RegisterCheckedRow {
  const bindings = useRef(new Map<string, Binding>());
  const current = useRef<ReadonlySet<string>>(new Set(checked));
  const register = useCallback<RegisterCheckedRow>((id, node) => {
    if (node === null) { bindings.current.delete(id); return; }
    const input = node.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (input === null) return;
    const binding = { node, input };
    bindings.current.set(id, binding);
    project(binding, current.current.has(id));
  }, []);
  useLayoutEffect(() => {
    current.current = new Set(checked);
    for (const [id, binding] of bindings.current) project(binding, current.current.has(id));
  }, [checked]);
  return register;
}

/** Reapply after row-data renders too: React may have replaced its base className. */
export function useCheckedRow(id: string, active: boolean, register: RegisterCheckedRow) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    register(id, ref.current);
    return () => register(id, null);
  });
  useEffect(() => { if (active) ref.current?.scrollIntoView?.({ block: "nearest" }); }, [active]);
  return ref;
}
