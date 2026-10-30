// The adapter projects canonical snapshots; it must never become a second selection store.
import { act, memo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { useCheckedRows, useCheckedRow, type RegisterCheckedRow } from "../src/ui/checkedrows";

let host: HTMLDivElement;
let root: Root;
let renders = 0;
const Row = memo(function Row({ id, label, active, register }: { id: string; label: string; active: boolean; register: RegisterCheckedRow }) {
  renders++;
  const ref = useCheckedRow(id, active, register);
  return <div ref={ref} data-id={id} className={`row ${label}`} aria-current={active ? "true" : undefined}>
    <input type="checkbox" aria-label={id} /><span>{label}</span>
  </div>;
});
function Harness({ ids, checked, label = "initial", active = null }: { ids: string[]; checked: string[]; label?: string; active?: string | null }) {
  const register = useCheckedRows(checked);
  return <>{ids.map((id) => <Row key={id} id={id} label={label} active={active === id} register={register} />)}</>;
}
const row = (id: string) => host.querySelector<HTMLDivElement>(`[data-id="${id}"]`)!;
const checked = (id: string) => row(id).querySelector("input")!.checked;
beforeEach(() => { renders = 0; host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

it('projects all checkboxes/classes before commit returns, without rendering row shells', () => {
  const ids = Array.from({ length: 1000 }, (_, i) => String(i));
  act(() => root.render(<Harness ids={ids} checked={[]} />));
  expect(renders).toBe(1000);
  for (const selection of [ids, [], ids]) {
    act(() => root.render(<Harness ids={ids} checked={selection} />));
    expect(renders).toBe(1000);
    expect(host.querySelectorAll("input:checked")).toHaveLength(selection.length);
    expect(host.querySelectorAll(".selected")).toHaveLength(selection.length);
  }
});

it('preserves the snapshot after base classes/data/active row change and restores undo-like snapshots', () => {
  const ids = ["a", "b"];
  act(() => root.render(<Harness ids={ids} checked={["b"]} />));
  expect(checked("a")).toBe(false); expect(checked("b")).toBe(true);
  act(() => root.render(<Harness ids={ids} checked={["b"]} label="changed" active="b" />));
  expect(row("b").classList.contains("selected")).toBe(true);
  expect(row("b").classList.contains("changed")).toBe(true);
  expect(row("b").getAttribute("aria-current")).toBe("true");
  act(() => root.render(<Harness ids={ids} checked={["a"]} label="changed" active="a" />));
  expect(checked("a")).toBe(true); expect(checked("b")).toBe(false);
  expect(row("b").classList.contains("selected")).toBe(false);
});

it('remounts filtered/new rows from canonical hidden checks and releases detached bindings', () => {
  act(() => root.render(<Harness ids={["a", "b"]} checked={["b", "later"]} />));
  const detached = row("b");
  act(() => root.render(<Harness ids={["a"]} checked={["b", "later"]} />));
  act(() => root.render(<Harness ids={["a"]} checked={[]} />));
  expect(detached.querySelector("input")!.checked).toBe(true); // detached DOM is no longer a target
  act(() => root.render(<Harness ids={["b", "later"]} checked={["later"]} />));
  expect(checked("b")).toBe(false); expect(checked("later")).toBe(true);
  expect(host.querySelectorAll(".selected")).toHaveLength(1);
});
