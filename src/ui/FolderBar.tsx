// FolderBar.tsx — the folder control Selection V2 and Generate SVG share
// (design 2026-10-05-folder-ui, revised 2026-10-05-pick-level-scope). It owns
// exactly two things: the ONE action that opens the folder dialog, and the
// read-only row that states the full path the pick captured (I-35/I-36).
//
// Why this shape: the browser is told only the picked folder's NAME, so the
// name is a fact about the scan — never a button label, and the path is never a
// field to type into (the paste field, "Use copied path" and every copied-path
// status were removed by request). The row is plain text: what the app knows,
// stated, with nothing to press.
//
// Once a folder IS open the row always says something (reported 2026-10-05: the
// folder was chosen and the row stayed blank, which reads as a broken feature).
// A captured path shows the path; an unknown one says WHY it is unknown and the
// one action that fixes it — still without a control of any kind.

/** The one way to open a folder, in either tab. */
export function OpenFolderButton({ testid, onClick }: { testid: string; onClick: () => void }) {
  return (
    <button type="button" className="folder-open" data-testid={testid} onClick={onClick}>
      Open folder
    </button>
  );
}

/**
 * The picked folder's complete path, below the controls. Before a pick there is
 * nothing to say (no row); while a folder is open the row never stays blank —
 * the path when it is known, the reason and the fix when it is not.
 */
export function RootPathRow({ testid, rootName, path }: { testid: string; rootName: string; path: string }) {
  if (rootName === "") return null;
  if (path === "") {
    return (
      <p className="folder-path unknown" data-testid={testid}>
        Full path unknown — copy the folder in Explorer (Ctrl+Shift+C) before pressing Open folder
      </p>
    );
  }
  return (
    <p className="folder-path" data-testid={testid} title={path}>
      {path}
    </p>
  );
}
