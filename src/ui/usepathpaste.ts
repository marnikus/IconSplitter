// usepathpaste.ts — the picked folder's full path, captured from a paste (I-47).
// The pick-time clipboard read is refused where the app runs as a local file,
// leaving the row on the folder name; a paste event needs no permission, so a
// paste after the pick adopts the path through the same match + save rules as
// the pick (I-35/I-39) and says so once. A paste aimed at a field, pasted text
// that is no folder path, and a repeat of the known path all stay silent.

import { useEffect } from "react";
import { adoptCopiedText } from "../lib/clipboardpath";
import { loadRootPathInfo } from "../lib/rootpath";
import { isTextField } from "../selection/hotkeys";
import { pickMessage } from "./pickroot";

/** Listens for a path paste while `rootName` is picked; says one line per capture. */
export function usePastePathCapture(rootName: string, say: (msg: string, err?: boolean) => void): void {
  useEffect(() => {
    if (rootName === "") return;
    const onPaste = (e: ClipboardEvent) => {
      if (isTextField(e.target)) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (text === "") return;
      const before = loadRootPathInfo(rootName);
      const info = adoptCopiedText(rootName, text);
      if (info.path === "" || (info.path === before.path && info.how === before.how)) return;
      const message = pickMessage(info, "paste");
      if (message !== null) say(message);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [rootName, say]);
}
