// historymount.tsx — shared harness for the history UI tests: mounts the real
// provider + bar and hands back the API a panel would use.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HistoryProvider, useHistory, type HistoryApi } from "../../src/state/HistoryProvider";
import HistoryBar from "../../src/ui/HistoryBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface HistoryHarness {
  host: HTMLDivElement;
  root: Root;
  api: HistoryApi;
  q: (sel: string) => HTMLElement | null;
  btn: (sel: string) => HTMLButtonElement;
  click: (sel: string) => Promise<void>;
  chord: (key: string, shift?: boolean, target?: EventTarget) => Promise<void>;
  unmount: () => void;
}

export function mountHistory(onApi: (api: HistoryApi) => void): HistoryHarness {
  let api!: HistoryApi;
  function Probe() {
    api = useHistory();
    onApi(api);
    return null;
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <HistoryProvider>
        <HistoryBar />
        <Probe />
      </HistoryProvider>,
    );
  });
  return {
    host, root, api,
    q: (sel) => host.querySelector(sel) as HTMLElement | null,
    btn: (sel) => host.querySelector(sel) as HTMLButtonElement,
    click: async (sel) => { await act(async () => { (host.querySelector(sel) as HTMLButtonElement).click(); }); },
    chord: async (key, shift = false, target: EventTarget = window) => {
      await act(async () => {
        target.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, shiftKey: shift, bubbles: true }));
      });
    },
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}
