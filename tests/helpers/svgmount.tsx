// svgmount.tsx — mounts the REAL Generate SVG panel (and the real history bar)
// over a FakeDir of approved pairs, and drives it like a user would (RULE 8).
// The remembered-folder store is in memory because this DOM has no IndexedDB:
// each test file wires `stored` (./svgstore) into its own vi.mock of
// ../src/batch/store.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { pairId } from "../../src/lib/pairing";
import SvgPanel from "../../src/svg/SvgPanel";
import { HistoryProvider } from "../../src/state/HistoryProvider";
import { usePrefsAutosave } from "../../src/state/usePrefsAutosave";
import HistoryBar from "../../src/ui/HistoryBar";
import { FakeDir, FakeFile } from "./fakefs";
import { stored } from "./svgstore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = () => Promise.reject(new Error("no picker"));

export const idOf = (name: string): string => pairId("architecture", name, "");

/** architecture/<name>.png + <name>_AI.png for every name, all approved. */
export function approvedRoot(names: readonly string[]): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  names.forEach((n, i) => {
    arch.children.set(`${n}.png`, new FakeFile(`${n}.png`, 12, 3000 + i, "a"));
    arch.children.set(`${n}_AI.png`, new FakeFile(`${n}_AI.png`, 20, 3100 + i, `img-${n}`));
  });
  root.children.set("architecture", arch);
  const records = names.map((n) => ({
    pair_id: idOf(n), source: `${idOf(n)}.png`, ai_result: `${idOf(n)}_AI.png`,
    decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
  }));
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records })));
  return root;
}

function Host({ children }: { children: React.ReactNode }) {
  usePrefsAutosave();
  return <>{children}</>;
}

export interface SvgMount {
  host: HTMLDivElement;
  ui: Root;
  q: (sel: string) => HTMLElement | null;
  unmount: () => Promise<void>;
}

export const settle = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

export async function mountSvg(root: FakeDir): Promise<SvgMount> {
  stored.set("__svg__", { source: root });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const ui = createRoot(host);
  await act(async () => { ui.render(<HistoryProvider><Host><SvgPanel /><HistoryBar /></Host></HistoryProvider>); });
  await settle();
  return {
    host, ui, q: (sel) => host.querySelector(sel) as HTMLElement | null,
    unmount: async () => { await act(async () => { ui.unmount(); }); host.remove(); },
  };
}

export async function click(m: SvgMount, sel: string): Promise<void> {
  await act(async () => { (m.q(sel) as HTMLElement).click(); });
  await settle();
}

/** React tracks values, so the native setter must be used to change one. */
export async function typeInto(m: SvgMount, sel: string, value: string): Promise<void> {
  const el = m.q(sel) as HTMLInputElement | HTMLTextAreaElement;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

/** Selects every approved source and opens the confirmation (a key must be stored). */
export async function openConfirm(m: SvgMount): Promise<void> {
  await click(m, "[data-testid=svg-check-all]");
  await click(m, "[data-testid=svg-generate-selected]");
}

/** Polls with real timers until the condition holds — the run is asynchronous. */
export async function until(cond: () => boolean, tries = 80): Promise<void> {
  for (let i = 0; i < tries && !cond(); i++) await settle();
}
