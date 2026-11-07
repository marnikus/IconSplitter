// useBuilderShell.ts — everything the builder's shell needs before a sheet exists:
// whether the browser can read folders, the picked root, the scan's scope and one
// toast. P0 deliberately ships NO scan: chooseRoot/rescan only say so, so the panel
// can never claim a folder it has not read (RULE 4). P1 replaces this hook's body
// with the scan bridge (pick → capture path → walk → commit) and nothing else.

import { useCallback, useState } from "react";
import { fsSupported } from "../batch/picker";
import type { BuilderScope } from "./BuilderSourceBar";

export interface BuilderShell {
  supported: boolean;
  /** The picked folder's name, "" when nothing is picked. */
  rootName: string;
  /** The last scan's counts, null until a scan commits. */
  scope: BuilderScope | null;
  /** Non-null while a scan runs (its own words are the button's label). */
  busy: string | null;
  toast: string | null;
  chooseRoot: () => void;
  rescan: () => void;
  say: (message: string) => void;
}

/** The P0 answer, said out loud rather than shown as a dead button. */
export const SCAN_NOT_READY = "Folder scanning arrives with the icon library (next phase)";

export function useBuilderShell(): BuilderShell {
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((message: string) => setToast(message), []);
  const notReady = useCallback(() => say(SCAN_NOT_READY), [say]);
  return {
    supported: fsSupported(),
    rootName: "",
    scope: null,
    busy: null,
    toast,
    chooseRoot: notReady,
    rescan: notReady,
    say,
  };
}
