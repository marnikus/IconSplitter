// RootPathField.tsx — the shared "full path" field of the toolbars (feature
// §2). Why it exists: the File System Access API gives the page the picked
// folder's NAME only, so the drive and the folders above it can never be read —
// the user pastes the real path once (Explorer's address bar or its "Copy as
// path"), and every copy action then hands over a path that works in Explorer.
// The value is remembered per folder name by lib/rootpath, which is also the
// single reader of it, so this file is only the control (RULE 10).

import { useState } from "react";
import { log } from "../log/logstore";
import { loadRootPath, saveRootPath } from "../lib/rootpath";

export default function RootPathField({ rootName, testid }: { rootName: string; testid: string }) {
  const [draft, setDraft] = useState(() => loadRootPath(rootName));
  const [saved, setSaved] = useState(() => loadRootPath(rootName) !== "");
  const change = (text: string) => {
    setDraft(text);
    saveRootPath(rootName, text);
    const stored = loadRootPath(rootName);
    setSaved(stored !== "");
    log({ feature: "svg", action: "root-path", detail: stored === "" ? `forgot the full path of ${rootName}` : stored });
  };
  return (
    <label className="pathfield" data-testid={`${testid}-label`}>
      <span>Full path for copies</span>
      <input
        type="text" value={draft} spellCheck={false} onChange={(e) => change(e.target.value)}
        data-testid={testid} aria-label={`Full path of ${rootName}`}
        placeholder="Paste the folder's full path, e.g. F:\\work\\icons"
        title="A browser cannot see the drive or the folders above the one you picked — paste its full path once and every copy will use it"
      />
      {!saved && <em data-testid={`${testid}-note`}>not set — copies name the folder only</em>}
    </label>
  );
}
