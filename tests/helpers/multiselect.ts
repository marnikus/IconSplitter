// multiselect.ts — drive a ui/MultiSelect filter like the old single-choice
// <select> (2026-11-06): reset it to "all", then tick exactly `value`. Two acts,
// so the second click sees the props the first one produced.
import { act } from "react";

/** The filter's "all" checkbox is always its first option. */
function allBox(root: ParentNode, testid: string): HTMLInputElement {
  return root.querySelector(`[data-testid="${testid}-menu"] input`) as HTMLInputElement;
}

/** Sets a MultiSelect to exactly one value ("all" = no filter). */
export async function pickOnly(root: ParentNode, testid: string, value: string): Promise<void> {
  if (!allBox(root, testid).checked) await act(async () => { allBox(root, testid).click(); });
  const box = root.querySelector(`[data-testid="${testid}-opt-${value}"]`) as HTMLInputElement | null;
  if (box === null) throw new Error(`no option ${value} in ${testid}`);
  if (box !== allBox(root, testid) && !box.checked) await act(async () => { box.click(); });
}

/** True when the element is a MultiSelect button rather than a native select. */
export function isMultiSelect(el: Element | null): boolean {
  return el !== null && el.tagName === "BUTTON" && el.classList.contains("multi-select-trigger");
}
