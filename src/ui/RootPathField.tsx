// RootPathField.tsx — the shared "full path" field of the toolbars (feature §2,
// I-36/I-37). Why it exists: the File System Access API gives the page the picked
// folder's NAME only, so the drive and the folders above it can never be read.
// The path is captured from the clipboard when a folder is picked (ui/pickroot,
// I-35) or applied here by one click, and every copy then hands over a path that
// works in Explorer. Storage is the single source of truth (useRootPath), so a
// path captured by any picker appears here at once; this file is only the
// control (RULE 10).

import { useState } from "react";
import { log } from "../log/logstore";
import { adoptCopiedPath } from "../lib/clipboardpath";
import { saveRootPath, type PathHow } from "../lib/rootpath";
import { useRootPath } from "./userootpath";

export default function RootPathField({ rootName, testid }: { rootName: string; testid: string }) {
  const info = useRootPath(rootName);
  // While the user is typing, the field shows exactly what they typed (the
  // stored value is normalised, which would fight the keyboard); blurring or a
  // capture from a picker returns it to the stored value.
  const [typed, setTyped] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const change = (text: string) => {
    setTyped(text);
    setNote(null);
    saveRootPath(rootName, text);
  };
  return (
    <label className="pathfield" data-testid={`${testid}-label`}>
      <span>Full path for copies</span>
      <input
        type="text" value={typed ?? info.path} spellCheck={false}
        onChange={(e) => change(e.target.value)}
        onBlur={() => setTyped(null)}
        data-testid={testid} aria-label={`Full path of ${rootName}`}
        placeholder={"Paste the folder's full path, e.g. F:\\work\\icons"}
        title="Chrome never tells a page the drive path of the folder you picked — copy the folder in Explorer (Ctrl+Shift+C) and it is captured automatically, or paste it here once"
      />
      <UseCopiedButton rootName={rootName} testid={testid} setNote={setNote} />
      <Status info={info} note={note} testid={testid} />
    </label>
  );
}

/** One click: take the path of the folder the user copied in Explorer (I-37). */
function UseCopiedButton({ rootName, testid, setNote }: { rootName: string; testid: string; setNote: (n: string | null) => void }) {
  const use = async () => {
    const path = await adoptCopiedPath(rootName);
    if (path === null) {
      setNote("Nothing path-like on the clipboard — copy the folder in Explorer first");
      return;
    }
    setNote(null);
    log({ feature: "svg", action: "root-path", detail: `${path} (from the clipboard)` });
  };
  return (
    <button type="button" className="pathfield-use" data-testid={`${testid}-use`} onClick={() => void use()}
      title="Take the path of the folder you copied in Explorer (Ctrl+Shift+C)">
      Use copied path
    </button>
  );
}

/** The states the value can be in — the reason is always stated (I-37). */
function Status({ info, note, testid }: { info: { path: string; how: PathHow | null }; note: string | null; testid: string }) {
  return (
    <em className={statusClass(info, note)} data-testid={`${testid}-note`}>
      {note ?? statusText(info)}
    </em>
  );
}

function statusText(info: { path: string; how: PathHow | null }): string {
  if (info.how === "completed") return "completed from the copied folder — check it";
  if (info.path === "") {
    return "not set — Chrome can't read the drive path; copy the folder in Explorer, then press “Use copied path”";
  }
  return "✓ every copy uses this path";
}

function statusClass(info: { path: string; how: PathHow | null }, note: string | null): string {
  if (note !== null || (info.path !== "" && info.how === "completed")) return "pathfield-note warn";
  return info.path === "" ? "pathfield-note" : "pathfield-note ok";
}
